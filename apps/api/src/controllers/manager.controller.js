const Team = require('../models/Team');
const User = require('../models/User');
const ManagerPermission = require('../models/ManagerPermission');
const Attendance = require('../models/Attendance');
const DailyLog = require('../models/DailyLog');
const LeaveRequest = require('../models/LeaveRequest');
const DeviceRequest = require('../models/DeviceRequest');
const LocationRequest = require('../models/LocationRequest');
const Notification = require('../models/Notification');
const RegisteredDevice = require('../models/RegisteredDevice');
const EmployeeLocation = require('../models/EmployeeLocation');
const BiometricCredential = require('../models/BiometricCredential');

const leaveService = require('../services/leave.service');
const { writeAuditLog } = require('../services/audit.service');
const { createNotification } = require('../services/notification.service');
const { AUDIT_ACTIONS } = require('../../../../packages/shared/auditActions');
const { emitToUser, emitToTeam, emitToManagers, emitToAdmins, emitToDeviceRequest } = require('../socket');

const { success, badRequest, forbidden, notFound } = require('../utils/response');
const { getTodayDateString } = require('../utils/dateUtils');
const { formatDeviceLabel } = require('../utils/deviceUtils');

// --- Helpers ---

/**
 * Resolves all teams managed by or associated with a manager.
 * Matches teams where leadUserId === userId OR _id === user.teamId.
 */
const getManagedTeams = async (user) => {
  const userId = user._id || user;
  let teamId = user.teamId?._id || user.teamId;
  if (!teamId && user._id) {
    const userDoc = await User.findById(userId).select('teamId');
    teamId = userDoc?.teamId;
  }
  const conditions = [{ leadUserId: userId }];
  if (teamId) {
    conditions.push({ _id: teamId });
  }
  return await Team.find({ $or: conditions, isActive: true });
};

/**
 * Backward compatibility helper for single team lookups.
 */
const getManagedTeam = async (userId) => {
  const teams = await getManagedTeams(userId);
  return teams.length > 0 ? teams[0] : null;
};

/**
 * Gets all employee user IDs belonging to the given team(s).
 */
const getTeamMemberIds = async (teamIds, excludeUserId = null) => {
  const ids = Array.isArray(teamIds) ? teamIds : (teamIds ? [teamIds] : []);
  if (!ids.length) return [];
  const query = { teamId: { $in: ids }, role: { $in: ['employee'] } };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const members = await User.find(query).select('_id');
  return members.map(m => m._id);
};

const checkManagerPermission = async (managerId, permissionKey) => {
  const perm = await ManagerPermission.findOne({ managerId });
  // If no permission doc, default to allow. Otherwise check the specific key.
  if (!perm) return true;
  return perm[permissionKey] !== false;
};

// --- Endpoints ---

const getStatus = async (req, res) => {
  res.status(200).json({ success: true, message: 'Manager controller is running' });
};

const getDashboard = async (req, res) => {
  try {
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) {
      return success(res, 'No team assigned', {
        teamTotal: 0,
        checkedIn: 0,
        onLeave: 0,
        notCheckedIn: 0,
        missingDailyLogs: 0,
        pendingLeaveRequests: 0,
        pendingDeviceRequests: 0,
        pendingLocationRequests: 0,
      });
    }

    const teamIds = teams.map(t => t._id);
    const memberIds = await getTeamMemberIds(teamIds);
    if (memberIds.length === 0) {
      return success(res, 'Team is empty', {
        teamTotal: 0,
        checkedIn: 0,
        onLeave: 0,
        notCheckedIn: 0,
        missingDailyLogs: 0,
        pendingLeaveRequests: 0,
        pendingDeviceRequests: 0,
        pendingLocationRequests: 0,
      });
    }

    const today = getTodayDateString();
    const totalMembers = memberIds.length;
    
    const checkedInToday = await Attendance.countDocuments({
      userId: { $in: memberIds },
      date: today,
      checkInTime: { $ne: null }
    });

    const onLeaveToday = await LeaveRequest.countDocuments({
      userId: { $in: memberIds },
      status: 'approved',
      startDate: { $lte: today },
      endDate: { $gte: today }
    });

    const loggedUsers = await DailyLog.distinct('userId', { logDate: today });
    const missingDailyLogs = checkedInToday - loggedUsers.filter(id => memberIds.map(m => m.toString()).includes(id.toString())).length;

    const pendingLeaveRequests = await LeaveRequest.countDocuments({ userId: { $in: memberIds }, status: 'pending' });
    const pendingDeviceRequests = await DeviceRequest.countDocuments({ userId: { $in: memberIds }, status: 'pending' });
    const pendingLocationRequests = await LocationRequest.countDocuments({ userId: { $in: memberIds }, status: 'pending' });

    return success(res, 'Dashboard fetched', {
      teamTotal: totalMembers,
      checkedIn: checkedInToday,
      onLeave: onLeaveToday,
      notCheckedIn: Math.max(0, totalMembers - checkedInToday - onLeaveToday),
      missingDailyLogs: Math.max(0, missingDailyLogs),
      pendingLeaveRequests,
      pendingDeviceRequests,
      pendingLocationRequests
    });
  } catch (error) {
    console.error('getDashboard error:', error);
    return badRequest(res, 'Failed to fetch dashboard');
  }
};

