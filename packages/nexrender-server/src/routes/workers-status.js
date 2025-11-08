const { send, json } = require('micro')
const { update } = require('../helpers/workers')

module.exports = async (req, res) => {
    try {
        const workerStatus = await json(req, { limit: "10mb" })
        const workerName = req.headers["nexrender-name"] || workerStatus.name || workerStatus.settings?.name || 'unknown';

        // Add worker name to status if not present
        if (!workerStatus.name && !workerStatus.settings?.name) {
            workerStatus.name = workerName;
            if (!workerStatus.settings) {
                workerStatus.settings = {};
            }
            workerStatus.settings.name = workerName;
        }

        console.log(`updating worker status for ${workerName}`)

        const result = await update(workerStatus);
        send(res, 200, { success: true, worker: result });
    } catch (err) {
        console.error('error updating worker status:', err);
        return send(res, 400, { error: err.message })
    }
}

