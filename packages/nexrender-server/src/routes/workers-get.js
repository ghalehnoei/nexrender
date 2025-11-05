const { send } = require('micro')
const { getWorker } = require('../helpers/workers')

module.exports = async (req, res) => {
    const name = req.params.name;
    const w = getWorker(name);
    if (!w) return send(res, 404, { error: 'not found' });
    return send(res, 200, w);
}


