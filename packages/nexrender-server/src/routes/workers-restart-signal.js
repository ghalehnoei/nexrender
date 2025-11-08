const { send } = require('micro')
const { checkRestartSignal } = require('../helpers/workers')

// Worker checks if it should restart
module.exports = async (req, res) => {
    try {
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
    } catch (err) {
        console.error('error checking restart signal:', err);
        return send(res, 500, { error: err.message })
    }
}

