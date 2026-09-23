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
  getTeamMembers: (dateStr) => request('get', `/manager/team/members${dateStr ? `?date=${dateStr}` : ''}`),
  getMemberProfile: (id) => request('get', `/manager/team/members/${id}/profile`),
  createTeamMember: (payload) => request('post', '/manager/team/members', payload),
  deleteTeamMember: (id) => request('delete', `/manager/team/members/${id}`),
  getPendingLeaves: () => request('get', '/manager/team/leave-requests?status=pending'),
  getPendingDevices: () => request('get', '/manager/device-requests?status=pending'),
  
  // --- Phase 6: Manager Requests ---
  
  // Leave Requests
  getLeaveRequests: (status = 'all') => request('get', `/manager/team/leave-requests?status=${status}`),
  decideLeaveRequest: (id, decision, decisionNote) => request('post', `/manager/team/leave/${id}/decision`, { decision, decisionNote }),
  getLeaveQuotas: () => request('get', '/manager/team/primary/leave-quotas'),
  updateLeaveQuotas: (payload) => request('put', '/manager/team/primary/leave-quotas', payload),
  
  // Device Requests
  getDeviceRequests: (status = 'all') => request('get', `/manager/device-requests?status=${status}`),
  decideDeviceRequest: (id, payload) => request('patch', `/manager/device-requests/${id}/decision`, payload),

  // Location Requests
  getLocationRequests: (status = 'all') => request('get', `/manager/location-requests?status=${status}`),
  decideLocationRequest: (id, payload) => request('patch', `/manager/location-requests/${id}/decision`, payload),


  // Manual Attendance
  getTeamAttendanceRoster: (dateStr) => request('get', `/manager/team/attendance?date=${dateStr}`),
  decideManualAttendance: (id, payload) => request('post', `/manager/team/manual-attendance/${id}/decision`, payload),
  
  // Daily Logs
  getTeamDailyLogs: (dateStr) => request('get', `/manager/team/daily-logs?date=${dateStr}`),
  
  // --- Phase 7: Session Reactivation ---
  getSessionReactivations: (dateStr, search = '') => request('get', `/manager/session-reactivations?date=${dateStr}&search=${encodeURIComponent(search)}`),
  decideSessionReactivation: (id, payload) => request('post', `/manager/session-reactivations/${id}/decision`, payload),

  // --- Phase 8: Team Overtime ---
  getTeamOvertime: () => request('get', `/manager/team/overtime`),
  decideOvertimePermission: (id, payload) => request('post', `/manager/team/overtime/${id}/permission-decision`, payload),
  decideOvertimeWork: (id, payload) => request('post', `/manager/team/overtime/${id}/work-decision`, payload),

  // --- Phase 9: Manager Settings ---
  // 9.1 Attendance Method
  getActiveAttendanceMethod: () => request('get', `/manager/attendance-method/active`),
  switchAttendanceMethod: (payload) => request('patch', `/manager/attendance-method/switch`, payload),
  heartbeatAttendanceMethod: () => request('patch', `/manager/attendance-method/heartbeat`),

  // 9.2 Office Locations
  getOfficeLocations: () => request('get', `/manager/office-locations`),
  createOfficeLocation: (payload) => request('post', `/manager/office-locations`, payload),
  updateOfficeLocation: (id, payload) => request('patch', `/manager/office-locations/${id}`, payload),
  deleteOfficeLocation: (id) => request('delete', `/manager/office-locations/${id}`),

  // 9.3 Wi-Fi Settings
  getCurrentIp: () => request('get', `/manager/current-ip`),

  // --- Phase 12: Manager Profile ---
  updateProfile: (payload) => request('put', '/manager/profile', payload),
};
