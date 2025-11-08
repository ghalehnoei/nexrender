const { send, json } = require('micro')
const { upsertWorker } = require('../helpers/workers')

module.exports = async (req, res) => {
    try {
        const name = req.headers['nexrender-name'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
        const body = await json(req);
        upsertWorker(name, Object.assign({}, body, { name, ip }));
        return send(res, 200, { ok: true });
    } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
    }
}


