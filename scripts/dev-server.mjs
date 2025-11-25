import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '0.0.0.0';
const rootDir = fileURLToPath(new URL('..', import.meta.url));

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.ico', 'image/x-icon'],
]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const relativePath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(relativePath).replace(/^\.\.+/, '');
  let filePath = path.join(rootDir, safePath);

  try {
    const stats = await stat(filePath).catch(() => null);
    if (!stats) {
      if (!path.extname(filePath)) {
        filePath = `${filePath}.html`;
      }
    } else if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    await stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes.get(ext) || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Emoji chat dev server running at http://${host}:${port}`);
});
