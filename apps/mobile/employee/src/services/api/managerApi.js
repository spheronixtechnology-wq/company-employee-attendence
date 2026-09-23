import api from '../../lib/api';

/**
 * Wraps the base API instance to inject the 'manager' portal role
 * while inheriting all global interceptors (JWT, device tokens, error handlers).
 */
const request = (method, url, data = null, config = {}) => {
  return api({
    method,
    url,
    data,
    ...config,
    headers: {
      ...config.headers,
      'x-portal-role': 'manager'
    }
  });
};

export const managerApi = {
  // --- Phase 5: Dashboard ---
  getDashboard: (dateStr) => request('get', `/manager/dashboard?date=${dateStr}`),
  getTeamMembers: (dateStr) => request('get', `/manager/team/members?date=${dateStr}`),
  getPendingLeaves: () => request('get', '/manager/team/leave-requests?status=pending'),
  getPendingDevices: () => request('get', '/manager/device-requests?status=pending'),
  
  // --- Phase 6: Manager Requests ---
  
  // Leave Requests
  getLeaveRequests: (status = 'all') => request('get', `/manager/team/leave-requests?status=${status}`),
  decideLeaveRequest: (id, decision, decisionNote) => request('post', `/manager/team/leave/${id}/decision`, { decision, decisionNote }),
  
  // Device Requests
  getDeviceRequests: (status = 'all') => request('get', `/manager/device-requests?status=${status}`),
  decideDeviceRequest: (id, payload) => request('patch', `/manager/device-requests/${id}/decision`, payload),
  
  // Location Requests
  getLocationRequests: (status = 'all') => request('get', `/manager/location-requests?status=${status}`),
  decideLocationRequest: (id, payload) => request('patch', `/manager/location-requests/${id}/decision`, payload),
  
  // Manual Attendance
  getTeamAttendanceRoster: (dateStr) => request('get', `/manager/team/attendance?date=${dateStr}`),
  decideManualAttendance: (id, payload) => request('post', `/manager/team/manual-attendance/${id}/decision`, payload),
  // --- Phase 7: Session Reactivation ---
  getSessionReactivations: (dateStr, search = '') => request('get', `/manager/session-reactivations?date=${dateStr}&search=${encodeURIComponent(search)}`),
  decideSessionReactivation: (id, payload) => request('post', `/manager/session-reactivations/${id}/decision`, payload),
};
