-- ============================================================
-- BusBee Bus Driver Tracking System - PostgreSQL Schema
-- ============================================================

-- Enable UUID extension (optional, used for stable IDs)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(160) NOT NULL UNIQUE,
    phone         VARCHAR(20),
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'DRIVER'
                  CHECK (role IN ('DRIVER', 'PASSENGER', 'ADMIN')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- drivers
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    license_number  VARCHAR(40) NOT NULL UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- buses
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buses (
    id          SERIAL PRIMARY KEY,
    bus_number  VARCHAR(30) NOT NULL UNIQUE,
    bus_name    VARCHAR(120) NOT NULL,
    bus_type    VARCHAR(40) DEFAULT 'STANDARD',
    capacity    INTEGER NOT NULL DEFAULT 40,
    status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- routes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routes (
    id              SERIAL PRIMARY KEY,
    route_name      VARCHAR(160) NOT NULL,
    start_location  VARCHAR(160) NOT NULL,
    end_location    VARCHAR(160) NOT NULL,
    route_geometry  TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_geometry TEXT;

-- ------------------------------------------------------------
-- stops
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stops (
    id          SERIAL PRIMARY KEY,
    route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_name   VARCHAR(160) NOT NULL,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    stop_order  INTEGER NOT NULL,
    eta_minutes INTEGER DEFAULT 0,
    UNIQUE (route_id, stop_order)
);

-- ------------------------------------------------------------
-- trips
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
    id          SERIAL PRIMARY KEY,
    bus_id      INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    driver_id   INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at    TIMESTAMPTZ,
    status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- bus_locations
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bus_locations (
    id          BIGSERIAL PRIMARY KEY,
    trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    bus_id      INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    speed       DOUBLE PRECISION DEFAULT 0,
    heading     DOUBLE PRECISION DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- bus_assignments (driver <-> bus many-to-many)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bus_assignments (
    id          SERIAL PRIMARY KEY,
    driver_id   INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    bus_id      INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    route_id    INTEGER REFERENCES routes(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (driver_id, bus_id)
);

-- ------------------------------------------------------------
-- latest_bus_position (maintains latest known location per active bus)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS latest_bus_position (
    bus_id      INTEGER PRIMARY KEY REFERENCES buses(id) ON DELETE CASCADE,
    trip_id     INTEGER REFERENCES trips(id) ON DELETE CASCADE,
    latitude    DOUBLE PRECISION NOT NULL,
    longitude   DOUBLE PRECISION NOT NULL,
    speed       DOUBLE PRECISION DEFAULT 0,
    heading     DOUBLE PRECISION DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bus_locations_bus_id      ON bus_locations (bus_id);
CREATE INDEX IF NOT EXISTS idx_bus_locations_trip_id     ON bus_locations (trip_id);
CREATE INDEX IF NOT EXISTS idx_bus_locations_recorded_at ON bus_locations (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_stops_route_id            ON stops (route_id);
CREATE INDEX IF NOT EXISTS idx_trips_bus_id              ON trips (bus_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id           ON trips (driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_route_id            ON trips (route_id);
CREATE INDEX IF NOT EXISTS idx_trips_status              ON trips (status);
CREATE INDEX IF NOT EXISTS idx_bus_assignments_driver    ON bus_assignments (driver_id);
CREATE INDEX IF NOT EXISTS idx_bus_assignments_bus       ON bus_assignments (bus_id);

-- ------------------------------------------------------------
-- Seed data (optional, for development)
-- ------------------------------------------------------------
-- Default admin user: admin@busbee.com / Admin@123
INSERT INTO users (name, email, phone, password_hash, role)
SELECT 'System Admin', 'admin@busbee.com', '+919000000000',
       '$2a$10$GDQEzBv0j.9fUf84HHMZ7es4pguZmY00Qj6zxo.8yrJbl00adRcKK', 'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@busbee.com');

-- Sample route: Trivandrum -> Kollam
INSERT INTO routes (route_name, start_location, end_location)
SELECT 'Trivandrum - Kollam', 'Trivandrum Central', 'Kollam'
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE route_name = 'Trivandrum - Kollam');

INSERT INTO stops (route_id, stop_name, latitude, longitude, stop_order, eta_minutes)
SELECT r.id, s.stop_name, s.latitude, s.longitude, s.stop_order, s.eta_minutes
FROM routes r
CROSS JOIN (VALUES
    ('Trivandrum Central', 8.4875, 76.9524, 0, 0),
    ('Pattom',             8.5144, 76.9443, 1, 8),
    ('Kesavadasapuram',    8.5261, 76.9366, 2, 14),
    ('Kazhakkoottam',      8.5700, 76.8800, 3, 25),
    ('Attingal',           8.6960, 76.8150, 4, 45),
    ('Kollam',             8.8932, 76.6141, 5, 75)
) AS s(stop_name, latitude, longitude, stop_order, eta_minutes)
WHERE r.route_name = 'Trivandrum - Kollam'
  AND NOT EXISTS (SELECT 1 FROM stops WHERE route_id = r.id);
