const db = require('../config/db');

/**
 * POST /api/tracking/location
 * Body: { bus_id, trip_id, latitude, longitude, speed, heading, timestamp }
 */
async function updateLocation(req, res) {
  const { bus_id, trip_id, latitude, longitude, speed = 0, heading = 0, timestamp } = req.body || {};

  if (!bus_id || !trip_id || latitude == null || longitude == null) {
    return res.status(400).json({
      error: 'bus_id, trip_id, latitude and longitude are required.',
    });
  }

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'latitude and longitude must be numbers.' });
  }

  try {
    // Verify the trip belongs to this driver and is active.
    const tripRes = await db.query(
      `SELECT id, bus_id, driver_id, route_id, status
       FROM trips WHERE id = $1 AND driver_id = $2 AND status IN ('ACTIVE','PAUSED')`,
      [trip_id, req.user.driver_id]
    );
    if (tripRes.rows.length === 0) {
      return res.status(403).json({ error: 'Trip not found or not active for this driver.' });
    }
    const trip = tripRes.rows[0];

    const recordedAt = timestamp ? new Date(timestamp) : new Date();

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert into bus_locations
      await client.query(
        `INSERT INTO bus_locations (trip_id, bus_id, latitude, longitude, speed, heading, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [trip_id, bus_id, latitude, longitude, speed, heading, recordedAt]
      );

      // Upsert latest_bus_position
      await client.query(
        `INSERT INTO latest_bus_position (bus_id, trip_id, latitude, longitude, speed, heading, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (bus_id) DO UPDATE SET
           trip_id = EXCLUDED.trip_id,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           speed = EXCLUDED.speed,
           heading = EXCLUDED.heading,
           updated_at = EXCLUDED.updated_at`,
        [bus_id, trip_id, latitude, longitude, speed, heading, recordedAt]
      );

      // --- Automatic stop detection (geofencing) ---
      // Fetch all stops for the trip's route.
      const stopsRes = await client.query(
        `SELECT id, stop_name, latitude, longitude, stop_order
         FROM stops WHERE route_id = $1 ORDER BY stop_order`,
        [trip.route_id]
      );

      const STOP_RADIUS_METERS = 50; // configurable
      let nearestStop = null;
      let nearestDistance = Infinity;

      for (const stop of stopsRes.rows) {
        const dist = haversine(latitude, longitude, stop.latitude, stop.longitude);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestStop = stop;
        }
      }

      const arrived = nearestStop && nearestDistance <= STOP_RADIUS_METERS;

      await client.query('COMMIT');

      return res.json({
        status: 'ok',
        recorded_at: recordedAt,
        stop_detection: {
          nearest_stop: nearestStop
            ? {
                id: nearestStop.id,
                stop_name: nearestStop.stop_name,
                stop_order: nearestStop.stop_order,
                distance_meters: Math.round(nearestDistance),
              }
            : null,
          arrived: !!arrived,
          radius_meters: STOP_RADIUS_METERS,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Update location error:', err);
    return res.status(500).json({ error: 'Failed to update location.' });
  }
}

/** GET /api/tracking/latest?bus_id= */
async function getLatestLocation(req, res) {
  const { bus_id } = req.query;
  if (!bus_id) {
    return res.status(400).json({ error: 'bus_id query parameter is required.' });
  }
  try {
    const { rows } = await db.query(
      `SELECT bus_id, trip_id, latitude, longitude, speed, heading, updated_at
       FROM latest_bus_position WHERE bus_id = $1`,
      [bus_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No location data for this bus.' });
    }
    return res.json({ location: rows[0] });
  } catch (err) {
    console.error('Get latest location error:', err);
    return res.status(500).json({ error: 'Failed to load location.' });
  }
}

/** GET /api/tracking/history?bus_id=&trip_id=&limit= */
async function getLocationHistory(req, res) {
  const { bus_id, trip_id, limit = 100 } = req.query;
  if (!bus_id) {
    return res.status(400).json({ error: 'bus_id query parameter is required.' });
  }
  try {
    const params = [bus_id];
    let sql = `SELECT id, trip_id, bus_id, latitude, longitude, speed, heading, recorded_at
               FROM bus_locations WHERE bus_id = $1`;
    if (trip_id) {
      params.push(trip_id);
      sql += ` AND trip_id = $${params.length}`;
    }
    params.push(Math.min(parseInt(limit, 10) || 100, 1000));
    sql += ` ORDER BY recorded_at DESC LIMIT $${params.length}`;

    const { rows } = await db.query(sql, params);
    return res.json({ locations: rows });
  } catch (err) {
    console.error('Get location history error:', err);
    return res.status(500).json({ error: 'Failed to load location history.' });
  }
}

/** Haversine distance in meters between two lat/lng points. */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { updateLocation, getLatestLocation, getLocationHistory };