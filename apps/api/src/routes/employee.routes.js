const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const isEmployee = [authenticate, authorize('employee')];

router.get('/status', employeeController.getStatus);

// Dashboard
router.get('/dashboard', isEmployee, employeeController.getDashboard);

// Attendance
router.post('/attendance/check-in', isEmployee, employeeController.checkIn);
router.post('/attendance/initiate-checkout', isEmployee, employeeController.initiateCheckout);
router.post('/attendance/check-out', isEmployee, employeeController.checkOut);
router.post('/attendance/send-report', isEmployee, employeeController.sendDailyReport);

// Breaks
router.post('/break/start', isEmployee, employeeController.startBreak);
router.post('/break/end', isEmployee, employeeController.endBreak);

// Daily Logs
router.get('/daily-log/me', isEmployee, employeeController.getDailyLog);
router.post('/daily-log/me', isEmployee, employeeController.submitDailyLog);

// Leaves
router.get('/leave/balance', isEmployee, employeeController.getLeaveBalance);
router.get('/leave/requests/me', isEmployee, employeeController.getMyLeaveRequests);
router.post('/leave/apply', isEmployee, employeeController.applyForLeave);

// QR Code
router.get('/qr/current', isEmployee, employeeController.getCurrentQrCode);

// Device
router.post('/device/request', isEmployee, employeeController.requestDeviceApproval);  // legacy alias
router.get('/device-status', isEmployee, employeeController.getDeviceStatus);
router.get('/device-requests', isEmployee, employeeController.getMyDeviceRequests);
router.post('/device-requests', isEmployee, employeeController.requestDeviceApproval); // DeviceStatusPage uses this URL

module.exports = router;
