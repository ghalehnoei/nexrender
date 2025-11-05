const WORKER_TTL_MS = Number(process.env.NEXRENDER_WORKER_TTL_MS || 60000);

const workers = Object.create(null);

const upsertWorker = (name, payload) => {
    const now = Date.now();
    workers[name] = Object.assign({}, payload, { lastHeartbeat: now });
}

const getWorker = (name) => {
    const w = workers[name];
    if (!w) return null;
    return w;
}

const listWorkers = () => {
    const now = Date.now();
    const result = [];
    for (const [name, w] of Object.entries(workers)) {
        const stale = (now - (w.lastHeartbeat || 0)) > WORKER_TTL_MS;
        result.push(Object.assign({ name, stale }, w));
    }
    return result;
}

module.exports = {
    upsertWorker,
    getWorker,
    listWorkers,
}


