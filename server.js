import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.mid': 'audio/midi'
};

http.createServer((req, res) => {
    let reqPath;
    
    try {
        // Parse URL to strip query strings and safely decode URI components (e.g. %2e%2e -> ..)
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        reqPath = decodeURIComponent(parsedUrl.pathname);
    } catch (err) {
        res.writeHead(400);
        return res.end('400 - Bad Request');
    }
    
    if (reqPath === '/') reqPath = '/index.html';

    // Suppress favicon.ico 404 errors in the console
    if (reqPath === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'image/x-icon' });
        return res.end();
    }

    // Resolve absolute paths and prevent directory traversal attacks
    const resolvedBase = path.resolve(__dirname);
    const filePath = path.resolve(path.join(resolvedBase, reqPath));
    
    // Ensure the requested file strictly resides within our resolved base directory
    if (!filePath.startsWith(resolvedBase + path.sep) && filePath !== resolvedBase) {
        res.writeHead(403);
        return res.end('403 - Forbidden');
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 - File Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            // Add aggressive anti-caching headers for local network testing
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content, 'utf-8');
        }
    });
}).listen(PORT, () => {
    console.log(`🚀 Progress Dev Server running at: http://localhost:${PORT}/`);
});