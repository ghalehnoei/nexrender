const { send } = require('micro')
const { listWorkers } = require('../helpers/workers')

module.exports = async (_req, res) => {
    const list = listWorkers();
    const summary = {
        totalWorkers: list.length,
        staleWorkers: list.filter(w => w.stale).length,
        activeWorkers: list.filter(w => !w.stale).length,
        totalRunningJobs: list.reduce((a, w) => a + (w.runningCount || 0), 0),
        versions: list.reduce((acc, w) => {
            const v = w.version || 'unknown';
            acc[v] = (acc[v] || 0) + 1;
            return acc;
        }, {}),
    };
    return send(res, 200, { summary, workers: list });
}


