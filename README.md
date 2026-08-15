# BusBee — Bus Driver Mobile Application (Flutter)

A production-ready **bus driver tracking application** with a Flutter mobile app, a Node.js REST API backend, a PostgreSQL database, and an **Admin Web Dashboard** for managing drivers, buses, routes, and assignments.

```
Flutter App  ──HTTPS/JSON──▶  REST API (Node.js + Express + JWT)  ──▶  PostgreSQL
Admin Web   ──HTTPS/JSON──▶  REST API (same backend)             ──▶  PostgreSQL
```

---

## 📦 What You Get

| Component | Technology |
|-----------|-----------|
| Mobile App | Flutter + Riverpod + Google Maps |
| Backend API | Node.js + Express + JWT |
| Database | PostgreSQL |
| **Admin Dashboard** | **Web page at `http://localhost:5000/admin`** |
| GPS Tracking | Flutter Geolocator (distance-based, e.g. 10 m) |
| Stop Detection | Geofencing (50 m radius, configurable) |
| Offline Queue | Secure local storage, auto-resync |
| Auth | JWT with secure token storage |

Features: login, signup, driver dashboard, bus assignment, route map with all stops, live GPS tracking, trip start/pause/resume/end, automatic stop detection, offline handling, **admin panel to assign buses/routes to drivers**.

---

## 🚀 Quick Start — Make It Work End to End

> **Total time:** ~15–20 minutes. Follow steps in order.

### Prerequisites

Install these first:

| Tool | Check |
|------|-------|
| Node.js 18+ | `node --version` |
| PostgreSQL 14+ | `psql --version` |
| Flutter 3.41+ | `flutter --version` |
| Android Studio (or Xcode for iOS) | — |
| Git (optional) | `git --version` |

---

### STEP 1 — Set Up PostgreSQL Database

Open a terminal and run:

```bash
# Connect to PostgreSQL as the postgres superuser
psql -U postgres
```

Inside the `psql` prompt, create the database and exit:

```sql
CREATE DATABASE busbee;
\q
```

**Windows users:** if `psql` is not on your PATH, open **pgAdmin**, right-click **Databases → Create → Database**, name it `busbee`, and click Save.

---

### STEP 2 — Run the Database Schema

**Important:** Run this from your **normal terminal** (not inside the psql prompt). Open a new terminal window:

```bash
cd backend
psql -U postgres -d busbee -f database/schema.sql
```

Expected output: a list of `CREATE TABLE`, `CREATE INDEX`, and `INSERT` statements.

> **Troubleshooting:** If you get a password prompt, enter your PostgreSQL password. If you get `password authentication failed`, your user/password differs — update the `DATABASE_URL` in the next step instead.

---

### STEP 3 — Configure the Backend

```bash
cd backend

# Install Node dependencies
npm install

# Create the .env file from the template
copy .env.example .env        # Windows CMD
# --or--
cp .env.example .env          # macOS / Linux
```

Then open `.env` and set your real values:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/busbee
JWT_SECRET=change_this_to_a_long_random_secret_string
CORS_ORIGIN=*
```

> **Important:** Replace `YOUR_POSTGRES_PASSWORD` with the password you use for the `postgres` user. If your PostgreSQL username is different, change `postgres` as well.

---

### STEP 4 — Start the Backend

```bash
npm run dev
```

You should see:

```
BusBee driver API running on http://localhost:5000
Health: http://localhost:5000/api/health
Admin dashboard: http://localhost:5000/admin
```

**Verify it works** — open a new terminal and run:

```bash
curl http://localhost:5000/api/health
```

Expected response:

```json
{"status":"ok","time":"2026-08-12T10:30:00.000Z"}
```

---

### STEP 5 — Login to the Admin Dashboard

Open your browser and go to:

```
http://localhost:5000/admin
```

**Default admin credentials** (seeded by the schema):

```
Email:    admin@busbee.com
Password: Admin@123
```

If login does not move to the dashboard, refresh the page once after starting
the backend. For an existing database created before this fix, repair the
seeded admin password from the `backend` directory:

```bash
node fix_admin.js
```

The command uses `DATABASE_URL` from `backend/.env` and resets only the
default `admin@busbee.com` account to `Admin@123`.

> **⚠ Important:** Change the default admin password after first login for production.

The admin dashboard has **4 tabs**:

| Tab | What you can do |
|-----|----------------|
| **Drivers** | View all registered drivers (name, email, phone, license, status) |
| **Buses** | Add new buses (number, name, type, capacity) and view all buses with their assigned driver/route |
| **Routes** | Create new routes with stops (name, start, end, stops with lat/lng/ETA) and view all routes |
| **Assignments** | Assign a bus to a driver (with optional route), view all assignments, remove assignments |

### How to assign a bus to a driver (via Admin Dashboard)

1. **First, register a driver** in the Flutter app (or via API).
2. Open `http://localhost:5000/admin` and login as admin.
3. Go to the **Buses** tab → **Add New Bus** → enter bus number, name, type, capacity → click **Add Bus**.
4. Go to the **Routes** tab → **Add New Route** → enter route name, start, end → add stops (name, lat, lng, ETA) → click **Create Route**.
5. Go to the **Assignments** tab → select a **Driver**, select a **Bus**, select a **Route** (optional) → click **Assign Bus**.
6. The driver's Flutter app will now show the assigned bus on their dashboard.

