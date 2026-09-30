const authenticate = require('./authenticate');
const authorize = require('./authorize');

module.exports = {
  canSubmitAttendance: [authenticate, authorize('employee', 'faculty', 'hod', 'principal', 'chairman', 'manager')],
  canRequestDevice: [authenticate, authorize('employee', 'faculty', 'hod', 'principal', 'chairman', 'manager')],
  canApproveRequests: [authenticate, authorize('manager', 'admin', 'hod', 'principal', 'chairman')]
};
