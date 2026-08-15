require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // The admin route editor displays a selected stop in an OpenStreetMap
      // iframe; scripts and all other CSP defaults remain unchanged.
      'frame-src': ["'self'", 'https://www.openstreetmap.org'],
    },
  },
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// Body parsing (limit to 1mb)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---- Trailing slash strip middleware ----
// Normalizes URLs by redirecting /admin/ -> /admin so route matching is consistent.
app.use((req, res, next) => {
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const query = req.url.slice(req.path.length);
    const safePath = req.path.slice(0, -1);
    return res.redirect(301, safePath + query);
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);
// Stricter rate limit for location tracking (e.g., 1 per second per IP)
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/tracking', trackingLimiter);

// ---- API Routes ----
app.use('/api', routes);

// ---- Admin Dashboard ----
const publicDir = path.join(__dirname, '../public');
const adminHtml = path.join(publicDir, 'index.html');

// Explicitly serve the admin dashboard for /admin and /admin/ (handles both variations).
app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(adminHtml);
});

// Serve static assets in /public under /admin.
app.use('/admin', express.static(publicDir));

// Redirect root to admin dashboard.
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, HOST, () => {
  console.log(`BusBee driver API running on http://${HOST}:${PORT} (listening on all network interfaces)`);
  console.log(`Local Access: http://localhost:${PORT}/api/health`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});