---

### STEP 6 — Configure the Flutter App

```bash
cd BusB_rohith/flutter_app

# Install Flutter dependencies
flutter pub get
```

Create the `.env` file in this folder:

```env
API_BASE_URL=http://localhost:5000/api
TRACKING_INTERVAL_SECONDS=4
TRACKING_DISTANCE_FILTER_METERS=10
STOP_RADIUS_METERS=50
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

> **⚠ Android emulator:** replace `localhost` with `10.0.2.2`:
> `API_BASE_URL=http://10.0.2.2:5000/api`
>
> **⚠ Physical device:** use your computer's LAN IP, e.g. `http://192.168.1.10:5000/api`.
> Both the phone and the computer must be on the same Wi-Fi network.

---

### STEP 7 — Get a Google Maps API Key

1. Go to <https://console.cloud.google.com>
2. Create a project (or use an existing one).
3. Go to **APIs & Services → Library**.
4. Search and **enable**:
   - **Maps SDK for Android**
   - **Maps SDK for iOS** (only if building for iOS)
5. Go to **APIs & Services → Credentials → Create Credentials → API Key**.
6. Copy the key.
7. Put it in your Flutter `.env` as `GOOGLE_MAPS_API_KEY=...`.

**Android only** — add the key to the Android manifest at
`android/app/src/main/AndroidManifest.xml` inside `<application>`:

```xml
<meta-data
  android:name="com.google.android.geo.API_KEY"
  android:value="YOUR_GOOGLE_MAPS_API_KEY" />
```

**iOS only** — add the key to `ios/Runner/AppDelegate.swift`:

```swift
GMSServices.provideAPIKey("YOUR_IOS_MAPS_API_KEY")
```

---

### STEP 8 — Run the Flutter App

```bash
flutter run
```

Choose a device (Android emulator or physical device).

---

### STEP 9 — Use the App

1. Tap **Get Started**.
2. Tap **Create driver account** and register with:
   - Full name, phone, email, password (6+ chars), Driver ID / License number.
   - The account is created and you are logged in automatically.
3. You land on the **Driver Dashboard** showing your assigned bus(es) (assigned via the admin dashboard).
4. Tap **View Route & Tracking** to open the map.
5. Tap **Start Trip**.
   - The app requests location permission (accept it).
   - It verifies GPS is on.
   - It starts streaming GPS and sending updates to the backend.
6. The map shows:
   - Route polyline (blue)
   - Green marker = start stop, red = end, blue = intermediate stops
   - Auto camera follows the bus
   - Speed, sync time, and tracking status shown at the bottom
7. When you get within **50 m** of a stop, the app marks it as arrived and shows your progress.
8. Use **Pause** / **Resume** anytime.
9. Tap **End Trip** to stop tracking (with confirmation dialog).

---

## 🧪 Quick API Test (without the app)

```bash
# Register a driver
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Rahul Kumar","email":"rahul@test.com","phone":"+919876543210","password":"secret123","licenseNumber":"KL-01-112233"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rahul@test.com","password":"secret123"}'
# → copy the token

# Get assigned buses
curl http://localhost:5000/api/buses \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get route with stops (route 1 from seed)
curl http://localhost:5000/api/routes/1 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Start a trip (bus 1, route 1)
curl -X POST http://localhost:5000/api/trips \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bus_id":1,"route_id":1}'

# Send a GPS location update
curl -X POST http://localhost:5000/api/tracking/location \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bus_id":1,"trip_id":1,"latitude":8.5241,"longitude":76.9366,"speed":32.5,"heading":120}'

# Get latest position
curl "http://localhost:5000/api/tracking/latest?bus_id=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Admin API (requires ADMIN role)

```bash
# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@busbee.com","password":"Admin@123"}'
# → copy the admin token

