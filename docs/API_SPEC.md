# BusBee Driver Application — REST API Specification

Base URL: `http://localhost:5000/api`

All endpoints (except auth and health) require a Bearer token:
```
Authorization: Bearer <jwt_token>
```

---

## 1. Health Check

### `GET /health`

```json
{
  "status": "ok",
  "time": "2026-08-12T10:30:00Z"
}
```

---

## 2. Authentication

### `POST /auth/register`

Create a driver account.

**Request:**
```json
{
  "name": "Rahul Kumar",
  "email": "rahul@example.com",
  "phone": "+919876543210",
  "password": "secret123",
  "licenseNumber": "KL-01-2024-112233"
}
```

**Response — 201:**
```json
{
  "token": "jwt_token",
  "user": {
    "id": 1,
    "name": "Rahul Kumar",
    "email": "rahul@example.com",
    "phone": "+919876543210",
    "role": "DRIVER",
    "driver_id": 1,
    "license_number": "KL-01-2024-112233"
  }
}
```

**Errors:**
- 400 — Missing fields / invalid email / short password
- 409 — Email or license number already registered

### `POST /auth/login`

**Request:**
```json
{
  "email": "rahul@example.com",
  "password": "secret123"
}
```

**Response — 200:**
Same shape as register.

**Errors:**
- 401 — Invalid email or password
- 403 — Account suspended

### `POST /auth/forgot-password`

**Request:**
```json
{ "email": "rahul@example.com" }
```

**Response — 200:**
```json
{ "message": "If that email exists, a reset link has been sent." }
```

### `GET /auth/me`

Get current authenticated user profile.

**Response — 200:**
```json
{
  "user": {
    "id": 1,
    "name": "Rahul Kumar",
    "email": "rahul@example.com",
    "phone": "+919876543210",
    "role": "DRIVER",
    "created_at": "2026-01-01T00:00:00Z",
    "driver_id": 1,
    "license_number": "KL-01-2024-112233",
    "driver_status": "ACTIVE"
  }
}
```

---

## 3. Buses

### `GET /buses`

Get all buses assigned to the authenticated driver.

**Response — 200:**
```json
{
  "buses": [
    {
      "id": 12,
      "bus_number": "KL-01-AB-1234",
      "bus_name": "Trivandrum Express",
      "bus_type": "STANDARD",
      "capacity": 40,
      "status": "ACTIVE",
      "route_id": 5,
      "route_name": "Trivandrum - Kollam",
      "start_location": "Trivandrum Central",
      "end_location": "Kollam",
      "total_stops": 6,
      "trip_status": null
    }
  ]
}
```

### `GET /buses/:id`

Get a single bus detail.

---

## 4. Routes

### `GET /routes/:id`

Get route with all ordered stops.

**Response — 200:**
```json
{
  "route": {
    "id": 5,
    "route_name": "Trivandrum - Kollam",
    "start_location": "Trivandrum Central",
    "end_location": "Kollam",
    "route_geometry": "[[8.4875,76.9524],[8.4901,76.9510],[8.5144,76.9443]]",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00Z",
    "stops": [
      {
        "id": 41,
        "route_id": 5,
        "stop_name": "Trivandrum Central",
        "latitude": 8.4875,
        "longitude": 76.9524,
        "stop_order": 0,
        "eta_minutes": 0
      },
      {
        "id": 42,
        "route_id": 5,
        "stop_name": "Pattom",
        "latitude": 8.5144,
        "longitude": 76.9443,
        "stop_order": 1,
        "eta_minutes": 8
      }
    ]
  }
}
```

### `GET /routes/:id/stops`

Get stops only, ordered by `stop_order`.

### `DELETE /admin/routes/:id`

- **Normal delete (default)**: Soft deletes / deactivates a route (`is_active = false`). Historical trips and GPS logs are preserved.
- **Permanent delete (`?force=true`)**: Deletes the route, stops, trips, and location history inside a single database transaction (`BEGIN` / `COMMIT`).

### `PATCH /admin/routes/:id/reactivate`

Reactivate a deactivated route (`is_active = true`).

### `POST /admin/routes/:id/regenerate-geometry`

Force recalculate and update OSRM road driving geometry for an existing route.

---

## 5. Trips

### `POST /trips`

Start a new trip. Creates an `ACTIVE` trip.

**Request:**
```json
{
  "bus_id": 12,
  "route_id": 5
}
```

**Response — 201:**
```json
{
  "trip": {
    "id": 103,
    "bus_id": 12,
    "driver_id": 25,
    "route_id": 5,
    "started_at": "2026-08-12T10:30:00Z",
    "ended_at": null,
    "status": "ACTIVE"
  }
}
```

**Errors:**
- 403 — Bus not assigned to driver
- 409 — Bus already has an active trip

### `GET /trips/active?bus_id=12`

Get the current active or paused trip for a bus.

**Response — 200:**
```json
{ "trip": { ... } }
```
Or `{ "trip": null }` when no active trip.

### `POST /trips/:id/pause`

Pause an active trip.

### `POST /trips/:id/resume`

Resume a paused trip.

### `POST /trips/:id/end`

End a trip. Sets `status = COMPLETED` and `ended_at = NOW()`.

---

## 6. Tracking

### `POST /tracking/location`

Send a location update from the driver.

**Request:**
```json
{
  "bus_id": 12,
  "trip_id": 103,
  "latitude": 8.5241,
  "longitude": 76.9366,
  "speed": 32.5,
  "heading": 120,
  "timestamp": "2026-08-12T10:30:00Z"
}
```

**Response — 200:**
```json
{
  "status": "ok",
  "recorded_at": "2026-08-12T10:30:00Z",
  "stop_detection": {
    "nearest_stop": {
      "id": 43,
      "stop_name": "Kesavadasapuram",
      "stop_order": 2,
      "distance_meters": 35
    },
    "arrived": true,
    "radius_meters": 50
  }
}
```

The backend:
- Inserts into `bus_locations`
- Upserts `latest_bus_position`
- Runs automatic geofencing stop detection (50m radius)

### `GET /tracking/latest?bus_id=12`

Get the latest known position for a bus.

**Response — 200:**
```json
{
  "location": {
    "bus_id": 12,
    "trip_id": 103,
    "latitude": 8.5241,
    "longitude": 76.9366,
    "speed": 31,
    "heading": 120,
    "updated_at": "2026-08-12T10:30:00Z"
  }
}
```

### `GET /tracking/history?bus_id=12&trip_id=103&limit=100`

Get location history, newest first, capped at 1000 per request.

---

## Common Error Format

```json
{ "error": "Human readable message" }
```

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Invalid request body |
| 401 | Unauthenticated / token expired |
| 403 | Insufficient permissions / not assigned |
| 404 | Resource not found |
| 409 | Conflict (duplicate, already active) |
| 500 | Internal server error |