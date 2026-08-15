const db = require('../config/db');

/** GET /api/admin/drivers — list all drivers with their user info */
async function listDrivers(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT d.id AS driver_id, d.license_number, d.status AS driver_status,
              u.id AS user_id, u.name, u.email, u.phone, u.created_at
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       ORDER BY u.name`
    );
    return res.json({ drivers: rows });
  } catch (err) {
    console.error('List drivers error:', err);
    return res.status(500).json({ error: 'Failed to load drivers.' });
  }
}

/** GET /api/admin/buses — list all buses */
async function listBuses(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT b.id, b.bus_number, b.bus_name, b.bus_type, b.capacity, b.status,
              ba.driver_id, ba.route_id,
              u.name AS assigned_driver_name,
              r.route_name
       FROM buses b
       LEFT JOIN bus_assignments ba ON ba.bus_id = b.id
       LEFT JOIN users u ON u.id = (SELECT user_id FROM drivers WHERE id = ba.driver_id)
       LEFT JOIN routes r ON r.id = ba.route_id
       ORDER BY b.bus_number`
    );
    return res.json({ buses: rows });
  } catch (err) {
    console.error('List buses error:', err);
    return res.status(500).json({ error: 'Failed to load buses.' });
  }
}

/** GET /api/admin/routes — list all routes with stop counts and active status */
async function listRoutes(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT r.id, r.route_name, r.start_location, r.end_location, r.is_active,
              (SELECT COUNT(*) FROM stops s WHERE s.route_id = r.id) AS total_stops
       FROM routes r
       ORDER BY r.is_active DESC, r.route_name ASC`
    );
    return res.json({ routes: rows });
  } catch (err) {
    console.error('List routes error:', err);
    return res.status(500).json({ error: 'Failed to load routes.' });
  }
}

/** GET /api/admin/geocode?query=... â€” search locations for route stops */
async function geocodeLocation(req, res) {
  const query = String(req.query.query || '').trim();
  if (query.length < 3) {
    return res.status(400).json({ error: 'Enter at least 3 characters to search.' });
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5' }).toString();
    const response = await fetch(url, {
      headers: { 'User-Agent': 'BusBeeAdmin/1.0 (route stop search)' },
    });
    if (!response.ok) throw new Error(`Geocoding service returned ${response.status}`);

    const places = await response.json();
    return res.json({
      results: places.map((place) => ({
        name: place.display_name,
        latitude: Number(place.lat),
        longitude: Number(place.lon),
      })),
    });
  } catch (err) {
    console.error('Geocoding error:', err);
    return res.status(502).json({ error: 'Location search is currently unavailable.' });
  }
}

/** GET /api/admin/assignments — list all bus assignments */
async function listAssignments(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT ba.id, ba.driver_id, ba.bus_id, ba.route_id, ba.assigned_at,
              u.name AS driver_name, u.email AS driver_email,
              b.bus_number, b.bus_name,
              r.route_name
       FROM bus_assignments ba
       JOIN drivers d ON d.id = ba.driver_id
       JOIN users u ON u.id = d.user_id
       JOIN buses b ON b.id = ba.bus_id
       LEFT JOIN routes r ON r.id = ba.route_id
       ORDER BY ba.assigned_at DESC`
    );
    return res.json({ assignments: rows });
  } catch (err) {
    console.error('List assignments error:', err);
    return res.status(500).json({ error: 'Failed to load assignments.' });
  }
}

