const { send, json } = require('micro')
const { requestRestart, checkRestartSignal, clearRestartSignal } = require('../helpers/workers')

// POST /api/v1/workers/:name/restart - Request a worker to restart
// GET /api/v1/workers/restart-signal - Worker checks if it should restart (called by worker)
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            // Server requesting a worker to restart
            const workerName = req.params.name || req.query.name;
            
            if (!workerName) {
                return send(res, 400, { error: 'Worker name is required' });
            }

            const result = requestRestart(workerName);
            console.log(`restart requested for worker: ${workerName}`);
            send(res, 200, { 
                success: true, 
                message: `Restart signal sent to worker: ${workerName}`,
                worker: workerName
            });
        } else if (req.method === 'GET') {
            // Worker checking if it should restart
            const workerName = req.headers["nexrender-name"] || req.query.name;
            
            if (!workerName) {
                return send(res, 400, { error: 'Worker name is required' });
            }

            const signal = checkRestartSignal(workerName);
            
            if (signal) {
                send(res, 200, { 
                    restart: true, 
                    requestedAt: signal.requestedAt,
                    message: 'Restart requested by server'
                });
            } else {
                send(res, 200, { 
                    restart: false, 
                    message: 'No restart signal'
                });
            }
        } else {
            send(res, 405, { error: 'Method not allowed' });
        }
    } catch (err) {
        console.error('error handling restart request:', err);
        return send(res, 500, { error: err.message })
    }
}

