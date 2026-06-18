import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, resolve, join } from 'node:path';

const PORT = 3004;
const ROOT = resolve(process.cwd());

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

const server = createServer((req, res) => {
  let pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;
  if (pathname === '/') pathname = '/index.html';

  const ext = extname(pathname);
  const mimeType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const filePath = join(ROOT, pathname);
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  } catch (err) {
    console.error(`Error serving ${pathname}:`, err.message);
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Melody Generator server running at http://localhost:${PORT}`);
  console.log(`Serving files from: ${ROOT}`);
});
