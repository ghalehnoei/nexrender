const { send } = require('micro')
const { listWorkers } = require('../helpers/workers')

module.exports = async (_req, res) => {
    const list = listWorkers();
    return send(res, 200, list);
}


