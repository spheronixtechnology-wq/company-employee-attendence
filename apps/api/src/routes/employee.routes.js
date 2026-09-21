const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee.controller');
const overtimeController = require('../controllers/overtime.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const { uploadDailyLogDoc } = require('../middleware/upload.middleware');

const isEmployee = [authenticate, authorize('employee')];
const isPunchUser = [authenticate, authorize('employee', 'manager')];
const isAnyUser = [authenticate, authorize('employee', 'manager', 'admin')];

router.get('/status', employeeController.getStatus);
router.get('/notifications', isEmployee, employeeController.getMyNotifications);

// Dashboard
router.get('/dashboard', isEmployee, employeeController.getDashboard);

// Attendance
router.get('/attendance/me', isPunchUser, employeeController.getMyAttendanceHistory);
router.post('/attendance/check-in', isPunchUser, employeeController.checkIn);
router.post('/attendance/initiate-checkout', isPunchUser, employeeController.initiateCheckout);
router.post('/attendance/check-out', isPunchUser, employeeController.checkOut);
router.post('/attendance/send-report', isEmployee, employeeController.sendDailyReport);
router.get('/network-status', isEmployee, employeeController.getNetworkStatus);
router.post('/presence/ping', isEmployee, employeeController.recordPresencePing);
router.post('/presence/reason', isEmployee, employeeController.submitOutOfBoundsReason);

// Geofence session
router.get('/attendance/geofence/session', isEmployee, employeeController.getGeofenceSession);
router.post('/attendance/geofence/auto-checkout', isEmployee, employeeController.geofenceAutoCheckout);

// Profile
router.put('/profile', isAnyUser, employeeController.updateProfile);
router.patch('/profile', isAnyUser, employeeController.updateProfile);

// Breaks
router.post('/break/start', isPunchUser, employeeController.startBreak);
router.post('/break/end', isPunchUser, employeeController.endBreak);

// Daily Logs
router.get('/daily-log/me', isEmployee, employeeController.getDailyLog);
router.post('/daily-log/me', isEmployee, uploadDailyLogDoc, employeeController.submitDailyLog);

// Leaves
router.get('/leave/types', isEmployee, employeeController.getLeaveTypes);
router.get('/leave/balance', isEmployee, employeeController.getLeaveBalance);
router.get('/leave/requests/me', isEmployee, employeeController.getMyLeaveRequests);
router.post('/leave/apply', isEmployee, employeeController.applyForLeave);

// QR Code
router.get('/qr/current', isEmployee, employeeController.getCurrentQrCode);

// Manual Attendance
router.post('/manual-attendance/request', isEmployee, employeeController.requestManualAttendance);
router.get('/manual-attendance/requests', isEmployee, employeeController.getMyManualAttendanceRequests);

// Device
router.post('/device/request', isEmployee, employeeController.requestDeviceApproval);  // legacy alias
router.get('/device-status', isEmployee, employeeController.getDeviceStatus);
router.get('/device-requests', isEmployee, employeeController.getMyDeviceRequests);
router.post('/device-requests', isEmployee, employeeController.requestDeviceApproval); // DeviceStatusPage uses this URL

// Overtime (Two-Stage Approval Workflow)
router.post('/overtime/request', isEmployee, overtimeController.requestOvertime);
router.get('/overtime/me', isEmployee, overtimeController.getMyOvertime);
router.post('/overtime/:id/start', isEmployee, overtimeController.startOvertimeSession);
router.post('/overtime/:id/end', isEmployee, overtimeController.endOvertimeSession);
router.post('/overtime/:id/cancel', isEmployee, overtimeController.cancelOvertimeRequest);

// Biometric
const biometricRoutes = require('./biometric.routes');
router.use('/biometric', isEmployee, biometricRoutes);

module.exports = router;
