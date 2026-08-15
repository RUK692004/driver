const db = require('../config/db');

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

/** GET /api/routes/:id — route with all stops and road geometry */
async function getRouteById(req, res) {
  const { id } = req.params;
  const forceRefresh = String(req.query.refresh || '').toLowerCase() === 'true';

  try {
    const routeRes = await db.query(
      `SELECT id, route_name, start_location, end_location, route_geometry, is_active, created_at
       FROM routes WHERE id = $1`,
      [id]
    );
    if (routeRes.rows.length === 0) {
      return res.status(404).json({ error: 'Route not found.' });
    }

    const route = routeRes.rows[0];

    const stopsRes = await db.query(
      `SELECT id, route_id, stop_name, latitude, longitude, stop_order, eta_minutes
       FROM stops WHERE route_id = $1 ORDER BY stop_order ASC`,
      [id]
    );

    let routeGeometry = route.route_geometry;
    if ((!routeGeometry || forceRefresh) && stopsRes.rows.length >= 2) {
      const freshGeometry = await fetchRoadGeometry(stopsRes.rows);
      if (freshGeometry) {
        routeGeometry = freshGeometry;
        db.query('UPDATE routes SET route_geometry = $1 WHERE id = $2', [freshGeometry, id])
          .catch((err) => console.error('Auto-save route geometry error:', err.message));
      }
    }

    return res.json({ route: { ...route, route_geometry: routeGeometry, stops: stopsRes.rows } });
  } catch (err) {
    console.error('Get route error:', err);
    return res.status(500).json({ error: 'Failed to load route.' });
  }
}

/** GET /api/routes/:id/stops — stops only */
async function getRouteStops(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT id, route_id, stop_name, latitude, longitude, stop_order, eta_minutes
       FROM stops WHERE route_id = $1 ORDER BY stop_order`,
      [id]
    );
    return res.json({ stops: rows });
  } catch (err) {
    console.error('Get stops error:', err);
    return res.status(500).json({ error: 'Failed to load stops.' });
  }
}

module.exports = { getRouteById, getRouteStops };