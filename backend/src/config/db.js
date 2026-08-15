const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Run lightweight schema updates (soft delete & road route geometry support)
pool.query('ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;')
  .catch((err) => console.error('Auto-migration error (routes.is_active):', err.message));

pool.query('ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_geometry TEXT;')
  .catch((err) => console.error('Auto-migration error (routes.route_geometry):', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};