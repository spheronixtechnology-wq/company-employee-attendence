const express = require('express');
const router = express.Router();
const managerController = require('../controllers/manager.controller');
const adminController = require('../controllers/admin.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const isManager = [authenticate, authorize('manager')];

router.get('/status', managerController.getStatus);

router.get('/dashboard', isManager, managerController.getDashboard);

router.get('/team/attendance', isManager, managerController.getTeamAttendance);
router.get('/team/members', isManager, managerController.getTeamMembers);
router.get('/team/daily-logs', isManager, managerController.getTeamDailyLogs);

router.get('/team/leave-requests', isManager, managerController.getTeamLeaveRequests);
router.post('/team/leave/:id/decision', isManager, managerController.handleLeaveDecision);

router.get('/device-requests', isManager, managerController.getDeviceRequests);
router.patch('/device-requests/:id/decision', isManager, managerController.handleDeviceRequestDecision);

router.get('/location-requests', isManager, managerController.getLocationRequests);
router.patch('/location-requests/:id/decision', isManager, managerController.handleLocationRequestDecision);

// Manual Attendance Decisions
router.post('/team/manual-attendance/:id/decision', isManager, managerController.handleManualAttendanceDecision);

// System Settings & Configuration (Attendance Method, WiFi/IP, Office Locations)
router.get('/attendance-method/active', isManager, adminController.getActiveAttendanceMethod);
router.patch('/attendance-method/switch', isManager, adminController.switchAttendanceMethod);

router.get('/office-locations', isManager, adminController.getOfficeLocations);
router.post('/office-locations', isManager, adminController.createOfficeLocation);
router.patch('/office-locations/:id', isManager, adminController.updateOfficeLocation);
router.delete('/office-locations/:id', isManager, adminController.deleteOfficeLocation);
router.get('/current-ip', isManager, adminController.getCurrentIp);

// Notifications badge
router.get('/notifications/unread-count', isManager, managerController.getUnreadNotificationCount);

module.exports = router;