# List all drivers
curl http://localhost:5000/api/admin/drivers \
  -H "Authorization: Bearer ADMIN_TOKEN"

# List all buses
curl http://localhost:5000/api/admin/buses \
  -H "Authorization: Bearer ADMIN_TOKEN"

# List all routes
curl http://localhost:5000/api/admin/routes \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Create a bus
curl -X POST http://localhost:5000/api/admin/buses \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bus_number":"KL-01-AB-1234","bus_name":"Trivandrum Express","bus_type":"STANDARD","capacity":40}'

# Create a route with stops
curl -X POST http://localhost:5000/api/admin/routes \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"route_name":"Trivandrum - Kollam","start_location":"Trivandrum Central","end_location":"Kollam","stops":[{"stop_name":"Pattom","latitude":8.5144,"longitude":76.9443,"eta_minutes":8}]}'

# Assign a bus to a driver
curl -X POST http://localhost:5000/api/admin/assign \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"driver_id":1,"bus_id":1,"route_id":1}'

# List all assignments
curl http://localhost:5000/api/admin/assignments \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Remove an assignment
curl -X DELETE http://localhost:5000/api/admin/assignments/1 \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## 📁 Project Structure

```
driver_app/
├── backend/
│   ├── database/schema.sql        # PostgreSQL schema + seed data
│   ├── public/
│   │   └── index.html             # Admin web dashboard
│   ├── src/
│   │   ├── config/db.js           # Database connection pool
│   │   ├── controllers/           # Auth, Bus, Route, Trip, Location, Admin
│   │   ├── middleware/auth.js     # JWT verification + role check
│   │   ├── routes/index.js        # All API routes
│   │   └── server.js              # Express server entry point
│   ├── .env.example               # Copy to .env
│   └── package.json
├── docs/API_SPEC.md               # Complete REST API documentation
├── BusB_rohith/flutter_app/       # Flutter mobile application
│   ├── lib/
│   │   ├── core/                  # Config, network (Dio + JWT), utils
│   │   ├── data/repositories/     # Auth, Bus, Route, Trip, Location services
│   │   ├── domain/models/         # User, Bus, Route, Stop, Trip, BusLocation
│   │   ├── services/              # GPS, tracking, stop detection, offline queue
│   │   ├── providers/             # Riverpod providers
│   │   └── screens/               # Splash, Login, Signup, Dashboard, Map
│   └── .env                       # Flutter environment config
└── README.md
```

---

## 🗄️ Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Accounts with role (DRIVER / PASSENGER / ADMIN) |
| `drivers` | Driver profiles + license numbers |
| `buses` | Bus fleet details |
| `routes` | Route definitions |
| `stops` | Ordered stops with lat/lng + ETA |
| `trips` | Trip lifecycle (ACTIVE / PAUSED / COMPLETED) |
| `bus_assignments` | Driver ↔ bus (many-to-many) with route |
| `bus_locations` | GPS location history |
| `latest_bus_position` | Latest known position per bus (for passenger app) |

---

## 📄 REST API (Summary)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Driver signup |
| POST | `/api/auth/login` | Login → JWT token |
| POST | `/api/auth/forgot-password` | Password reset |
| GET | `/api/auth/me` | Current user |
| GET | `/api/buses` | Assigned buses |
| GET | `/api/routes/:id` | Route + stops |
| POST | `/api/trips` | Start trip |
| GET | `/api/trips/active?bus_id=` | Active trip |
| POST | `/api/trips/:id/pause` | Pause trip |
| POST | `/api/trips/:id/resume` | Resume trip |
| POST | `/api/trips/:id/end` | End trip |
| POST | `/api/tracking/location` | Send GPS update (auth required) |
| GET | `/api/tracking/latest?bus_id=` | Latest bus position |
| GET | `/api/tracking/history` | Location history |
| **GET** | **`/api/admin/drivers`** | **List all drivers (ADMIN)** |
| **GET** | **`/api/admin/buses`** | **List all buses (ADMIN)** |
| **GET** | **`/api/admin/routes`** | **List all routes with active status (ADMIN)** |
| **GET** | **`/api/admin/assignments`** | **List all assignments (ADMIN)** |
| **POST** | **`/api/admin/buses`** | **Create a bus (ADMIN)** |
| **POST** | **`/api/admin/routes`** | **Create a route with stops (ADMIN)** |
| **DELETE** | **`/api/admin/routes/:id`** | **Deactivate route (soft) or `?force=true` (permanent) (ADMIN)** |
| **PATCH** | **`/api/admin/routes/:id/reactivate`** | **Reactivate a route (ADMIN)** |
| **POST** | **`/api/admin/routes/:id/regenerate-geometry`** | **Recalculate OSRM road geometry (ADMIN)** |
| **POST** | **`/api/admin/assign`** | **Assign bus to driver (ADMIN)** |
| **DELETE** | **`/api/admin/assignments/:id`** | **Remove assignment (ADMIN)** |

