const db = require('../config/db');

/** GET /api/buses — buses assigned to the authenticated driver */
async function getAssignedBuses(req, res) {
  const driverId = req.user.driver_id;
  if (!driverId) {
    return res.status(403).json({ error: 'No driver profile linked to this account.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT b.id, b.bus_number, b.bus_name, b.bus_type, b.capacity, b.status,
              ba.route_id, r.route_name, r.start_location, r.end_location,
              (SELECT COUNT(*) FROM stops s WHERE s.route_id = ba.route_id) AS total_stops,
              (SELECT t.status FROM trips t
                WHERE t.bus_id = b.id AND t.status IN ('ACTIVE','PAUSED')
                ORDER BY t.started_at DESC LIMIT 1) AS trip_status
       FROM bus_assignments ba
       JOIN buses b ON b.id = ba.bus_id
       LEFT JOIN routes r ON r.id = ba.route_id
       WHERE ba.driver_id = $1
       ORDER BY b.bus_number`,
      [driverId]
    );
    return res.json({ buses: rows });
  } catch (err) {
    console.error('Get assigned buses error:', err);
    return res.status(500).json({ error: 'Failed to load buses.' });
  }
}

/** GET /api/buses/:id — single bus detail */
async function getBusById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT b.id, b.bus_number, b.bus_name, b.bus_type, b.capacity, b.status,
              ba.route_id, r.route_name, r.start_location, r.end_location,
              (SELECT COUNT(*) FROM stops s WHERE s.route_id = ba.route_id) AS total_stops
       FROM buses b
       LEFT JOIN bus_assignments ba ON ba.bus_id = b.id AND ba.driver_id = $2
       LEFT JOIN routes r ON r.id = ba.route_id
       WHERE b.id = $1`,
      [id, req.user.driver_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Bus not found.' });
    }
    return res.json({ bus: rows[0] });
  } catch (err) {
    console.error('Get bus error:', err);
    return res.status(500).json({ error: 'Failed to load bus.' });
  }
}

module.exports = { getAssignedBuses, getBusById };