/** POST /api/admin/buses — create a new bus */
async function createBus(req, res) {
  const { bus_number, bus_name, bus_type = 'STANDARD', capacity = 40, status = 'ACTIVE' } = req.body || {};

  if (!bus_number || !bus_name) {
    return res.status(400).json({ error: 'bus_number and bus_name are required.' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO buses (bus_number, bus_name, bus_type, capacity, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, bus_number, bus_name, bus_type, capacity, status`,
      [bus_number, bus_name, bus_type, capacity, status]
    );
    return res.status(201).json({ bus: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This bus number already exists.' });
    }
    console.error('Create bus error:', err);
    return res.status(500).json({ error: 'Failed to create bus.' });
  }
}

/** Calculate actual road route geometry via OSRM public routing API */
async function fetchRoadGeometry(stops) {
  if (!stops || stops.length < 2) {
    return null;
  }

  const coordsStr = stops.map((s) => `${s.longitude},${s.latitude}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

  try {
    console.log('🗺️ Requesting OSRM road route geometry...');
    console.log('URL:', url);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'BusBeeAdmin/1.0 (OSRM Road Routing)' },
    });

    console.log('OSRM status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OSRM HTTP error:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('OSRM response code:', data.code);

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const coordinates = data.routes[0].geometry.coordinates;
      console.log(`✅ OSRM returned ${coordinates.length} road points`);
      const roadPoints = coordinates.map(([lng, lat]) => [lat, lng]);
      return JSON.stringify(roadPoints);
    }

    console.error('❌ OSRM did not return a valid route:', data);
    return null;
  } catch (err) {
    console.error('❌ OSRM routing error:', err);
    return null;
  }
}

/** POST /api/admin/routes — create a new route with stops and road geometry */
async function createRoute(req, res) {
  const { route_name, start_location, end_location, stops = [] } = req.body || {};

  if (!route_name || !start_location || !end_location) {
    return res.status(400).json({ error: 'route_name, start_location and end_location are required.' });
  }

  const routeGeometry = await fetchRoadGeometry(stops);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const routeRes = await client.query(
      `INSERT INTO routes (route_name, start_location, end_location, route_geometry)
       VALUES ($1, $2, $3, $4) RETURNING id, route_name, start_location, end_location, route_geometry, is_active`,
      [route_name, start_location, end_location, routeGeometry]
    );
    const route = routeRes.rows[0];

    // Insert stops if provided
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      await client.query(
        `INSERT INTO stops (route_id, stop_name, latitude, longitude, stop_order, eta_minutes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [route.id, stop.stop_name, stop.latitude, stop.longitude, i, stop.eta_minutes || 0]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ route });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create route error:', err);
    return res.status(500).json({ error: 'Failed to create route.' });
  } finally {
    client.release();
  }
}

/** DELETE /api/admin/routes/:id — deactivate route (default) or permanently delete if ?force=true */
async function removeRoute(req, res) {
  const { id } = req.params;
  const force = String(req.query.force || '').toLowerCase() === 'true';

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const routeRes = await client.query('SELECT id, route_name FROM routes WHERE id = $1 FOR UPDATE', [id]);
    if (routeRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Route not found.' });
    }

    if (!force) {
      // Soft delete / deactivation
      await client.query('UPDATE routes SET is_active = false WHERE id = $1', [id]);
      await client.query('COMMIT');
      return res.json({ message: 'Route deactivated successfully.' });
    }

    // Permanent force deletion: clean up all dependent records in transaction
    await client.query(
      'DELETE FROM bus_locations WHERE trip_id IN (SELECT id FROM trips WHERE route_id = $1)',
      [id]
    );

    await client.query(
      'DELETE FROM latest_bus_position WHERE trip_id IN (SELECT id FROM trips WHERE route_id = $1)',
      [id]
    );

    await client.query(
      'UPDATE bus_assignments SET route_id = NULL WHERE route_id = $1',
      [id]
    );

    await client.query('DELETE FROM trips WHERE route_id = $1', [id]);
    await client.query('DELETE FROM stops WHERE route_id = $1', [id]);
    await client.query('DELETE FROM routes WHERE id = $1', [id]);

    await client.query('COMMIT');
    return res.json({ message: 'Route permanently deleted.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Remove route error:', err);
    return res.status(500).json({ error: 'Failed to delete route.' });
  } finally {
    client.release();
  }
}

/** PATCH /api/admin/routes/:id/reactivate — reactivate a deactivated route */
async function reactivateRoute(req, res) {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE routes SET is_active = true WHERE id = $1 RETURNING id, route_name`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found.' });
    }
    return res.json({ message: 'Route reactivated successfully.' });
  } catch (err) {
    console.error('Reactivate route error:', err);
    return res.status(500).json({ error: 'Failed to reactivate route.' });
  }
}

