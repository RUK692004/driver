const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * JWT authentication middleware.
 * Verifies the Bearer token and attaches the authenticated user + driver
 * to the request object.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await db.query(
      `SELECT u.id AS user_id, u.name, u.email, u.phone, u.role,
              d.id AS driver_id, d.license_number, d.status AS driver_status
       FROM users u
       LEFT JOIN drivers d ON d.user_id = u.id
       WHERE u.id = $1`,
      [payload.sub]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/** Restrict route to a specific role. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };