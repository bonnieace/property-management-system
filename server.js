require('dotenv').config();
require('./src/config').validateConfig();
const express = require('express');
const helmet = require('helmet');
const crypto = require('node:crypto');
const path = require('node:path');
const db = require('./src/db');
const h = require('./src/http');
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(s => s.trim()));
app.use((req, res, next) => { req.requestId = crypto.randomUUID(); res.set('X-Request-ID', req.requestId); next(); });
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], imgSrc: ["'self'", 'https:', 'data:'],
  connectSrc: ["'self'"], frameSrc: ["'self'", 'https://www.youtube.com'], objectSrc: ["'none'"],
  baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'self'"],
  upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
} }, crossOriginEmbedderPolicy: false, referrerPolicy: { policy: 'no-referrer' } }));
app.use(express.json({ limit: '128kb', strict: true }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.startsWith('/mpesa/callback/')) {
    if ((req.method !== 'DELETE' || Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding']) && !req.is('application/json')) return next(new h.HttpError(415, 'Use application/json'));
    const origin = req.headers.origin;
    const expected = process.env.SITE_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if (origin && origin !== expected || req.headers['sec-fetch-site'] === 'cross-site') return next(new h.HttpError(403, 'Request origin is not allowed'));
  }
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/ready', h.route(async (_req, res) => {
  try { await db.raw('select 1 from property_websites limit 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false, error: 'Database is not ready' }); }
}));
app.use('/api/admin', require('./src/adminRoutes'));
app.use('/api/bookings', require('./src/bookingRoutes'));
app.use('/api/calendar', require('./src/calendarRoutes'));
app.use('/api/mpesa', require('./src/mpesaRoutes'));
app.use('/api', require('./src/websiteRoutes'));
app.get('/p/:slug', h.route(async (req, res) => {
  const site = await db('properties as p').join('property_websites as w', 'p.id', 'w.property_id').where('p.property_id', req.params.slug).where('p.status', 'active').whereNotNull('w.published').first('p.id');
  if (!site) return res.status(404).send('This property website is not available.');
  res.sendFile(path.join(__dirname, 'public/property.html'));
}));
app.get('/admin/preview/:slug', require('./src/adminAuth').adminAuthMiddleware, h.route(async (req, res) => {
  await require('./src/propertyScope').property(req, req.params.slug);
  res.sendFile(path.join(__dirname, 'public/property.html'));
}));
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', maxAge: '1h', setHeaders(res, file) { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use((_req, res) => res.status(404).json({ ok: false, error: 'Route not found' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.status || 500, error = status < 500 ? err.message : 'Something went wrong. Please try again.';
  if (err.name === 'ZodError') { status = 400; error = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '); }
  if (err.code === '23505') { status = 409; error = 'That record already exists. Choose a different username, email or property address.'; }
  if (err.code === '22P02' || err.code === '22007' || err.code === '23514') { status = 400; error = 'One or more values are invalid'; }
  if (err.code === '23503') { status = 409; error = 'This record is linked to other records and cannot be changed'; }
  // Never serialize SQL, parameters, credentials or provider responses to logs/clients.
  if (status >= 500) console.error(JSON.stringify({ requestId: req.requestId, code: err.code || 'INTERNAL_ERROR', status }));
  res.status(status).json({ ok: false, error, requestId: req.requestId });
});
if (require.main === module) {
  const server = app.listen(process.env.PORT || 4000, '0.0.0.0', () => console.log('Property management server is listening'));
  let maintaining = false;
  const maintenance = setInterval(async () => {
    if (maintaining) return; maintaining = true;
    try { await require('./src/mpesaRoutes').runMaintenance(); } catch { console.error('Maintenance did not complete'); }
    finally { maintaining = false; }
  }, 30000);
  maintenance.unref();
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    server.close(async () => { await db.destroy(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
module.exports = app;
