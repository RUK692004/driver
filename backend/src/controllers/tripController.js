const db = require('../config/db');

/** POST /api/trips — start a new trip */
async function startTrip(req, res) {
  const { bus_id, route_id } = req.body || {};
  const driverId = req.user.driver_id;

  if (!bus_id || !route_id) {
    return res.status(400).json({ error: 'bus_id and route_id are required.' });
  }
  if (!driverId) {
    return res.status(403).json({ error: 'No driver profile linked to this account.' });
  }

  try {
    // Verify the bus is assigned to this driver.
    const assign = await db.query(
      'SELECT id FROM bus_assignments WHERE driver_id = $1 AND bus_id = $2',
      [driverId, bus_id]
    );
    if (assign.rows.length === 0) {
      return res.status(403).json({ error: 'This bus is not assigned to you.' });
    }

    // Ensure no other active trip exists for this bus.
    const active = await db.query(
      `SELECT id FROM trips
       WHERE bus_id = $1 AND status IN ('ACTIVE','PAUSED')`,
      [bus_id]
    );
    if (active.rows.length > 0) {
      return res.status(409).json({ error: 'This bus already has an active trip.' });
    }

    const { rows } = await db.query(
      `INSERT INTO trips (bus_id, driver_id, route_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       RETURNING id, bus_id, driver_id, route_id, started_at, ended_at, status`,
      [bus_id, driverId, route_id]
    );

    return res.status(201).json({ trip: rows[0] });
  } catch (err) {
    console.error('Start trip error:', err);
    return res.status(500).json({ error: 'Failed to start trip.' });
  }
}

/** GET /api/trips/active — current active/paused trip for a bus */
async function getActiveTrip(req, res) {
  const { bus_id } = req.query;
  if (!bus_id) {
    return res.status(400).json({ error: 'bus_id query parameter is required.' });
  }
  try {
    const { rows } = await db.query(
      `SELECT id, bus_id, driver_id, route_id, started_at, ended_at, status
       FROM trips
       WHERE bus_id = $1 AND status IN ('ACTIVE','PAUSED')
       ORDER BY started_at DESC LIMIT 1`,
      [bus_id]
    );
    return res.json({ trip: rows[0] || null });
  } catch (err) {
    console.error('Get active trip error:', err);
    return res.status(500).json({ error: 'Failed to load trip.' });
  }
}

/** POST /api/trips/:id/pause */
async function pauseTrip(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `UPDATE trips SET status = 'PAUSED'
       WHERE id = $1 AND driver_id = $2 AND status = 'ACTIVE'
       RETURNING id, bus_id, driver_id, route_id, started_at, ended_at, status`,
      [id, req.user.driver_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active trip not found.' });
    }
    return res.json({ trip: rows[0] });
  } catch (err) {
    console.error('Pause trip error:', err);
    return res.status(500).json({ error: 'Failed to pause trip.' });
  }
}

/** POST /api/trips/:id/resume */
async function resumeTrip(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `UPDATE trips SET status = 'ACTIVE'
       WHERE id = $1 AND driver_id = $2 AND status = 'PAUSED'
       RETURNING id, bus_id, driver_id, route_id, started_at, ended_at, status`,
      [id, req.user.driver_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Paused trip not found.' });
    }
    return res.json({ trip: rows[0] });
  } catch (err) {
    console.error('Resume trip error:', err);
    return res.status(500).json({ error: 'Failed to resume trip.' });
  }
}

/** POST /api/trips/:id/end */
async function endTrip(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `UPDATE trips SET status = 'COMPLETED', ended_at = NOW()
       WHERE id = $1 AND driver_id = $2 AND status IN ('ACTIVE','PAUSED')
       RETURNING id, bus_id, driver_id, route_id, started_at, ended_at, status`,
      [id, req.user.driver_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Active trip not found.' });
    }
    return res.json({ trip: rows[0] });
  } catch (err) {
    console.error('End trip error:', err);
    return res.status(500).json({ error: 'Failed to end trip.' });
  }
}

module.exports = { startTrip, getActiveTrip, pauseTrip, resumeTrip, endTrip };