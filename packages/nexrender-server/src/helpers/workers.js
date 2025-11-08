const os   = require('os')
const fs   = require('fs')
const path = require('path')

/* initial data */
const defaultPath = path.join(os.homedir(), 'nexrender')
const defaultName = 'workers.js'

const database = process.env.NEXRENDER_WORKERS_DATABASE
    ? process.env.NEXRENDER_WORKERS_DATABASE
    : path.join(defaultPath, defaultName);

let workers = (fs.existsSync(database) && fs.readFileSync(database, 'utf8'))
    ? JSON.parse(fs.readFileSync(database, 'utf8'))
    : [];

if (!process.env.NEXRENDER_WORKERS_DATABASE && !fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath);
}

/* internal methods */
const save = () => fs.writeFileSync(database, JSON.stringify(workers, null, 2))

const indexOf = (workerName) => {
    for (var i = workers.length - 1; i >= 0; i--) {
        const entry = workers[i];
        if (entry.name == workerName) {
            return i;
        }
    }
    return -1;
}

// Restart signals storage
let restartSignals = {};

// Clean up inactive workers (older than 5 minutes)
const cleanupInactiveWorkers = () => {
    const now = Date.now();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes
    
    workers = workers.filter(worker => {
        const lastUpdate = worker.lastUpdate ? new Date(worker.lastUpdate).getTime() : 0;
        return (now - lastUpdate) < inactiveThreshold;
    });
    
    save();
}

// Check worker health status
const checkWorkerHealth = (workerName, healthThreshold = 2 * 60 * 1000) => {
    const worker = fetch(workerName);
    if (!worker) {
        return {
            healthy: false,
            status: 'not_found',
            message: 'Worker not found'
        };
    }

    const now = Date.now();
    const lastUpdate = worker.lastUpdate ? new Date(worker.lastUpdate).getTime() : 0;
    const timeSinceUpdate = now - lastUpdate;

    if (timeSinceUpdate > healthThreshold) {
        return {
            healthy: false,
            status: 'unresponsive',
            message: `Worker has not sent updates for ${Math.floor(timeSinceUpdate / 1000)} seconds`,
            lastUpdate: worker.lastUpdate,
            timeSinceUpdate: timeSinceUpdate
        };
    }

    // Check if worker status indicates errors
    if (worker.status && worker.status.active === false) {
        return {
            healthy: false,
            status: 'inactive',
            message: 'Worker is marked as inactive'
        };
    }

    return {
        healthy: true,
        status: 'healthy',
        message: 'Worker is responding normally',
        lastUpdate: worker.lastUpdate
    };
}

// Get health status of all workers
const getAllHealth = (healthThreshold = 2 * 60 * 1000) => {
    cleanupInactiveWorkers();
    const allWorkers = getAll();
    return allWorkers.map(worker => ({
        name: worker.name,
        health: checkWorkerHealth(worker.name, healthThreshold),
        status: worker.status,
        lastUpdate: worker.lastUpdate
    }));
}

// Request worker restart
const requestRestart = (workerName) => {
    restartSignals[workerName] = {
        requested: true,
        requestedAt: new Date().toISOString()
    };
    return true;
}

// Check if restart is requested for a worker
const checkRestartSignal = (workerName) => {
    if (restartSignals[workerName] && restartSignals[workerName].requested) {
        // Clear the signal after reading (one-time use)
        const signal = restartSignals[workerName];
        delete restartSignals[workerName];
        return signal;
    }
    return null;
}

// Clear restart signal (used when worker confirms restart)
const clearRestartSignal = (workerName) => {
    delete restartSignals[workerName];
    return true;
}

/* public api */
const fetch = (workerName) => workerName ? workers[indexOf(workerName)] : workers

const insert = (workerStatus) => {
    const now = new Date()
    const workerName = workerStatus.name || workerStatus.settings?.name || 'unknown';

    const worker = {
        name: workerName,
        status: workerStatus,
        lastUpdate: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
    }

    workers.push(worker);
    setImmediate(save);
    return worker;
}

const update = (workerStatus) => {
    const workerName = workerStatus.name || workerStatus.settings?.name || 'unknown';
    const value = indexOf(workerName);

    if (value == -1) {
        // If worker doesn't exist, insert it
        return insert(workerStatus);
    }

    const now = new Date()

    workers[value] = {
        name: workerName,
        status: workerStatus,
        lastUpdate: now.toISOString(),
        createdAt: workers[value].createdAt || now.toISOString(),
        updatedAt: now.toISOString(),
    }

    setImmediate(save);
    cleanupInactiveWorkers();
    return workers[value];
}

const remove = (workerName) => {
    const value = indexOf(workerName);

    if (value === -1) {
        return null;
    }

    workers.splice(value, 1)
    setImmediate(save);
    return true;
}

const getAll = () => {
    cleanupInactiveWorkers();
    return workers.map(worker => ({
        name: worker.name,
        status: worker.status,
        lastUpdate: worker.lastUpdate,
        createdAt: worker.createdAt,
        updatedAt: worker.updatedAt,
    }));
}

const cleanup = () => {
    workers = []
    save()
}

module.exports = {
    insert,
    fetch,
    update,
    remove,
    getAll,
    cleanup,
    checkWorkerHealth,
    getAllHealth,
    requestRestart,
    checkRestartSignal,
    clearRestartSignal,
}

