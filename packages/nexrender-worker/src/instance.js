const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { createClient } = require('@nexrender/api')
const { init, render } = require('@nexrender/core')
const { getRenderingStatus } = require('@nexrender/types/job')
const { withTimeout } = require('@nexrender/core/src/helpers/timeout');
const pkg = require('../package.json')

const NEXRENDER_API_POLLING = process.env.NEXRENDER_API_POLLING || 30 * 1000;
const NEXRENDER_TOLERATE_EMPTY_QUEUES = process.env.NEXRENDER_TOLERATE_EMPTY_QUEUES;
const NEXRENDER_PICKUP_TIMEOUT = process.env.NEXRENDER_PICKUP_TIMEOUT || 60 * 1000; // 60 second timeout by default
const NEXRENDER_STATUS_UPDATE_INTERVAL = process.env.NEXRENDER_STATUS_UPDATE_INTERVAL || 30 * 1000; // 30 seconds by default
const LOCK_FILE_NAME = process.env.NEXRENDER_LOCK_FILE_NAME || '.nexrender-worker.lock';

const delay = amount => new Promise(resolve => setTimeout(resolve, amount))

const checkLockFile = (settings) => {
    const lockFilePath = path.join(path.dirname(process.execPath), LOCK_FILE_NAME);
    try {
        if (fs.existsSync(lockFilePath)) {
            settings.logger.log('[worker] Lock file detected, initiating graceful shutdown...');
            fs.unlinkSync(lockFilePath);
            return true;
        }
    } catch (err) {
        settings.logger.error(`[worker] Error handling lock file: ${err.message}`);
    }
    return false;
}

