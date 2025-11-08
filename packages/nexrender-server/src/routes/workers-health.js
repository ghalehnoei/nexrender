const { send } = require('micro')
const { checkWorkerHealth, getAllHealth } = require('../helpers/workers')

module.exports = async (req, res) => {
    try {
        const healthThreshold = parseInt(req.query.threshold) || 2 * 60 * 1000; // Default 2 minutes

        // If worker name is provided in query, return single worker health
        if (req.query.name) {
            const health = checkWorkerHealth(req.query.name, healthThreshold);
            return send(res, 200, {
                name: req.query.name,
                health: health
            });
        }

        // Otherwise return health of all workers
        const allHealth = getAllHealth(healthThreshold);
        send(res, 200, allHealth);
    } catch (err) {
        console.error('error checking worker health:', err);
        return send(res, 500, { error: err.message })
    }
}

