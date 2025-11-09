const fs = require('fs');
const path = require('path');
const { createClient } = require('@nexrender/api')
const { init, render } = require('@nexrender/core')
const { getRenderingStatus } = require('@nexrender/types/job')
const { withTimeout } = require('@nexrender/core/src/helpers/timeout');
const pkg = require('../package.json')
const http = require('http')
const os = require('os')
const fetch = require('node-fetch')

// Helper function to find log file for a job
function findAELogFile(jobUid, workpath, settings) {
    const logPaths = [];
    
    // Calculate workpath if not provided (same logic as setup.js)
    let calculatedWorkpath = workpath;
    if (!calculatedWorkpath && settings && settings.workpath) {
        calculatedWorkpath = path.join(settings.workpath, jobUid);
    }
    if (!calculatedWorkpath) {
        calculatedWorkpath = path.join(os.tmpdir(), 'nexrender', jobUid);
    }
    
    // Build possible log file paths - try workpath-based locations first
    if (calculatedWorkpath) {
        if (process.env.NEXRENDER_ENABLE_AELOG_PROJECT_FOLDER) {
            logPaths.push(path.join(calculatedWorkpath, 'aerender.log'));
        }
        logPaths.push(path.resolve(calculatedWorkpath, `../aerender-${jobUid}.log`));
        logPaths.push(path.join(calculatedWorkpath, `../aerender-${jobUid}.log`));
        logPaths.push(path.join(path.dirname(calculatedWorkpath), `aerender-${jobUid}.log`));
    }
    
    // Also try the provided workpath if different from calculated
    if (workpath && workpath !== calculatedWorkpath) {
        if (process.env.NEXRENDER_ENABLE_AELOG_PROJECT_FOLDER) {
            logPaths.push(path.join(workpath, 'aerender.log'));
        }
        logPaths.push(path.resolve(workpath, `../aerender-${jobUid}.log`));
        logPaths.push(path.join(workpath, `../aerender-${jobUid}.log`));
    }
    
    // Try default temp locations
    const defaultTemp = path.join(os.tmpdir(), 'nexrender');
    const defaultJobTemp = path.join(defaultTemp, jobUid);
    if (process.env.NEXRENDER_ENABLE_AELOG_PROJECT_FOLDER) {
        logPaths.push(path.join(defaultJobTemp, 'aerender.log'));
    }
    logPaths.push(path.resolve(defaultJobTemp, `../aerender-${jobUid}.log`));
    logPaths.push(path.join(defaultTemp, `aerender-${jobUid}.log`));
    logPaths.push(path.join(os.tmpdir(), `aerender-${jobUid}.log`));
    
    // Try parent directory of temp
    logPaths.push(path.join(path.dirname(defaultTemp), `aerender-${jobUid}.log`));
    
    // Try each path
    for (const logPath of logPaths) {
        try {
            if (fs.existsSync(logPath)) {
                const logContent = fs.readFileSync(logPath, 'utf8');
                if (logContent && logContent.trim().length > 0) {
                    return { path: logPath, content: logContent };
                }
            }
        } catch (err) {
            // Continue to next path if read fails
            continue;
        }
    }
    
    return null;
}

