const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function fixAdmin() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // Check if admin exists
  const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = 'admin@busbee.com'");
  
  if (existing.length === 0) {
    console.log('Admin user not found, creating...');
    const hash = await bcrypt.hash('Admin@123', 10);
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, phone, password_hash, role) VALUES ('System Admin', 'admin@busbee.com', '+919000000000', $1, 'ADMIN') RETURNING id, name, email, role",
      [hash]
    );
    console.log('Admin created:', rows[0]);
  } else {
    console.log('Admin user already exists, updating password hash...');
    const hash = await bcrypt.hash('Admin@123', 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = 'admin@busbee.com'", [hash]);
    console.log('Password hash updated');
  }
  
  await pool.end();
}

fixAdmin().catch((error) => {
  console.error('Unable to repair admin user:', error);
  process.exitCode = 1;
});
