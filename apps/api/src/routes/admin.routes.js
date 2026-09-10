const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const managerController = require('../controllers/manager.controller');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const isAdmin = [authenticate, authorize('admin')];
const isAdminOrManager = [authenticate, authorize('admin', 'manager')];

router.get('/status', adminController.getStatus);
router.get('/dashboard', isAdmin, adminController.getDashboard);

router.get('/employees', isAdmin, adminController.getEmployees);
router.get('/teams', isAdmin, adminController.getTeams);
router.post('/teams', isAdmin, adminController.createTeam);
router.patch('/teams/:id', isAdmin, adminController.updateTeam);
router.post('/users', isAdmin, adminController.createUser);
router.patch('/users/:id', isAdmin, adminController.updateUser);

// Office Locations
router.get('/office-locations', isAdminOrManager, adminController.getOfficeLocations);
router.post('/office-locations', isAdminOrManager, adminController.createOfficeLocation);
router.patch('/office-locations/:id', isAdminOrManager, adminController.updateOfficeLocation);
router.delete('/office-locations/:id', isAdminOrManager, adminController.deleteOfficeLocation);
router.get('/current-ip', isAdminOrManager, adminController.getCurrentIp);

// Device Requests
router.get('/device-requests', isAdmin, adminController.getDeviceRequests);
router.patch('/device-requests/:id/decision', isAdmin, adminController.handleDeviceRequestDecision);

// Manual Attendance Decision
router.post('/manual-attendance/:id/decision', isAdmin, managerController.handleManualAttendanceDecision);

// Attendance Method Settings
router.get('/attendance-method/active', isAdminOrManager, adminController.getActiveAttendanceMethod);
router.patch('/attendance-method/switch', isAdminOrManager, adminController.switchAttendanceMethod);

// Manager Permissions
router.get('/manager-permissions', isAdmin, adminController.getManagerPermissions);
router.patch('/manager-permissions/:userId', isAdmin, adminController.updateManagerPermission);

module.exports = router;
