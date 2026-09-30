const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee.controller');
const overtimeController = require('../controllers/overtime.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const { uploadAvatarImage } = require('../middleware/upload.middleware');

const { canSubmitAttendance, canRequestDevice, canApproveRequests } = require('../middleware/permissions');

const isEmployee = [authenticate, authorize('employee', 'faculty')]; // Deprecated, keep temporarily for unmigrated routes
const isPunchUser = canSubmitAttendance; // Alias for easy reading
const isAnyUser = [authenticate, authorize('employee', 'manager', 'admin', 'faculty', 'hod', 'principal', 'chairman')];

router.get('/status', employeeController.getStatus);
router.get('/notifications', isPunchUser, employeeController.getMyNotifications);

// Dashboard
router.get('/dashboard', isPunchUser, employeeController.getDashboard);

// Attendance
router.get('/attendance/me', isPunchUser, employeeController.getMyAttendanceHistory);
router.post('/attendance/check-in', isPunchUser, employeeController.checkIn);
router.post('/attendance/initiate-checkout', isPunchUser, employeeController.initiateCheckout);
router.post('/attendance/check-out', isPunchUser, employeeController.checkOut);
router.post('/attendance/send-report', isPunchUser, employeeController.sendDailyReport);
router.get('/network-status', isPunchUser, employeeController.getNetworkStatus);
router.post('/presence/ping', isPunchUser, employeeController.recordPresencePing);
router.post('/presence/reason', isPunchUser, employeeController.submitOutOfBoundsReason);

// Geofence session
router.get('/attendance/geofence/session', isPunchUser, employeeController.getGeofenceSession);
router.post('/attendance/geofence/auto-checkout', isPunchUser, employeeController.geofenceAutoCheckout);

// Profile
router.put('/profile', isAnyUser, uploadAvatarImage, employeeController.updateProfile);
router.patch('/profile', isAnyUser, uploadAvatarImage, employeeController.updateProfile);

// Breaks
router.post('/break/start', isPunchUser, employeeController.startBreak);
router.post('/break/end', isPunchUser, employeeController.endBreak);



// Leaves
router.get('/leave/types', canRequestDevice, employeeController.getLeaveTypes);
router.get('/leave/balance', canRequestDevice, employeeController.getLeaveBalance);
router.get('/leave/requests/me', canRequestDevice, employeeController.getMyLeaveRequests);
router.post('/leave/apply', canRequestDevice, employeeController.applyForLeave);

// QR Code
router.get('/qr/current', isPunchUser, employeeController.getCurrentQrCode);

// Manual Attendance
router.post('/manual-attendance/request', canRequestDevice, employeeController.requestManualAttendance);
router.get('/manual-attendance/requests', canRequestDevice, employeeController.getMyManualAttendanceRequests);

// Device
router.post('/device/request', canRequestDevice, employeeController.requestDeviceApproval);  // legacy alias
router.get('/device-status', canRequestDevice, employeeController.getDeviceStatus);
router.get('/device-requests', canRequestDevice, employeeController.getMyDeviceRequests);
router.post('/device-requests', canRequestDevice, employeeController.requestDeviceApproval); // DeviceStatusPage uses this URL

// Overtime (Two-Stage Approval Workflow) - DEPRECATED for Exam Duty Migration
// router.post('/overtime/request', isPunchUser, overtimeController.requestOvertime);
// router.get('/overtime/me', isPunchUser, overtimeController.getMyOvertime);
// router.post('/overtime/:id/start', isPunchUser, overtimeController.startOvertimeSession);
// router.post('/overtime/:id/end', isPunchUser, overtimeController.endOvertimeSession);
// router.post('/overtime/:id/cancel', isPunchUser, overtimeController.cancelOvertimeRequest);

// Biometric
const biometricRoutes = require('./biometric.routes');
router.use('/biometric', isPunchUser, biometricRoutes);

module.exports = router;