const NEXRENDER_API_POLLING = process.env.NEXRENDER_API_POLLING || 30 * 1000;
const NEXRENDER_TOLERATE_EMPTY_QUEUES = process.env.NEXRENDER_TOLERATE_EMPTY_QUEUES;
const NEXRENDER_PICKUP_TIMEOUT = process.env.NEXRENDER_PICKUP_TIMEOUT || 60 * 1000; // 60 second timeout by default
const LOCK_FILE_NAME = process.env.NEXRENDER_LOCK_FILE_NAME || '.nexrender-worker.lock';
const NEXRENDER_WORKER_CONCURRENCY = Number(process.env.NEXRENDER_WORKER_CONCURRENCY || 1);
const NEXRENDER_WORKER_STATUS_PORT = Number(process.env.NEXRENDER_WORKER_STATUS_PORT || 0);
const NEXRENDER_WORKER_HEARTBEAT_MS = Number(process.env.NEXRENDER_WORKER_HEARTBEAT_MS || 15000);

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
    let currentJob = null;
    let client = null;
    let currentJobs = new Set();
    let heartbeatTimer = null;
    let statusServer = null;

    // New function to handle interruption
    const handleInterruption = async () => {
        if (currentJobs.size > 0) {
            settingsRef.logger.log(`[worker] Interruption signal received. Re-queueing ${currentJobs.size} running job(s)...`);
        }
        for (const job of Array.from(currentJobs)) {
            try {
                job.onRenderProgress = null;
                job.state = 'queued';
                await client.updateJob(job.uid, getRenderingStatus(job));
                settingsRef.logger.log(`[${job.uid}] Job state updated to 'queued' successfully.`);
            } catch (err) {
                settingsRef.logger.error(`[${job.uid}] Failed to update job state: ${err.message}`);
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
        settings.concurrency = Number(settings.concurrency || NEXRENDER_WORKER_CONCURRENCY || 1);
        settings.statusPort = Number(settings.statusPort || NEXRENDER_WORKER_STATUS_PORT || 0);
        settings.heartbeatInterval = Number(settings.heartbeatInterval || NEXRENDER_WORKER_HEARTBEAT_MS || 15000);

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
        const getStatusPayload = () => {
            return {
                name: settings.name || os.hostname(),
                version: pkg.version,
                pid: process.pid,
                host: os.hostname(),
                platform: process.platform,
                uptimeSec: Math.round(process.uptime()),
                concurrency: settings.concurrency,
                runningJobs: Array.from(currentJobs).map(j => j.uid),
                runningCount: currentJobs.size,
                statusPort: settings.statusPort || 0,
                memory: process.memoryUsage(),
                loadavg: os.loadavg ? os.loadavg() : [],
                timestamp: new Date().toISOString(),
            }
        }

        const startStatusServer = () => {
            if (!settings.statusPort) return;
            statusServer = http.createServer((req, res) => {
                if (req.method == 'GET' && req.url == '/health') {
                    res.statusCode = 200;
                    res.end('ok');
                    return;
                }
                if (req.method == 'GET' && req.url == '/status') {
                    const payload = getStatusPayload();
                    res.setHeader('content-type', 'application/json');
                    res.statusCode = 200;
                    res.end(JSON.stringify(payload));
                    return;
                }
                res.statusCode = 404;
                res.end('not found');
            });
            statusServer.listen(settings.statusPort, () => {
                settings.logger.log(`[worker] status server listening on port ${settings.statusPort}`)
            });
        }

        const startHeartbeat = () => {
            const postHeartbeat = async () => {
                try {
                    const payload = getStatusPayload();
                    const hbUrl = `${host}/api/v1/workers/heartbeat`;
                    const resp = await fetch(hbUrl, {
                        method: 'post',
                        headers: {
                            'content-type': 'application/json',
                            'nexrender-secret': secret || '',
                            'nexrender-name': settings.name || '',
                        },
                        body: JSON.stringify(payload),
                    });
                    if (!resp.ok) {
                        const t = await resp.text();
                        settings.logger.log(`[worker] heartbeat failed: ${resp.status} ${t}`)
                    }
                } catch (e) {
                    settings.logger.log(`[worker] heartbeat error: ${e.message}`)
                }
            }
            postHeartbeat();
            heartbeatTimer = setInterval(postHeartbeat, settings.heartbeatInterval);
        }

        startStatusServer();
        startHeartbeat();

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

        const workerLoop = async (loopId) => {
            let localJob = null;
            do {
                localJob = await nextJob(client, settings);
                if (!active || !localJob) break;

                settings.track('Worker Job Started', {
                    job_id: localJob.uid,
                })

                localJob.state = 'started';
                localJob.startedAt = new Date()

                try {
                    await client.updateJob(localJob.uid, localJob)
                } catch (err) {
                    console.log(`[${localJob.uid}] error while updating job state to ${localJob.state}. Job abandoned.`)
                    console.log(`[${localJob.uid}] error stack: ${err.stack}`)
                    continue;
                }

                try {
                    currentJobs.add(localJob);
                    localJob.onRenderProgress = ((c, s) => async (job) => {
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
                    localJob.onRenderError = ((c, s, job) => (_, err) => {
                        job.error = [].concat(job.error || [], [err.toString()]);

                        if (s.onRenderError) {
                            s.onRenderError(job, err);
                        }

                        /* send render progress to our server */
                        c.updateJob(job.uid, getRenderingStatus(job));
                    })(client, settings, localJob);

                    localJob = await render(localJob, settings); {
                        localJob.state = 'finished';
                        localJob.finishedAt = new Date();
                        if (settings.onFinished) {
                            settings.onFinished(localJob);
                        }
                    }

                    settings.track('Worker Job Finished', { job_id: localJob.uid })

                    await client.updateJob(localJob.uid, getRenderingStatus(localJob))
                } catch (err) {
                    localJob.error = [].concat(localJob.error || [], [err.toString()]);
                    localJob.errorAt = new Date();
                    localJob.state = 'error';

                    // Try to read After Effects log if not already attached
                    if (!localJob.aeLog) {
                        const logResult = findAELogFile(localJob.uid, localJob.workpath, settings);
                        if (logResult) {
                            localJob.aeLog = logResult.content;
                            settings.logger.log(`[${localJob.uid}] read After Effects log from file: ${logResult.path} (${localJob.aeLog.length} bytes)`);
                        } else {
                            // Calculate workpath for logging
                            let workpath = localJob.workpath;
                            if (!workpath && settings && settings.workpath) {
                                workpath = path.join(settings.workpath, localJob.uid);
                            }
                            if (!workpath) {
                                workpath = path.join(os.tmpdir(), 'nexrender', localJob.uid);
                            }
                            settings.logger.log(`[${localJob.uid}] After Effects log not found after searching multiple locations. Calculated workpath: ${workpath}`);
                        }
                    }

                    settings.track('Worker Job Error', { job_id: localJob.uid });

                    if (settings.onError) {
                        settings.onError(localJob, err);
                    }

                    try {
                        await client.updateJob(localJob.uid, getRenderingStatus(localJob))
                    }
                    catch (e) {
                        console.log(`[${localJob.uid}] error while updating job state to ${localJob.state}. Job abandoned.`)
                        console.log(`[${localJob.uid}] error stack: ${e.stack}`)
                    }

                    if (settings.stopOnError) {
                        throw err;
                    } else {
                        console.log(`[${localJob.uid}] error occurred: ${err.stack}`)
                        console.log(`[${localJob.uid}] render proccess stopped with error...`)
                        console.log(`[${localJob.uid}] continue listening next job...`)
                    }
                } finally {
                    currentJobs.delete(localJob);
                }

                if (settings.waitBetweenJobs) {
                    await delay(settings.waitBetweenJobs);
                }
            } while (active)
        }

        settings.logger.log(`[worker] starting with concurrency = ${settings.concurrency}`);
        const loops = Array.from({ length: Math.max(1, settings.concurrency) }, (_, i) => workerLoop(i));
        await Promise.all(loops)

        // Clean up interruption handlers
        if (settings.handleInterruption) {
            process.removeListener('SIGINT', handleInterruption);
            process.removeListener('SIGTERM', handleInterruption);
        }

        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }

        if (statusServer) {
            try { statusServer.close(); } catch (e) {}
            statusServer = null;
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

        active = false;
    }

    /**
     * Returns the current status of the worker
     * @return {Boolean}
     */
    const isRunning = () => {
        return active;
    }

    return {
        start,
        stop,
        isRunning
    }
}

module.exports = {
    createWorker,
}
