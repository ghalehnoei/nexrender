const { send } = require('micro')
const fetch = require('node-fetch')
const { getWorker } = require('../helpers/workers')

module.exports = async (req, res) => {
    const name = req.params.name;
    const w = getWorker(name);
    if (!w) return send(res, 404, { error: 'not found' });

    if (!w.ip || !w.statusPort) {
        return send(res, 400, { error: 'worker did not report ip/statusPort' });
    }

    try {
        const url = `http://${w.ip}:${w.statusPort}/status`;
        const r = await fetch(url);
        if (!r.ok) {
            return send(res, 502, { error: `fetch failed: ${r.status}` });
        }
        const json = await r.json();
        // Remove job IDs from the response
        delete json.runningJobs;
        return send(res, 200, json);
    } catch (e) {
        return send(res, 502, { error: e.message });
    }
}


