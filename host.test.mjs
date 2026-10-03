import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { normalizeUrl } from './url.js';
import { is_stream_allowed } from './node_modules/@mercuryworkshop/wisp-js/src/server/filter.mjs';
import { options } from './node_modules/@mercuryworkshop/wisp-js/src/server/options.mjs';
import { stream_types, close_reasons } from './node_modules/@mercuryworkshop/wisp-js/src/packet.mjs';

test('Wisp accepts object-backed streams and enforces per-host limits', async () => {
  const saved = { ...options };
  try {
    Object.assign(options, {
      dns_method: async () => '93.184.216.34',
      stream_limit_total: 64,
      stream_limit_per_host: 2,
    });
    const connection = { streams: { 1: { socket: { hostname: 'regression.invalid' } } } };
    assert.equal(await is_stream_allowed(connection, stream_types.TCP, 'regression.invalid', 443), 0);
    connection.streams[2] = { socket: { hostname: 'regression.invalid' } };
    assert.equal(await is_stream_allowed(connection, stream_types.TCP, 'regression.invalid', 443), close_reasons.ConnThrottled);
  } finally { Object.assign(options, saved); }
});

let child, base;
before(async () => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
});
after(() => child?.kill('SIGKILL'));

test('server health and all browser runtime assets are served', async () => {
  assert.equal((await (await fetch(`${base}/healthz`)).json()).status, 'ok');
  for (const path of ['/', '/browser.js', '/sw.js', '/controller/controller.api.js', '/controller/controller.sw.js', '/controller/controller.inject.js', '/scramjet/scramjet.js', '/scramjet/scramjet.wasm']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
  assert.equal((await fetch(`${base}/sw.js`)).headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${base}/scramjet/scramjet.wasm`)).headers.get('content-type'), 'application/wasm');
});

function upgrade(path, origin) {
  return new Promise((resolve, reject) => {
    const req = request(base + path, { headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64'), Origin: origin } });
    req.on('upgrade', (response, socket) => { socket.destroy(); resolve(response.statusCode); });
    req.on('response', response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Upgrade timed out')));
    req.end();
  });
}
test('WebSocket accepts its own browser and rejects unrelated origins or paths', async () => {
  assert.equal(await upgrade('/wisp/', base), 101);
  assert.equal(await upgrade('/wisp/', 'https://unrelated.example'), 403);
  assert.equal(await upgrade('/unrelated', base), 403);
});

test('launch addresses allow web destinations and reject active schemes or embedded credentials', () => {
  assert.equal(normalizeUrl('example.com/a?b=c'), 'https://example.com/a?b=c');
  for (const input of ['', 'javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'https://name:password@example.com', 'http://localhost', 'http://server.local']) assert.throws(() => normalizeUrl(input), input);
});
