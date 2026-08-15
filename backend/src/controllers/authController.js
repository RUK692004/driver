const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const signToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

/** POST /api/auth/register — create driver account */
async function register(req, res) {
  const { name, email, phone, password, licenseNumber } = req.body || {};

  if (!name || !email || !password || !licenseNumber) {
    return res.status(400).json({
      error: 'name, email, password and licenseNumber are required.',
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Duplicate email check
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    // Duplicate license check
    const lic = await client.query('SELECT id FROM drivers WHERE license_number = $1', [licenseNumber]);
    if (lic.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This license number is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userRes = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, 'DRIVER') RETURNING id, name, email, phone, role, created_at`,
      [name, email, phone || null, passwordHash]
    );
    const user = userRes.rows[0];

    const driverRes = await client.query(
      `INSERT INTO drivers (user_id, license_number, status)
       VALUES ($1, $2, 'ACTIVE') RETURNING id, license_number, status`,
      [user.id, licenseNumber]
    );
    const driver = driverRes.rows[0];

    await client.query('COMMIT');

    const token = signToken(user.id);
    return res.status(201).json({
      token,
      user: { ...user, driver_id: driver.id, license_number: driver.license_number },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Failed to create account.' });
  } finally {
    client.release();
  }
}

/** POST /api/auth/login */
async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.password_hash,
              d.id AS driver_id, d.license_number, d.status AS driver_status
       FROM users u
       LEFT JOIN drivers d ON d.user_id = u.id
       WHERE u.email = $1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.driver_status === 'SUSPENDED') {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    const token = signToken(user.id);
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        driver_id: user.driver_id,
        license_number: user.license_number,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

/** POST /api/auth/forgot-password */
async function forgotPassword(req, res) {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
      // Do not reveal whether the account exists.
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    // In production, generate a reset token and email it.
    // For this reference implementation we return a generic message.
    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Failed to process request.' });
  }
}

/** GET /api/auth/me — current authenticated user + driver profile */
async function me(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
              d.id AS driver_id, d.license_number, d.status AS driver_status
       FROM users u
       LEFT JOIN drivers d ON d.user_id = u.id
       WHERE u.id = $1`,
      [req.user.user_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Failed to load profile.' });
  }
}

module.exports = { register, login, forgotPassword, me };