const getTeamAttendance = async (req, res) => {
  try {
    const date = req.query.date || getTodayDateString();
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return success(res, 'Fetched attendance', { attendance: [] });

    const teamIds = teams.map(t => t._id);
    const members = await User.find({ teamId: { $in: teamIds }, role: 'employee', isActive: true })
      .select('name designation email avatarUrl phone')
      .sort({ name: 1 });

    const memberIds = members.map(m => m._id);
    const attendanceRecords = await Attendance.find({ userId: { $in: memberIds }, date })
      .populate('userId', 'name designation email avatarUrl phone')
      .sort({ 'userId.name': 1 });

    const attendanceMap = new Map();
    for (const record of attendanceRecords) {
      if (record.userId?._id) {
        attendanceMap.set(record.userId._id.toString(), record);
      }
    }

    // Merge team members so un-checked-in employees are still visible in roster
    const fullAttendance = members.map(member => {
      const existing = attendanceMap.get(member._id.toString());
      if (existing) return existing;
      return {
        _id: `roster-${member._id}`,
        userId: member,
        date,
        checkInTime: null,
        checkOutTime: null,
        totalWorkMinutes: 0,
        totalBreakMinutes: 0,
        status: 'not_checked_in',
        breaks: [],
      };
    });

    return success(res, 'Fetched attendance', { attendance: fullAttendance });
  } catch (error) {
    console.error('getTeamAttendance error:', error);
    return badRequest(res, 'Failed to fetch team attendance');
  }
};

/**
 * GET /manager/team/members
 * Returns all active employees across the manager's assigned/led teams with live status.
 */
const getTeamMembers = async (req, res) => {
  try {
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) {
      return success(res, 'No team assigned', { teams: [], members: [] });
    }

    const teamIds = teams.map(t => t._id);
    const members = await User.find({ teamId: { $in: teamIds }, role: 'employee', isActive: true })
      .select('name email phone designation avatarUrl teamId createdAt')
      .populate('teamId', 'name')
      .sort({ name: 1 })
      .lean();

    const today = getTodayDateString();
    const memberIds = members.map(m => m._id);

    const attendances = await Attendance.find({ userId: { $in: memberIds }, date: today }).lean();
    const attMap = new Map(attendances.map(a => [a.userId.toString(), a]));

    const enrichedMembers = members.map(member => {
      const att = attMap.get(member._id.toString());
      let currentStatus = 'not_checked_in';
      if (att) {
        if (att.checkOutTime) {
          currentStatus = 'checked_out';
        } else if (att.activeBreak?.startedAt) {
          currentStatus = 'on_break';
        } else if (att.checkInTime) {
          currentStatus = 'checked_in';
        }
      }
      return {
        ...member,
        currentStatus,
        todayAttendance: att || null,
      };
    });

    return success(res, 'Team members fetched successfully', {
      teams: teams.map(t => ({ id: t._id, name: t.name, description: t.description })),
      members: enrichedMembers,
    });
  } catch (error) {
    console.error('getTeamMembers error:', error);
    return badRequest(res, 'Failed to fetch team members');
  }
};

const getTeamLeaveRequests = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return success(res, 'Fetched leave requests', { requests: [] });

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    
    const query = { userId: { $in: memberIds } };
    if (status !== 'all') query.status = status;

    const requests = await LeaveRequest.find(query)
      .populate('userId', 'name email')
      .populate('leaveTypeId', 'name code')
      .sort({ createdAt: -1 });

    return success(res, 'Fetched leave requests', { requests });
  } catch (error) {
    console.error('getTeamLeaveRequests error:', error);
    return badRequest(res, 'Failed to fetch leave requests');
  }
};

const handleLeaveDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, decisionNote } = req.body;
    
    if (!['approved', 'rejected'].includes(decision)) {
      return badRequest(res, 'Decision must be approved or rejected');
    }

    const leave = await LeaveRequest.findById(id);
    if (!leave) return notFound(res, 'Leave request not found');

    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return forbidden(res, 'You do not manage any team');

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    if (!memberIds.map(m => m.toString()).includes(leave.userId.toString())) {
      return forbidden(res, 'This user is not in your team');
    }

    const updatedLeave = await leaveService.makeLeaveDecision({
      leaveId: id,
      decidedBy: req.user,
      decision,
      decisionNote
    });

    // Real-time WebSocket emission to the employee
    emitToUser(leave.userId, 'leave:request_resolved', {
      leaveId: id,
      decision,
      decisionNote,
      leave: updatedLeave,
    });

    return success(res, `Leave request ${decision}`, { leave: updatedLeave });
  } catch (error) {
    console.error('handleLeaveDecision error:', error);
    return res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Failed to handle leave decision' });
  }
};