const createWorker = () => {
    let emptyReturns = 0;
    let active = false;
    let settingsRef = null;
    let stop_datetime = null;
    let currentJob = null; // Keep for backward compatibility
    let activeJobs = new Map(); // Map of job UID to job object for concurrent processing
    let client = null;
    let serverHost = null;
    let startTime = null;
    let totalJobsProcessed = 0;
    let totalJobsFinished = 0;
    let totalJobsError = 0;
    let lastJobPickupTime = null;
    let statusUpdateInterval = null;
    let maxConcurrentJobs = 1; // Default to 1 for backward compatibility

    // New function to handle interruption
    const handleInterruption = async () => {
        // Handle all active jobs
        const jobsToReturn = Array.from(activeJobs.values());
        if (jobsToReturn.length > 0) {
            settingsRef.logger.log(`[worker] Interruption signal received. Returning ${jobsToReturn.length} job(s) to queue...`);
            for (const job of jobsToReturn) {
                try {
                    job.onRenderProgress = null;
                    job.state = 'queued';
                    await client.updateJob(job.uid, getRenderingStatus(job));
                    settingsRef.logger.log(`[${job.uid}] Job state updated to 'queued' successfully.`);
                } catch (err) {
                    settingsRef.logger.error(`[${job.uid}] Failed to update job state: ${err.message}`);
                }
            }
        }
        // Also handle single currentJob for backward compatibility
        if (currentJob && !activeJobs.has(currentJob.uid)) {
            settingsRef.logger.log(`[${currentJob.uid}] Interruption signal received. Updating job state to 'queued'...`);
            currentJob.onRenderProgress = null;
            currentJob.state = 'queued';
            try {
                await client.updateJob(currentJob.uid, getRenderingStatus(currentJob));
                settingsRef.logger.log(`[${currentJob.uid}] Job state updated to 'queued' successfully.`);
            } catch (err) {
                settingsRef.logger.error(`[${currentJob.uid}] Failed to update job state: ${err.message}`);
            }
        }
        active = false;
        process.exit(0);
    };

    const nextJob = async (client, settings) => {
        do {
            try {
                if (stop_datetime !== null && new Date() > stop_datetime) {
                    active = false;
                    return null
                }

                // Check for lock file before proceeding
                if (checkLockFile(settings)) {
                    active = false;
                    return null;
                }

                settings.logger.log(`[worker] checking for new jobs...`);

                let job = await withTimeout(
                    settings.tagSelector ?
                        client.pickupJob(settings.tagSelector) :
                        client.pickupJob(),
                    NEXRENDER_PICKUP_TIMEOUT,
                    'Job pickup request timed out'
                );

                if (job && job.uid) {
                    emptyReturns = 0;
                    lastJobPickupTime = new Date().toISOString();
                    return job
                } else {
                    // no job was returned by the server. If enough checks have passed, and the exit option is set, deactivate the worker
                    emptyReturns++;
                    settings.logger.log(`[worker] no jobs available (attempt ${emptyReturns}${settings.tolerateEmptyQueues ? ` of ${settings.tolerateEmptyQueues}` : ''})`)
                    if (settings.exitOnEmptyQueue && emptyReturns > settings.tolerateEmptyQueues) {
                        settings.logger.log(`[worker] max empty queue attempts reached, deactivating worker`)
                        active = false;
                    }
                }

            } catch (err) {
                settings.logger.error(`[worker] error checking for jobs: ${err.message}`);
                if (settings.stopOnError) {
                    throw err;
                } else {
                    console.error(err)
                    console.error("render process stopped with error...")
                    console.error("continue listening next job...")
                }
            }

            if (active) {
                settings.logger.log(`[worker] waiting ${settings.polling || NEXRENDER_API_POLLING}ms before next check...`);
                await delay(settings.polling || NEXRENDER_API_POLLING)
            }
        } while (active)
    }

    /**
     * Starts worker "thread" of continious loop
     * of fetching queued projects and rendering them
     * @param  {String} host
     * @param  {String} secret
     * @param  {Object} settings
     * @return {Promise}
     */
    const start = async (host, secret, settings, headers) => {
        settings = init(Object.assign({
            process: 'nexrender-worker',
            stopOnError: false,
            logger: console,
            handleInterruption: false,
        }, settings))

        settingsRef = settings;
        active = true;
        serverHost = host;
        startTime = Date.now();
        
        // Set max concurrent jobs (default: 1 for backward compatibility)
        maxConcurrentJobs = settings.maxConcurrentJobs || 1;
        if (maxConcurrentJobs < 1) maxConcurrentJobs = 1;

        settings.logger.log('starting nexrender-worker with following settings:')
        Object.keys(settings).forEach(key => {
            settings.logger.log(` - ${key}: ${settings[key]}`)
        })

        if (typeof settings.tagSelector == 'string') {
            settings.tagSelector = settings.tagSelector.replace(/[^a-z0-9, ]/gi, '')
        }
        // if there is no setting for how many empty queues to tolerate, make one from the
        // environment variable, or the default (which is zero)
        if (!(typeof settings.tolerateEmptyQueues == 'number')) {
            settings.tolerateEmptyQueues = NEXRENDER_TOLERATE_EMPTY_QUEUES;
        }

        headers = headers || {};
        headers['user-agent'] = ('nexrender-worker/' + pkg.version + ' ' + (headers['user-agent'] || '')).trim();

        client = createClient({ host, secret, headers, name: settings.name });

        // Function to send worker status to server
        const sendStatusToServer = async () => {
            if (!active || !client) return;
            
            try {
                const status = getStatus();
                const statusJson = JSON.stringify(status);
                
                // Parse the host URL
                const url = new URL(`${host}/api/v1/workers/status`);
                const isHttps = url.protocol === 'https:';
                const httpModule = isHttps ? https : http;
                
                const requestHeaders = {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(statusJson),
                    ...headers
                };
                
                if (secret) {
                    requestHeaders['nexrender-secret'] = secret;
                }
                
                if (settings.name) {
                    requestHeaders['nexrender-name'] = settings.name;
                }

                const options = {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname,
                    method: 'POST',
                    headers: requestHeaders
                };

                await new Promise((resolve, reject) => {
                    const req = httpModule.request(options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => { data += chunk; });
                        res.on('end', () => {
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                resolve();
                            } else {
                                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                            }
                        });
                    });

                    req.on('error', (err) => {
                        reject(err);
                    });

                    req.write(statusJson);
                    req.end();
                });
            } catch (err) {
                // Don't log errors for status updates to avoid spam
                // Only log if debug mode is enabled
                if (settings.debug) {
                    settings.logger.log(`[worker] error sending status to server: ${err.message}`);
                }
            }
        };

        // Function to check for restart signals from server
        const checkRestartSignal = async () => {
            if (!active || !client) return false;
            
            try {
                const url = new URL(`${host}/api/v1/workers/restart-signal`);
                const isHttps = url.protocol === 'https:';
                const httpModule = isHttps ? https : http;
                
                const requestHeaders = {
                    ...headers
                };
                
                if (secret) {
                    requestHeaders['nexrender-secret'] = secret;
                }
                
                if (settings.name) {
                    requestHeaders['nexrender-name'] = settings.name;
                }

                const options = {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname,
                    method: 'GET',
                    headers: requestHeaders
                };

                const response = await new Promise((resolve, reject) => {
                    const req = httpModule.request(options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => { data += chunk; });
                        res.on('end', () => {
                            try {
                                const parsed = JSON.parse(data);
                                resolve({ statusCode: res.statusCode, body: parsed });
                            } catch (err) {
                                reject(err);
                            }
                        });
                    });

                    req.on('error', (err) => {
                        reject(err);
                    });

                    // Set timeout (5 seconds)
                    req.setTimeout(5000, () => {
                        req.destroy();
                        reject(new Error('Request timeout'));
                    });

                    req.end();
                });

                if (response.statusCode === 200 && response.body.restart === true) {
                    settings.logger.log(`[worker] restart signal received from server at ${response.body.requestedAt}`);
                    return true;
                }
                
                return false;
            } catch (err) {
                // Silently fail - don't spam logs
                if (settings.debug) {
                    settings.logger.log(`[worker] error checking restart signal: ${err.message}`);
                }
                return false;
            }
        };

        // Handle restart gracefully
        const handleRestart = async () => {
            settings.logger.log('[worker] initiating graceful restart...');
            
            // Stop accepting new jobs
            active = false;
            
            // Clear status update interval
            if (statusUpdateInterval) {
                clearInterval(statusUpdateInterval);
                statusUpdateInterval = null;
            }
            
            // If there are active jobs, try to update them to queued
            const jobsToReturn = Array.from(activeJobs.values());
            if (jobsToReturn.length > 0 && client) {
                settings.logger.log(`[worker] returning ${jobsToReturn.length} active job(s) to queue due to restart...`);
                for (const job of jobsToReturn) {
                    try {
                        job.onRenderProgress = null;
                        job.state = 'queued';
                        await client.updateJob(job.uid, getRenderingStatus(job));
                        settings.logger.log(`[${job.uid}] job returned to queue due to restart`);
                    } catch (err) {
                        settings.logger.log(`[${job.uid}] error updating job state: ${err.message}`);
                    }
                }
            }
            // Also handle single currentJob for backward compatibility
            if (currentJob && !activeJobs.has(currentJob.uid) && client) {
                try {
                    currentJob.onRenderProgress = null;
                    currentJob.state = 'queued';
                    await client.updateJob(currentJob.uid, getRenderingStatus(currentJob));
                    settings.logger.log(`[${currentJob.uid}] job returned to queue due to restart`);
                } catch (err) {
                    settings.logger.log(`[${currentJob.uid}] error updating job state: ${err.message}`);
                }
            }
            
            // Exit with code 0 to allow process manager to restart
            // Process manager (PM2, systemd, etc.) can detect exit and restart
            process.exit(0);
        };

        // Start periodic status updates if enabled (enabled by default)
        const statusIntervalMs = settings.statusUpdateInterval !== undefined 
            ? settings.statusUpdateInterval 
            : (NEXRENDER_STATUS_UPDATE_INTERVAL || 30 * 1000);
        
        if (statusIntervalMs > 0) {
            // Send initial status immediately
            sendStatusToServer();
            
            // Then send periodically and check for restart signals
            statusUpdateInterval = setInterval(async () => {
                sendStatusToServer();
                
                // Check for restart signal after sending status
                const shouldRestart = await checkRestartSignal();
                if (shouldRestart) {
                    await handleRestart();
                }
            }, statusIntervalMs);
            
            settings.logger.log(`[worker] status updates enabled (interval: ${statusIntervalMs}ms)`);
        }

        settings.track('Worker Started', {
            worker_tags_set: !!settings.tagSelector,
            worker_setting_tolerate_empty_queues: settings.tolerateEmptyQueues,
            worker_setting_exit_on_empty_queue: settings.exitOnEmptyQueue,
            worker_setting_polling: settings.polling,
            worker_setting_stop_on_error: settings.stopOnError,
        })

        if(settings.stopAtTime) {
            let stopTimeParts = settings.stopAtTime.split(':'); // split the hour and minute
            let now = new Date(); // get current date object

            stop_datetime = new Date(); // new date object for stopping time
            stop_datetime.setHours(stopTimeParts[0], stopTimeParts[1], 0, 0); // set the stop time

            if(stop_datetime.getTime() <= now.getTime()){
                stop_datetime.setDate(stop_datetime.getDate() + 1); // if it's past the stop time, move it to next day
            }

            if(settings.stopDays) {
                let stopDaysList = settings.stopDays.split(',').map(Number); // convert string weekdays into integer values
                while(!stopDaysList.includes(stop_datetime.getDay())) {
                    stop_datetime.setDate(stop_datetime.getDate() + 1); // if stop_datetime's weekday is not in the list, add one day
                }
            }
        }

        // Set up interruption handlers if enabled
        if (settings.handleInterruption) {
            process.on('SIGINT', handleInterruption);
            process.on('SIGTERM', handleInterruption);
            settingsRef.logger.log('Interruption handling enabled.');
        }

        // Function to process a single job
        const processJob = async (job) => {
            if (!job || !job.uid) return;
            
            // Add to active jobs map
            activeJobs.set(job.uid, job);
            if (maxConcurrentJobs === 1) {
                currentJob = job; // Backward compatibility
            }
            
            totalJobsProcessed++;

            settings.track('Worker Job Started', {
                job_id: job.uid, // anonymized internally
            })

            job.state = 'started';
            job.startedAt = new Date()

            try {
                await client.updateJob(job.uid, job)
            } catch (err) {
                console.log(`[${job.uid}] error while updating job state to ${job.state}. Job abandoned.`)
                console.log(`[${job.uid}] error stack: ${err.stack}`)
                activeJobs.delete(job.uid);
                return;
            }

            try {
                job.onRenderProgress = ((c, s) => async (job) => {
                    try {
                        /* send render progress to our server */
                        await c.updateJob(job.uid, getRenderingStatus(job));

                        if (s.onRenderProgress) {
                            s.onRenderProgress(job);
                        }
                    } catch (err) {
                        if (s.stopOnError) {
                            throw err;
                        } else {
                            console.log(`[${job.uid}] error updating job state occurred: ${err.stack}`)
                        }
                    }
                })(client, settings);
                job.onRenderError = ((c, s, job) => (_, err) => {
                    job.error = [].concat(job.error || [], [err.toString()]);

                    if (s.onRenderError) {
                        s.onRenderError(job, err);
                    }

                    /* send render progress to our server */
                    c.updateJob(job.uid, getRenderingStatus(job));
                })(client, settings, job);

                const renderedJob = await render(job, settings);
                renderedJob.state = 'finished';
                renderedJob.finishedAt = new Date();
                totalJobsFinished++;
                
                    if (settings.onFinished) {
                    settings.onFinished(renderedJob);
                }

                settings.track('Worker Job Finished', { job_id: renderedJob.uid })

                await client.updateJob(renderedJob.uid, getRenderingStatus(renderedJob))
                
                // Remove from active jobs
                activeJobs.delete(renderedJob.uid);
                if (currentJob && currentJob.uid === renderedJob.uid) {
                    currentJob = null;
                }
            } catch (err) {
                job.error = [].concat(job.error || [], [err.toString()]);
                job.errorAt = new Date();
                job.state = 'error';
                totalJobsError++;

                settings.track('Worker Job Error', { job_id: job.uid });

                if (settings.onError) {
                    settings.onError(job, err);
                }

                try {
                    await client.updateJob(job.uid, getRenderingStatus(job))
                }
                catch (e) {
                    console.log(`[${job.uid}] error while updating job state to ${job.state}. Job abandoned.`)
                    console.log(`[${job.uid}] error stack: ${e.stack}`)
                }

                // Remove from active jobs
                activeJobs.delete(job.uid);
                if (currentJob && currentJob.uid === job.uid) {
                    currentJob = null;
                }

                if (settings.stopOnError) {
                    throw err;
                } else {
                    console.log(`[${job.uid}] error occurred: ${err.stack}`)
                    console.log(`[${job.uid}] render proccess stopped with error...`)
                    console.log(`[${job.uid}] continue listening next job...`)
                }
            }
        };

        // Main processing loop with concurrent job support
        const processingLoop = async () => {
            const activePromises = new Map(); // Map of job UID to promise
            
            while (active) {
                // Fill up to maxConcurrentJobs
                while (activeJobs.size < maxConcurrentJobs && active) {
                    if (stop_datetime !== null && new Date() > stop_datetime) {
                        active = false;
                        break;
                    }

                    // Check for lock file before proceeding
                    if (checkLockFile(settings)) {
                        active = false;
                        break;
                    }

                    try {
                        const job = await nextJob(client, settings);
                        
                        if (!job || !job.uid) {
                            // No job available, break out of inner loop to wait
                            break;
                        }

                        // Process job concurrently
                        const jobPromise = processJob(job).catch(err => {
                            settings.logger.error(`[${job.uid}] Unhandled error in processJob: ${err.message}`);
                        }).finally(() => {
                            // Clean up promise when done
                            activePromises.delete(job.uid);
                        });
                        
                        activePromises.set(job.uid, jobPromise);

                    } catch (err) {
                        settings.logger.error(`[worker] error in processing loop: ${err.message}`);
                        if (settings.stopOnError) {
                            throw err;
                        }
                        break; // Break inner loop on error, wait before retrying
                    }
                }

                // Wait a bit before checking again
                if (active) {
                    if (activeJobs.size >= maxConcurrentJobs) {
                        // At max capacity, check every second if we can pick up more jobs
                        await delay(1000);
                    } else {
                        // If we have fewer jobs, wait the normal polling interval
                        await delay(settings.polling || NEXRENDER_API_POLLING);
                    }
                }
            }

            // Wait for all active jobs to complete before exiting
            if (activePromises.size > 0) {
                settings.logger.log(`[worker] waiting for ${activePromises.size} active job(s) to complete...`);
                await Promise.allSettled(Array.from(activePromises.values()));
            }
        };

        await processingLoop();

        // Clean up interruption handlers
        if (settings.handleInterruption) {
            process.removeListener('SIGINT', handleInterruption);
            process.removeListener('SIGTERM', handleInterruption);
        }
    }

    /**
     * Stops worker "thread"
     * @return {void}
     */
    const stop = () => {
        if (settingsRef) {
            settingsRef.logger.log('stopping nexrender-worker')
        }

        // Clear status update interval
        if (statusUpdateInterval) {
            clearInterval(statusUpdateInterval);
            statusUpdateInterval = null;
        }

        active = false;
    }

    /**
     * Returns the current status of the worker
     * @return {Boolean}
     */
    const isRunning = () => {
        return active;
    }

    /**
     * Returns detailed status information about the worker
     * @return {Object}
     */
    const getStatus = () => {
        const uptime = startTime ? Date.now() - startTime : 0;
        
        return {
            active,
            version: pkg.version,
            uptime: uptime,
            uptimeFormatted: formatUptime(uptime),
            serverHost: serverHost || 'not connected',
            settings: settingsRef ? {
                name: settingsRef.name,
                workpath: settingsRef.workpath,
                polling: settingsRef.polling || NEXRENDER_API_POLLING,
                stopOnError: settingsRef.stopOnError,
                tagSelector: settingsRef.tagSelector,
                maxConcurrentJobs: maxConcurrentJobs,
            } : null,
            currentJob: currentJob ? {
                uid: currentJob.uid,
                state: currentJob.state,
                startedAt: currentJob.startedAt,
            } : null,
            activeJobs: Array.from(activeJobs.values()).map(job => ({
                uid: job.uid,
                state: job.state,
                startedAt: job.startedAt,
            })),
            maxConcurrentJobs: maxConcurrentJobs,
            activeJobCount: activeJobs.size,
            statistics: {
                emptyReturns,
                totalJobsProcessed,
                totalJobsFinished,
                totalJobsError,
                lastJobPickupTime,
            },
            stopDatetime: stop_datetime,
        };
    }

    /**
     * Formats uptime in milliseconds to human readable string
     * @param {Number} ms - milliseconds
     * @return {String}
     */
    const formatUptime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    return {
        start,
        stop,
        isRunning,
        getStatus
    }
}

module.exports = {
    createWorker,
}
