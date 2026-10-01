const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const managerController = require('../controllers/manager.controller');
const overtimeController = require('../controllers/overtime.controller');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const isAdmin = [authenticate, authorize('admin')];
const isChairmanOrPrincipal = [authenticate, authorize('admin', 'principal', 'chairman')];
const isAdminOrManager = [authenticate, authorize('admin', 'manager', 'principal', 'chairman')];

router.get('/status', adminController.getStatus);
router.get('/dashboard', isAdmin, adminController.getDashboard);

router.get('/employees', isChairmanOrPrincipal, adminController.getEmployees);
router.get('/employees/:id/profile', isChairmanOrPrincipal, adminController.getEmployeeProfile);
router.get('/employees/:id/attendance', isChairmanOrPrincipal, adminController.getEmployeeAttendanceHistory);

// router.get('/employees/:id/overtime', isChairmanOrPrincipal, adminController.getEmployeeOvertimeHistory);
router.get('/teams', isChairmanOrPrincipal, adminController.getTeams);
router.post('/teams', isChairmanOrPrincipal, adminController.createTeam);
router.patch('/teams/:id', isChairmanOrPrincipal, adminController.updateTeam);
router.delete('/teams/:id', isChairmanOrPrincipal, adminController.deleteTeam);
router.post('/users', isChairmanOrPrincipal, adminController.createUser);
router.patch('/users/:id', isChairmanOrPrincipal, adminController.updateUser);
router.delete('/users/:id', isChairmanOrPrincipal, adminController.deleteUser);

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
router.patch('/attendance-method/heartbeat', isAdminOrManager, adminController.toggleHeartbeatMonitoring);

// Principal & HOD Permissions & MFA
router.get('/manager-permissions', isAdmin, adminController.getManagerPermissions);
router.patch('/manager-permissions/:userId', isAdmin, adminController.updateManagerPermission);
router.post('/managers/:id/reset-mfa', isAdmin, adminController.resetManagerMfa);

// Attendance Records
router.get('/attendance', isAdmin, adminController.getAttendance);

// Session Reactivations (Auto-checkout reviews)
router.get('/session-reactivations', isAdmin, adminController.getSessionReactivations);
router.post('/session-reactivations/:id/decision', isAdmin, adminController.handleSessionReactivationDecision);
router.post('/session-reactivations/:id/approve', isAdmin, adminController.handleSessionReactivationDecision);
router.post('/session-reactivations/:id/reject', isAdmin, adminController.handleSessionReactivationDecision);

// Leave Requests
router.get('/leave-requests', isAdmin, adminController.getLeaveRequests);
router.post('/leave/:id/decision', isAdmin, adminController.handleLeaveDecision);

// Overtime Oversight - DEPRECATED
// router.get('/overtime', isAdmin, overtimeController.getAllCompanyOvertime);

module.exports = router;