const getTeamDailyLogs = async (req, res) => {
  try {
    const date = req.query.date || getTodayDateString();
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return success(res, 'Fetched daily logs', { logs: [] });

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    const logs = await DailyLog.find({ userId: { $in: memberIds }, logDate: date })
      .populate('userId', 'name email designation avatarUrl phone teamId')
      .populate('teamId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // Fetch attendance records for these members on this date to provide full shift insights
    const attendances = await Attendance.find({ userId: { $in: memberIds }, date }).lean();
    const attMap = new Map();
    for (const a of attendances) {
      if (a.userId) attMap.set(a.userId.toString(), a);
    }

    const enrichedLogs = logs.map(log => ({
      ...log,
      attendance: log.userId?._id ? attMap.get(log.userId._id.toString()) || null : null,
    }));

    return success(res, 'Fetched daily logs', { logs: enrichedLogs });
  } catch (error) {
    console.error('getTeamDailyLogs error:', error);
    return badRequest(res, 'Failed to fetch daily logs');
  }
};

const getDeviceRequests = async (req, res) => {
  try {
    const canManage = await checkManagerPermission(req.user._id, 'canManageDeviceRequests');
    if (!canManage) return forbidden(res, 'You do not have permission to manage device requests');

    const status = req.query.status || 'pending';
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return success(res, 'Fetched device requests', { requests: [] });

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    
    const query = { userId: { $in: memberIds } };
    if (status !== 'all') query.status = status;

    const rawRequests = await DeviceRequest.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const requests = rawRequests.map((r) => ({
      ...r,
      requestedDeviceLabel: formatDeviceLabel(r.requestedDeviceLabel),
    }));

    // Mark notifications for device requests as read for this manager
    await Notification.updateMany(
      { userId: req.user._id, isRead: false, type: { $in: ['device_request', 'new_device_request'] } },
      { $set: { isRead: true } }
    );

    return success(res, 'Fetched device requests', { requests });
  } catch (error) {
    console.error('getDeviceRequests error:', error);
    return badRequest(res, 'Failed to fetch device requests');
  }
};

const handleDeviceRequestDecision = async (req, res) => {
  try {
    const canManage = await checkManagerPermission(req.user._id, 'canManageDeviceRequests');
    if (!canManage) return forbidden(res, 'You do not have permission to manage device requests');

    const { id } = req.params;
    const { action, decisionNote, approvedUntil } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return badRequest(res, 'Action must be approve or reject');
    }

    const request = await DeviceRequest.findById(id);
    if (!request) return notFound(res, 'Device request not found');

    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return forbidden(res, 'You do not manage any team');

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    if (!memberIds.map(m => m.toString()).includes(request.userId.toString())) {
      return forbidden(res, 'This user is not in your team');
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    request.status = newStatus;
    request.decisionNote = decisionNote;
    if (action === 'approve' && approvedUntil) {
      request.requestedUntil = approvedUntil;
    }
    await request.save();

    if (action === 'approve') {
      // Deactivate existing device
      await RegisteredDevice.updateMany({ userId: request.userId }, { isActive: false, status: 'REVOKED' });

      // Invalidate all previous biometric credentials tied to revoked devices
      await BiometricCredential.updateMany({ userId: request.userId }, { isActive: false });
      
      const newDevice = new RegisteredDevice({
        userId: request.userId,
        status: 'ACTIVE',
        isActive: true,
        temporaryUntil: request.requestedUntil || null,
        deviceLabel: formatDeviceLabel(request.requestedDeviceLabel) || null,
        userAgent: request.userAgent || null,
        deviceFingerprint: request.deviceFingerprint || null,
        ipAddress: request.ipAddress || null,
        lastSeenIp: request.ipAddress || null,
        lastSeenAt: new Date(),
      });
      await newDevice.save();

      // Invalidate old device sessions immediately
      await User.findByIdAndUpdate(request.userId, { $inc: { tokenVersion: 1 } });
    }

    await createNotification({
      userId: request.userId,
      type: action === 'approve' ? 'device_approved' : 'device_rejected',
      title: 'Device Request ' + (action === 'approve' ? 'Approved ✅' : 'Rejected ❌'),
      message: `Your device request has been ${action}d.` + (decisionNote ? ` Note: ${decisionNote}` : ''),
      relatedId: request._id
    });

    // Mark manager notifications related to this request as read
    await Notification.updateMany(
      { relatedId: request._id, isRead: false },
      { $set: { isRead: true } }
    );

    // Real-time WebSocket emission to the employee, managers, admins, and guest login socket
    emitToUser(request.userId, 'device:request_resolved', {
      requestId: request._id,
      action,
      status: newStatus,
      decisionNote,
      userId: request.userId,
    });
    emitToManagers('device:request_resolved', {
      requestId: request._id,
      action,
      status: newStatus,
      userId: request.userId,
    });
    emitToAdmins('device:request_resolved', {
      requestId: request._id,
      action,
      status: newStatus,
      userId: request.userId,
    });
    emitToDeviceRequest(request._id, 'device:request_resolved', {
      requestId: request._id,
      action,
      status: newStatus,
      decisionNote,
      userId: request.userId,
    });

    return success(res, `Device request ${action}d`, { request });
  } catch (error) {
    console.error('handleDeviceRequestDecision error:', error);
    return badRequest(res, 'Failed to handle device request decision');
  }
};

const getLocationRequests = async (req, res) => {
  try {
    const canManage = await checkManagerPermission(req.user._id, 'canManageLocationRequests');
    if (!canManage) return forbidden(res, 'You do not have permission to manage location requests');

    const status = req.query.status || 'pending';
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return success(res, 'Fetched location requests', { requests: [] });

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    
    const query = { userId: { $in: memberIds } };
    if (status !== 'all') query.status = status;

    const requests = await LocationRequest.find(query)
      .populate('userId', 'name')
      .populate('requestedLocationId', 'officeName')
      .sort({ createdAt: -1 });

    return success(res, 'Fetched location requests', { requests });
  } catch (error) {
    console.error('getLocationRequests error:', error);
    return badRequest(res, 'Failed to fetch location requests');
  }
};

const handleLocationRequestDecision = async (req, res) => {
  try {
    const canManage = await checkManagerPermission(req.user._id, 'canManageLocationRequests');
    if (!canManage) return forbidden(res, 'You do not have permission to manage location requests');

    const { id } = req.params;
    const { action, decisionNote } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return badRequest(res, 'Action must be approve or reject');
    }

    const request = await LocationRequest.findById(id);
    if (!request) return notFound(res, 'Location request not found');

    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return forbidden(res, 'You do not manage any team');

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    if (!memberIds.map(m => m.toString()).includes(request.userId.toString())) {
      return forbidden(res, 'This user is not in your team');
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    request.status = newStatus;
    request.decisionNote = decisionNote;
    await request.save();

    if (action === 'approve') {
      await EmployeeLocation.updateMany({ userId: request.userId }, { isActive: false });
      
      const newLoc = new EmployeeLocation({
        userId: request.userId,
        officeLocationId: request.requestedLocationId,
        isActive: true,
        validUntil: request.requestedUntil || null
      });
      await newLoc.save();
    }

    await createNotification({
      userId: request.userId,
      type: 'general',
      title: 'Location Request ' + (action === 'approve' ? 'Approved ✅' : 'Rejected ❌'),
      message: `Your location request has been ${action}d.` + (decisionNote ? ` Note: ${decisionNote}` : ''),
      relatedId: request._id
    });

    // Real-time WebSocket emission to the employee
    emitToUser(request.userId, 'location:request_resolved', {
      requestId: request._id,
      action,
      status: newStatus,
      decisionNote,
      userId: request.userId,
    });

    return success(res, `Location request ${action}d`, { request });
  } catch (error) {
    console.error('handleLocationRequestDecision error:', error);
    return badRequest(res, 'Failed to handle location request decision');
  }
};

/**
 * GET /manager/notifications/unread-count
 * Count of pending items requiring manager attention (badge in sidebar for Device Requests).
 */
const getUnreadNotificationCount = async (req, res) => {
  try {
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return success(res, 'Unread notification count fetched', { count: 0 });

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    const count = await DeviceRequest.countDocuments({
      userId: { $in: memberIds },
      status: 'pending'
    });

    return success(res, 'Unread notification count fetched', { count });
  } catch (error) {
    console.error('getUnreadNotificationCount error:', error);
    return badRequest(res, 'Failed to fetch unread count');
  }
};

module.exports = {
  getStatus,
  getDashboard,
  getTeamAttendance,
  getTeamMembers,
  getTeamLeaveRequests,
  handleLeaveDecision,
  getTeamDailyLogs,
  getDeviceRequests,
  handleDeviceRequestDecision,
  getLocationRequests,
  handleLocationRequestDecision,
  getUnreadNotificationCount,
  getManagedTeams,
  getManagedTeam,
  getTeamMemberIds,
};
