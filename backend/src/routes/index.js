const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const authController = require('../controllers/authController');
const busController = require('../controllers/busController');
const routeController = require('../controllers/routeController');
const tripController = require('../controllers/tripController');
const locationController = require('../controllers/locationController');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Health check
router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ---- Auth (public) ----
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/forgot-password', authController.forgotPassword);

// ---- Auth (protected) ----
router.get('/auth/me', authenticate, authController.me);

// ---- Buses (protected) ----
router.get('/buses', authenticate, busController.getAssignedBuses);
router.get('/buses/:id', authenticate, busController.getBusById);

// ---- Routes (protected) ----
router.get('/routes/:id', authenticate, routeController.getRouteById);
router.get('/routes/:id/stops', authenticate, routeController.getRouteStops);

// ---- Trips (protected) ----
router.post('/trips', authenticate, tripController.startTrip);
router.get('/trips/active', authenticate, tripController.getActiveTrip);
router.post('/trips/:id/pause', authenticate, tripController.pauseTrip);
router.post('/trips/:id/resume', authenticate, tripController.resumeTrip);
router.post('/trips/:id/end', authenticate, tripController.endTrip);

// ---- Tracking (protected) ----
router.post('/tracking/location', authenticate, locationController.updateLocation);
router.get('/tracking/latest', authenticate, locationController.getLatestLocation);
router.get('/tracking/history', authenticate, locationController.getLocationHistory);

// ---- Admin (protected, ADMIN role only) ----
router.get('/admin/drivers', authenticate, requireRole('ADMIN'), adminController.listDrivers);
router.get('/admin/buses', authenticate, requireRole('ADMIN'), adminController.listBuses);
router.get('/admin/routes', authenticate, requireRole('ADMIN'), adminController.listRoutes);
router.get('/admin/geocode', authenticate, requireRole('ADMIN'), adminController.geocodeLocation);
router.get('/admin/assignments', authenticate, requireRole('ADMIN'), adminController.listAssignments);
router.post('/admin/buses', authenticate, requireRole('ADMIN'), adminController.createBus);
router.post('/admin/routes', authenticate, requireRole('ADMIN'), adminController.createRoute);
router.delete('/admin/routes/:id', authenticate, requireRole('ADMIN'), adminController.removeRoute);
router.patch('/admin/routes/:id/reactivate', authenticate, requireRole('ADMIN'), adminController.reactivateRoute);
router.post('/admin/routes/:id/regenerate-geometry', authenticate, requireRole('ADMIN'), adminController.regenerateRouteGeometry);
router.post('/admin/assign', authenticate, requireRole('ADMIN'), adminController.assignBus);
router.delete('/admin/assignments/:id', authenticate, requireRole('ADMIN'), adminController.removeAssignment);

module.exports = router;