/** POST /api/admin/assign — assign a bus to a driver with a route */
async function assignBus(req, res) {
  const { driver_id, bus_id, route_id } = req.body || {};

  if (!driver_id || !bus_id) {
    return res.status(400).json({ error: 'driver_id and bus_id are required.' });
  }

  try {
    // Verify driver exists
    const driver = await db.query('SELECT id FROM drivers WHERE id = $1', [driver_id]);
    if (driver.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found.' });
    }

    // Verify bus exists
    const bus = await db.query('SELECT id FROM buses WHERE id = $1', [bus_id]);
    if (bus.rows.length === 0) {
      return res.status(404).json({ error: 'Bus not found.' });
    }

    // Verify active route exists if provided
    if (route_id) {
      const route = await db.query('SELECT id FROM routes WHERE id = $1 AND is_active = true', [route_id]);
      if (route.rows.length === 0) {
        return res.status(400).json({ error: 'Selected route is inactive or not found.' });
      }
    }

    // Upsert assignment (remove existing assignment for this bus first)
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Remove any existing assignment for this bus
      await client.query('DELETE FROM bus_assignments WHERE bus_id = $1', [bus_id]);

      // Insert new assignment
      const { rows } = await client.query(
        `INSERT INTO bus_assignments (driver_id, bus_id, route_id)
         VALUES ($1, $2, $3)
         RETURNING id, driver_id, bus_id, route_id, assigned_at`,
        [driver_id, bus_id, route_id || null]
      );

      await client.query('COMMIT');
      return res.status(201).json({ assignment: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Assign bus error:', err);
    return res.status(500).json({ error: 'Failed to assign bus.' });
  }
}

/** DELETE /api/admin/assignments/:id — remove an assignment */
async function removeAssignment(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      'DELETE FROM bus_assignments WHERE id = $1 RETURNING id',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }
    return res.json({ message: 'Assignment removed.' });
  } catch (err) {
    console.error('Remove assignment error:', err);
    return res.status(500).json({ error: 'Failed to remove assignment.' });
  }
}

/** POST /api/admin/routes/:id/regenerate-geometry — force recalculate OSRM road geometry */
async function regenerateRouteGeometry(req, res) {
  const { id } = req.params;
  try {
    const stopsRes = await db.query(
      `SELECT id, route_id, stop_name, latitude, longitude, stop_order
       FROM stops WHERE route_id = $1 ORDER BY stop_order ASC`,
      [id]
    );

    if (stopsRes.rows.length < 2) {
      return res.status(400).json({ error: 'Route needs at least 2 stops to calculate road geometry.' });
    }

    const routeGeometry = await fetchRoadGeometry(stopsRes.rows);
    if (!routeGeometry) {
      return res.status(502).json({ error: 'OSRM routing service is temporarily unavailable.' });
    }

    await db.query('UPDATE routes SET route_geometry = $1 WHERE id = $2', [routeGeometry, id]);
    return res.json({ message: 'Road route geometry regenerated successfully.', route_geometry: routeGeometry });
  } catch (err) {
    console.error('Regenerate route geometry error:', err);
    return res.status(500).json({ error: 'Failed to regenerate route geometry.' });
  }
}

module.exports = {
  listDrivers,
  listBuses,
  listRoutes,
  geocodeLocation,
  listAssignments,
  createBus,
  createRoute,
  removeRoute,
  reactivateRoute,
  regenerateRouteGeometry,
  assignBus,
  removeAssignment,
};
