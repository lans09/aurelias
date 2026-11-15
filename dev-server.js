const http = require('http');
const fs = require('fs');
const path = require('path');
const entriesHandler = require('./api/entries');

const PORT = 8080;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/api/entries') {
    return entriesHandler(req, res);
  }

  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath === '/admin' ? 'admin.html' : urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Aurelias dev server running at http://localhost:${PORT} (Admin at /admin)`);
});
