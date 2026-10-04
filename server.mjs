import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';

// This service hosts only the browser. Accounts and chat remain in Floot.
Object.assign(wisp.options, {
  allow_private_ips: false,
  allow_loopback_ips: false,
  allow_direct_ip: false,
  allow_udp_streams: false,
  port_whitelist: [80, 443],
  stream_limit_total: 64,
  stream_limit_per_host: 24,
});
logging.set_level(logging.ERROR);

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'shapes-proxy' }));
app.use(express.static(fileURLToPath(new URL('./public/', import.meta.url)), {
  setHeaders(res, path) {
    if (path.endsWith('sw.js') || path.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store');
  },
}));
app.use((_req, res) => res.status(404).type('text').send('Not found'));
const server = createServer(app);
server.on('upgrade', (req, socket, head) => {
  // Prevent unrelated browser pages from borrowing this service. This is an
  // origin check, not user authentication; the deployed browser is public.
  let originHost = '';
  try { originHost = new URL(req.headers.origin).host.toLowerCase(); } catch {}

  const requestHost = String(req.headers.host || '').toLowerCase();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();

  // Bunny can preserve its public hostname in Origin while forwarding the
  // request to Render with the Render hostname in Host. Permit only the
  // known public proxy hostnames, plus direct same-origin access.
  const allowedOrigins = new Set([
    requestHost,
    forwardedHost,
    '122333344.b-cdn.net',
    'unicoridor.work.gd',
    'shapes-proxy.onrender.com',
  ].filter(Boolean));

  const originAllowed = originHost && allowedOrigins.has(originHost);
  if (req.url !== '/wisp/' || !originAllowed) {
    console.warn('Rejected Wisp upgrade', {
      path: req.url,
      originHost,
      requestHost,
      forwardedHost,
    });
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  wisp.routeRequest(req, socket, head);
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Shapes proxy listening'));
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
});
