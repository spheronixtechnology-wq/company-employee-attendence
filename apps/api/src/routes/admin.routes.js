const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const managerController = require('../controllers/manager.controller');
const overtimeController = require('../controllers/overtime.controller');
const adminIntegrationController = require('../controllers/adminIntegration.controller');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const requireStepUp = require('../middleware/requireStepUp');

const isAdmin = [authenticate, authorize('admin')];
const isAdminOrManager = [authenticate, authorize('admin', 'manager')];

router.get('/status', adminController.getStatus);
router.get('/dashboard', isAdmin, adminController.getDashboard);

router.get('/employees', isAdmin, adminController.getEmployees);
router.get('/employees/:id/profile', isAdmin, adminController.getEmployeeProfile);
router.get('/employees/:id/attendance', isAdmin, adminController.getEmployeeAttendanceHistory);
router.get('/employees/:id/daily-logs', isAdmin, adminController.getEmployeeDailyLogs);
router.get('/daily-log/:logId/document', isAdmin, adminController.getDailyLogDocument);
router.get('/employees/:id/overtime', isAdmin, adminController.getEmployeeOvertimeHistory);
router.get('/teams', isAdmin, adminController.getTeams);
router.post('/teams', isAdmin, adminController.createTeam);
router.patch('/teams/:id', isAdmin, adminController.updateTeam);
router.delete('/teams/:id', isAdmin, adminController.deleteTeam);
router.post('/users', isAdmin, adminController.createUser);
router.patch('/users/:id', isAdmin, adminController.updateUser);
router.delete('/users/:id', isAdmin, adminController.deleteUser);

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

// Manager Permissions & MFA
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

// Overtime Oversight
router.get('/overtime', isAdmin, overtimeController.getAllCompanyOvertime);

// ── Step-Up Authentication & Frappe HRMS Integration Keys ─────────────────────
router.post('/auth/step-up', isAdmin, adminIntegrationController.stepUpLimiter, adminIntegrationController.stepUpChallenge);
router.get('/integrations/frappe-hrms/keys', isAdmin, adminIntegrationController.listKeys);
router.post('/integrations/frappe-hrms/keys', isAdmin, requireStepUp('integration_key:create'), adminIntegrationController.createKey);
router.post('/integrations/keys/:keyId/rotate', isAdmin, requireStepUp('integration_key:rotate'), adminIntegrationController.rotateKey);
router.post('/integrations/keys/:keyId/revoke', isAdmin, requireStepUp('integration_key:revoke'), adminIntegrationController.revokeKey);
router.put('/integrations/keys/:keyId/audience', isAdmin, requireStepUp('integration_key:update_audience'), adminIntegrationController.updateKeyAudience);
router.patch('/integrations/keys/:keyId/settings', isAdmin, adminIntegrationController.updateKeySettings);
router.get('/integrations/frappe-hrms/keys/sync-health', isAdmin, adminIntegrationController.getSyncHealth);
router.get('/integrations/keys/:keyId/activity', isAdmin, adminIntegrationController.getKeyActivity);

module.exports = router;
