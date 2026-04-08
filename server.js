require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const mpesaRoutes = require('./src/mpesaRoutes');
const calendarRoutes = require('./src/calendarRoutes');
const bookingRoutes = require('./src/bookingRoutes');
const adminRoutes = require('./src/adminRoutes');

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ───────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://nyathirahomes.com', 'https://www.nyathirahomes.com']
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Request logger ───────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.path}`);
  next();
});

// ─── Serve the frontend ───────────────────────────────────────────────────
// Put nyathira-homes.html (or your built frontend) in the /public folder.
app.use(express.static(path.join(__dirname, 'public')));

// ─── API routes ───────────────────────────────────────────────────────────
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

// Health check — useful for deployment platforms and uptime monitors
app.get('/health', (_req, res) => {
  res.json({
    ok:   true,
    env:  process.env.MPESA_ENV || 'sandbox',
    time: new Date().toISOString(),
  });
});

// ─── 404 fallback ────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Route not found.' });
});

// ─── Error handler ────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Unhandled]', err.message);
  res.status(500).json({ ok: false, error: 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   Nyathira Homes — M-Pesa Server         ║
  ║   Environment : ${(process.env.MPESA_ENV || 'sandbox').padEnd(24)}║
  ║   Listening on: http://localhost:${PORT}   ║
  ╚══════════════════════════════════════════╝
  `);
  if (!process.env.MPESA_CONSUMER_KEY || process.env.MPESA_CONSUMER_KEY === 'your_consumer_key_here') {
    console.warn('\n  ⚠️  MPESA_CONSUMER_KEY not set — copy .env.example to .env and fill in your Daraja credentials.\n');
  }
  if (!process.env.MPESA_CALLBACK_URL || process.env.MPESA_CALLBACK_URL.includes('your-ngrok')) {
    console.warn('  ⚠️  MPESA_CALLBACK_URL not set — run ngrok and update .env before testing.\n');
  }
});

module.exports = app;
