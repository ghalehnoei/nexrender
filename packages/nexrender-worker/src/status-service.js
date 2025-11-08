const http = require('http');
const url = require('url');

/**
 * Creates and starts an HTTP server that exposes worker status
 * @param {Object} worker - Worker instance with getStatus() method
 * @param {Number} port - Port to listen on (default: 3100)
 * @return {http.Server}
 */
const createStatusService = (worker, port = 3100) => {
    const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle OPTIONS request
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // Handle GET requests
        if (req.method === 'GET') {
            if (pathname === '/status' || pathname === '/api/status' || pathname === '/') {
                try {
                    const status = worker.getStatus();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(status, null, 2));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            } else if (pathname === '/health') {
                // Simple health check endpoint
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
            } else {
                // 404 for unknown routes
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        } else {
            // Method not allowed
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[status-service] Port ${port} is already in use. Try a different port.`);
        } else {
            console.error(`[status-service] Server error: ${err.message}`);
        }
    });

    return server;
}

module.exports = {
    createStatusService
};


