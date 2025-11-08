const { send } = require('micro')
const { getAll, fetch } = require('../helpers/workers')

module.exports = async (req, res) => {
    try {
        // If worker name is provided in query, return single worker
        if (req.query.name) {
            const worker = fetch(req.query.name);
            if (worker) {
                return send(res, 200, worker);
            } else {
                return send(res, 404, { error: 'Worker not found' });
            }
        }

        // Otherwise return all workers
        const workers = getAll();
        send(res, 200, workers);
    } catch (err) {
        console.error('error fetching workers:', err);
        return send(res, 500, { error: err.message })
    }
}

