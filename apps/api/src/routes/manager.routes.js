const express = require('express');
const router = express.Router();
const managerController = require('../controllers/manager.controller');
const adminController = require('../controllers/admin.controller');
const employeeController = require('../controllers/employee.controller');
const overtimeController = require('../controllers/overtime.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { uploadDailyLogDoc } = require('../middleware/upload.middleware');

const isManager = [authenticate, authorize('manager')];

router.get('/status', managerController.getStatus);

router.get('/dashboard', isManager, managerController.getDashboard);

router.get('/team/attendance', isManager, managerController.getTeamAttendance);
router.get('/team/members', isManager, managerController.getTeamMembers);
router.get('/team/members/:id/profile', isManager, managerController.getMemberProfile);
router.get('/team/members/:id/attendance', isManager, managerController.getMemberAttendanceHistory);
router.get('/team/members/:id/daily-logs', isManager, managerController.getMemberDailyLogs);
router.get('/team/members/:id/overtime', isManager, managerController.getMemberOvertimeHistory);
router.get('/team/daily-logs', isManager, managerController.getTeamDailyLogs);

// Manager Log Management
router.post('/team/daily-log', isManager, uploadDailyLogDoc, managerController.submitTeamMemberDailyLog);
router.patch('/team/daily-log/:logId', isManager, uploadDailyLogDoc, managerController.updateTeamMemberDailyLog);

// Team Members
router.post('/team/members', isManager, managerController.createTeamMember);
router.get('/team/leave-requests', isManager, managerController.getTeamLeaveRequests);
router.post('/team/leave/:id/decision', isManager, managerController.handleLeaveDecision);

// Overtime (Two-Stage Approvals: Stage 1 Permission & Stage 2 Work Verification)
router.get('/team/overtime', isManager, overtimeController.getTeamOvertime);
router.post('/team/overtime/:id/permission-decision', isManager, overtimeController.handlePermissionDecision);
router.post('/team/overtime/:id/work-decision', isManager, overtimeController.handleWorkVerificationDecision);

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

// Manager Personal Attendance (Punch & Shift tracking)
router.get('/my-attendance', isManager, employeeController.getMyAttendanceHistory);
router.post('/attendance/check-in', isManager, employeeController.checkIn);
router.post('/attendance/initiate-checkout', isManager, employeeController.initiateCheckout);
router.post('/attendance/check-out', isManager, employeeController.checkOut);
router.post('/break/start', isManager, employeeController.startBreak);
router.post('/break/end', isManager, employeeController.endBreak);

module.exports = router;