Full details with JSON examples: ➡ **[`docs/API_SPEC.md`](docs/API_SPEC.md)**

---

## 🛠️ Troubleshooting

### Android emulator can't reach the backend
Use `http://10.0.2.2:5000/api` (special alias for the host machine).

### Physical device can't reach the backend
- Use your computer's LAN IP in `.env`.
- Ensure the phone and computer are on the **same Wi-Fi**.
- Allow ports through the Windows firewall (inbound rule for port 5000).

### Google Maps shows a blank screen
- Verify the Maps SDK is enabled in Google Cloud Console.
- Verify the API key is in both `.env` and `AndroidManifest.xml`.
- Make sure your Android app signing SHA-1 fingerprint is registered (debug keystore is fine for development).

### Login fails / 401
- Token expired → login again.
- Backend not running → start it with `npm run dev`.

### Empty dashboard ("No buses assigned")
- The driver has no `bus_assignments` row.
- Use the **Admin Dashboard** at `http://localhost:5000/admin` to assign a bus to the driver.

### Can't login to admin dashboard
- Use the seeded admin: `admin@busbee.com` / `Admin@123`
- If the seed didn't run, insert an admin manually:
  ```sql
  INSERT INTO users (name, email, password_hash, role)
  VALUES ('Admin', 'admin@busbee.com', '$2a$10$gIX8w8NmZmc1gFz920uLJObfUim6J68OGGkd2dlp3jSy/bEKuwP8S', 'ADMIN');
  ```

### Database connection error at startup
- PostgreSQL must be running.
- User/password in `DATABASE_URL` must be correct.
- Database `busbee` must exist.

### Backend health check works but app can't connect
- Check CORS (default `*` is fine).
- Check that the Android app uses `10.0.2.2` not `localhost`.
- Check if your device blocks cleartext HTTP — for dev, add `android:usesCleartextTraffic="true"` to the `<application>` tag in `AndroidManifest.xml`.

---

## 🧭 What's Next (Production Roadmap)

- WebSocket (Socket.IO) push updates for the passenger app
- Email verification + real password-reset emails
- Admin web dashboard (manage buses, routes, drivers)
- Push notifications (FCM)
- HTTPS + proper CORS in production
- Distance-based stop ETA calculation

</final_file_content>

IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.




				# TODO LIST UPDATE REQUIRED - You MUST include the task_progress parameter in your NEXT tool call.

				**Current Progress: 19/19 items completed (100%)**

				- [x] Explore existing project structure
- [x] Analyze current current Flutter app state
- [x] Plan architecture and implementation
- [x] Implement backend (PostgreSQL schema, REST API, JWT auth)
- [x] Implement Flutter clean architecture (core, data, domain, services)
- [x] Implement authentication (login/signup)
- [x] Implement driver dashboard
- [x] Implement bus assignment
- [x] Implement route management
- [x] Implement driver map
- [x] Implement live GPS tracking
- [x] Implement trip controls
- [x] Implement offline handling
- [x] Implement stop detection
- [x] Install Flutter dependencies
- [x] Create REST API specification
- [x] Create README
- [x] Verify final result
- [x] Update README with complete practical setup instructions

				

				
1. To create or update a todo list, include the task_progress parameter in the next tool call
2. Review each item and update its status:
   - Mark completed items with: - [x]
   - Keep incomplete items as: - [ ]
   - Add new items if you discover additional steps
3. Modify the list as needed:
		- Add any new steps you've discovered
		- Reorder if the sequence has changed
4. Ensure the list accurately reflects the current state

**Remember:** Keeping the task_progress list updated helps track progress and ensures nothing is missed.

				

**Note:** 100% of items are complete! Focus on finishing the remaining items.

				
<environment_details>
# Visual Studio Code Visible Files
README.md

# Visual Studio Code Open Tabs
BusB_rohith/flutter_app/.env
README.md

# Current Time
8/12/2026, 6:37:56 PM (Asia/Calcutta, UTC+5.5:00)

# Context Window Usage
244,990 / 1,048.576K tokens used (23%)

# Current Mode
ACT MODE
</environment_details>
