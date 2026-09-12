// D:\Employee Dashboard\attendance-system\apps\api\src\controllers\admin.controller.js

const { success, badRequest } = require('../utils/response');
const User = require('../models/User');
const Team = require('../models/Team');
const OfficeLocation = require('../models/OfficeLocation');
const DeviceRequest = require('../models/DeviceRequest');
const RegisteredDevice = require('../models/RegisteredDevice');
const Notification = require('../models/Notification');
const { createNotification } = require('../services/notification.service');
const { emitToUser, emitToManagers, emitToAdmins, emitToDeviceRequest } = require('../socket');
const AttendanceMethodSetting = require('../models/AttendanceMethodSetting');
const BiometricCredential = require('../models/BiometricCredential');
const ManagerPermission = require('../models/ManagerPermission');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const LocationRequest = require('../models/LocationRequest');
const ManualAttendanceRequest = require('../models/ManualAttendanceRequest');
const leaveService = require('../services/leave.service');
const employeeProfileService = require('../services/employeeProfile.service');
const { writeAuditLog } = require('../services/audit.service');
const { getClientIp, getActiveLocalInterfaces } = require('../utils/ipUtils');
const { formatDeviceLabel } = require('../utils/deviceUtils');
const { getTodayDateString } = require('../utils/dateUtils');
const ipaddr = require('ipaddr.js');

const getStatus = (req, res) => {
  return success(res, 'Admin portal backend is active');
};

const getDashboard = async (req, res) => {
  try {
    const validUserIds = await User.distinct('_id');
    const totalStaff = await User.countDocuments({ role: { $in: ['employee', 'manager'] }, isActive: true });
    const todayStr = getTodayDateString();

    const [
      activeMethodDoc,
      pendingDeviceApprovals,
      pendingLeaveRequests,
      pendingLocationRequests,
      checkedInToday,
      onLeaveToday
    ] = await Promise.all([
      AttendanceMethodSetting.findOne({ isActive: true }).lean(),
      DeviceRequest.countDocuments({ userId: { $in: validUserIds }, status: 'pending' }),
      LeaveRequest.countDocuments({ status: 'pending' }),
      LocationRequest.countDocuments({ status: 'pending' }),
      Attendance.countDocuments({ date: todayStr, status: { $in: ['present', 'half_day'] } }),
      Attendance.countDocuments({ date: todayStr, status: 'on_leave' }),
    ]);

    const absentToday = Math.max(0, totalStaff - checkedInToday - onLeaveToday);

    return success(res, 'Dashboard data retrieved', {
      activeAttendanceMethod: activeMethodDoc?.method || 'qr_code',
      totalStaff,
      totalEmployees: totalStaff,
      checkedInToday,
      absentToday,
      onLeaveToday,
      pendingLeaveRequests,
      pendingLocationRequests,
      pendingManualAttendanceRequests: 0,
      pendingDeviceApprovals,
      missingDailyLogs: 0
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Dashboard fetch failed', error: err.message });
  }
};

const getEmployees = async (req, res) => {
  try {
    const { search, role, teamId } = req.query;
    const query = {};
    
    // Filter by role if specified, otherwise return all employees and managers
    if (role && role !== 'all') {
      query.role = role;
    } else {
      query.role = { $in: ['employee', 'manager'] };
    }

    if (teamId && teamId !== 'all') {
      query.teamId = teamId;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const employees = await User.find(query).populate('teamId', 'name description').sort({ name: 1 });
    const today = getTodayDateString();
    const empIds = employees.map(e => e._id);

    const [todayAttendances, todayLeaves] = await Promise.all([
      Attendance.find({ userId: { $in: empIds }, date: today }).lean(),
      LeaveRequest.find({
        userId: { $in: empIds },
        status: 'approved',
        startDate: { $lte: today },
        endDate: { $gte: today },
      }).lean(),
    ]);

    const attMap = new Map(todayAttendances.map(a => [a.userId.toString(), a]));
    const leaveSet = new Set(todayLeaves.map(l => l.userId.toString()));

    const enrichedEmployees = employees.map(e => {
      const safe = e.toSafeObject();
      const att = attMap.get(e._id.toString());
      const onLeave = leaveSet.has(e._id.toString());

      let currentStatus = 'not_checked_in';
      if (onLeave) {
        currentStatus = 'on_leave';
      } else if (att) {
        if (att.checkOutTime) {
          currentStatus = 'checked_out';
        } else if (att.activeBreak?.startedAt) {
          currentStatus = 'on_break';
        } else if (att.checkInTime) {
          currentStatus = 'working';
        }
      }

      return {
        ...safe,
        currentStatus,
        todayAttendance: att ? {
          checkInTime: att.checkInTime,
          checkOutTime: att.checkOutTime,
          checkInMethod: att.checkInMethod || 'qr_code',
          status: att.status,
          totalBreakMinutes: att.completedBreakMinutes || att.totalBreakMinutes || 0,
        } : null,
      };
    });
    
    return success(res, 'Employees fetched successfully', { employees: enrichedEmployees });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return badRequest(res, 'Failed to fetch employees');
  }
};

const getTeams = async (req, res) => {
  try {
    const teams = await Team.find().populate('leadUserId', 'name email role').lean();
    const teamIds = teams.map(t => t._id);
    const members = await User.find({ teamId: { $in: teamIds }, isActive: true })
      .select('name email role designation teamId')
      .lean();

    const enriched = teams.map(t => {
      const teamMembers = members.filter(m => m.teamId?.toString() === t._id.toString());
      return {
        ...t,
        membersCount: teamMembers.length,
        members: teamMembers,
      };
    });

    return success(res, 'Teams fetched successfully', { teams: enriched });
  } catch (error) {
    console.error('Error fetching teams:', error);
    return badRequest(res, 'Failed to fetch teams');
  }
};

const createTeam = async (req, res) => {
  try {
    const { name, description, leadUserId } = req.body;
    if (!name) return badRequest(res, 'Team name is required.');

    const existing = await Team.findOne({ name });
    if (existing) return badRequest(res, 'A team with this name already exists.');

    const team = new Team({ name, description: description || null, leadUserId: leadUserId || null });
    await team.save();
    return success(res, 'Team created successfully', { team });
  } catch (error) {
    console.error('Error creating team:', error);
    return badRequest(res, 'Failed to create team');
  }
};

const createUser = async (req, res) => {
  try {
    const { 
      name, middleName, lastName, dob, gender,
      email, companyEmail, mobileNumber, phone, currentAddress, 
      emergencyContactName, emergencyContactNumber, emergencyContactRelation,
      department, designation, jobType, dateOfJoining, workLocation, 
      country, officeBranch, teamShift, teamId, password, role
    } = req.body;
    
    // Support both `mobileNumber` (from EmployeeCreationModal) and legacy `phone`
    const finalPhone = mobileNumber || phone || null;

    if (!name || !email || !password) {
      return badRequest(res, 'Name, email and password are required.');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return badRequest(res, 'User with this email already exists.');
    }
    
    const user = new User({
      name, middleName, lastName, dob, gender,
      email, companyEmail, phone: finalPhone, currentAddress,
      emergencyContactName, emergencyContactNumber, emergencyContactRelation,
      department, designation, jobType, joinedDate: dateOfJoining,
      workLocation, country, officeBranch, teamShift,
      passwordHash: password,
      role: role || 'employee',
      teamId: teamId && teamId.trim() !== '' ? teamId : null,
      forcePasswordChange: true
    });
    
    await user.save();

    // If manager is assigned to a team, keep Team.leadUserId in sync
    if (user.role === 'manager' && user.teamId) {
      await Team.findByIdAndUpdate(user.teamId, { leadUserId: user._id });
    }

    return success(res, 'User created successfully', { user: user.toSafeObject() });
  } catch (error) {
    console.error('Error creating user:', error);
    return badRequest(res, error.message || 'Failed to create user');
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, teamId, designation, phone, isActive } = req.body;

    const user = await User.findById(id).select('+passwordHash');
    if (!user) return badRequest(res, 'User not found.');

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (role !== undefined) user.role = role;
    if (teamId !== undefined) user.teamId = teamId && teamId.trim() !== '' ? teamId : null;
    if (designation !== undefined) user.designation = designation || null;
    if (phone !== undefined) user.phone = phone || null;
    if (isActive !== undefined) user.isActive = isActive;
    if (password && password.trim() !== '') user.passwordHash = password;

    await user.save();

    // If manager is assigned to a team, keep Team.leadUserId in sync
    if (user.role === 'manager' && user.teamId) {
      await Team.findByIdAndUpdate(user.teamId, { leadUserId: user._id });
    }

    return success(res, 'User updated successfully', { user: user.toSafeObject() });
  } catch (error) {
    console.error('Error updating user:', error);
    return badRequest(res, error.message || 'Failed to update user');
  }
};

const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, leadUserId, isActive } = req.body;

    const team = await Team.findById(id);
    if (!team) return badRequest(res, 'Team not found.');

    if (name !== undefined) team.name = name;
    if (description !== undefined) team.description = description;
    if (leadUserId !== undefined) {
      team.leadUserId = leadUserId && leadUserId.trim() !== '' ? leadUserId : null;
      if (team.leadUserId) {
        await User.findByIdAndUpdate(team.leadUserId, { teamId: team._id });
      }
    }
    if (isActive !== undefined) team.isActive = isActive;

    await team.save();
    return success(res, 'Team updated successfully', { team });
  } catch (error) {
    console.error('Error updating team:', error);
    return badRequest(res, error.message || 'Failed to update team');
  }
};

const getOfficeLocations = async (req, res) => {
  try {
    const locations = await OfficeLocation.find().sort({ createdAt: -1 });
    return success(res, 'Office locations fetched', { locations });
  } catch (error) {
    console.error('Error fetching office locations:', error);
    return badRequest(res, 'Failed to fetch office locations');
  }
};

const createOfficeLocation = async (req, res) => {
  try {
    const { officeName, latitude, longitude, radiusMeters, status, wifiSsid, allowedIps } = req.body;
    
    if (!officeName || latitude == null || longitude == null || radiusMeters == null) {
      return badRequest(res, 'Name, latitude, longitude, and radius are required.');
    }

    let normalizedAllowedIps = [];
    if (Array.isArray(allowedIps)) {
      normalizedAllowedIps = allowedIps.map((ip) => String(ip).trim()).filter(Boolean);
    } else if (typeof allowedIps === 'string') {
      normalizedAllowedIps = allowedIps.split(',').map((ip) => ip.trim()).filter(Boolean);
    }

    const newLocation = new OfficeLocation({
      officeName,
      latitude,
      longitude,
      radiusMeters,
      wifiSsid: wifiSsid ? wifiSsid.trim() : null,
      allowedIps: normalizedAllowedIps,
      status: status || 'active',
      createdBy: req.user._id,
    });

    await newLocation.save();
    return success(res, 'Office location created', { location: newLocation });
  } catch (error) {
    console.error('Error creating office location:', error);
    return badRequest(res, error.message || 'Failed to create office location');
  }
};

const updateOfficeLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { officeName, latitude, longitude, radiusMeters, status, wifiSsid, allowedIps } = req.body;
    
    const location = await OfficeLocation.findById(id);
    if (!location) return badRequest(res, 'Office location not found');

    if (officeName !== undefined) location.officeName = officeName;
    if (latitude !== undefined) location.latitude = latitude;
    if (longitude !== undefined) location.longitude = longitude;
    if (radiusMeters !== undefined) location.radiusMeters = radiusMeters;
    if (status !== undefined) location.status = status;
    if (wifiSsid !== undefined) location.wifiSsid = wifiSsid ? wifiSsid.trim() : null;

    if (allowedIps !== undefined) {
      if (Array.isArray(allowedIps)) {
        location.allowedIps = allowedIps.map((ip) => String(ip).trim()).filter(Boolean);
      } else if (typeof allowedIps === 'string') {
        location.allowedIps = allowedIps.split(',').map((ip) => ip.trim()).filter(Boolean);
      }
    }

    location.updatedBy = req.user._id;

    await location.save();
    return success(res, 'Office location updated', { location });
  } catch (error) {
    console.error('Error updating office location:', error);
    return badRequest(res, error.message || 'Failed to update office location');
  }
};

const fetchEgressIpv4 = () => {
  return new Promise((resolve) => {
    const https = require('https');
    const req = https.get('https://api4.ipify.org', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data.trim() || null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
};

const fetchEgressIpv6 = () => {
  return new Promise((resolve) => {
    const https = require('https');
    const req = https.get('https://api6.ipify.org', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data.trim() || null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
};

const { execSync } = require('child_process');

const getConnectedSsid = () => {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync('netsh wlan show interfaces', { encoding: 'utf8', timeout: 2000 });
    const match = out.match(/^\s*SSID\s*:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  } catch (e) {
    return null;
  }
};

const getCurrentIp = async (req, res) => {
  try {
    const connectionIp = getClientIp(req);
    const [publicIpv4, publicIpv6] = await Promise.all([
      fetchEgressIpv4(),
      fetchEgressIpv6(),
    ]);

    let ipv6Subnet = null;
    if (publicIpv6) {
      try {
        const parsed = ipaddr.IPv6.parse(publicIpv6);
        const normalizedParts = [...parsed.parts.slice(0, 4), 0, 0, 0, 0];
        ipv6Subnet = new ipaddr.IPv6(normalizedParts).toString() + '/64';
      } catch (e) {
        console.error('Failed to parse IPv6 subnet:', e);
      }
    }

    const localInterfaces = getActiveLocalInterfaces();
    const primaryLocal =
      localInterfaces.find((i) => i.adapterName.toLowerCase().includes('wi-fi') || i.adapterName.toLowerCase().includes('wifi')) ||
      localInterfaces[0] ||
      null;

    const detectedSsid = getConnectedSsid();
    const requiredIps = [];
    if (ipv6Subnet) requiredIps.push(ipv6Subnet);
    if (publicIpv4 && !requiredIps.includes(publicIpv4)) requiredIps.push(publicIpv4);
    if (primaryLocal?.subnet && !requiredIps.includes(primaryLocal.subnet)) requiredIps.push(primaryLocal.subnet);

    return success(res, 'Current network IP addresses detected', {
      ip: connectionIp,
      clientIp: connectionIp,
      publicIp: publicIpv4 || publicIpv6 || connectionIp,
      publicIpv4: publicIpv4 || null,
      publicIpv6: publicIpv6 || null,
      ipv6Subnet: ipv6Subnet || null,
      localWifi: primaryLocal || null,
      localInterfaces,
      connectionIp,
      wifiSsid: detectedSsid || null,
      requiredIps,
    });
  } catch (error) {
    console.error('Error detecting current IP:', error);
    return badRequest(res, 'Failed to detect current IP');
  }
};

const deleteOfficeLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const location = await OfficeLocation.findByIdAndDelete(id);
    if (!location) return badRequest(res, 'Office location not found');
    
    return success(res, 'Office location deleted', { location });
  } catch (error) {
    console.error('Error deleting office location:', error);
    return badRequest(res, 'Failed to delete office location');
  }
};

/**
 * GET /api/admin/device-requests
 * Returns all company device requests, filtered by status, formatted with labels and counts.
 */
const getDeviceRequests = async (req, res) => {
  try {
    const validUserIds = await User.distinct('_id');
    const status = req.query.status || 'all';

    const baseQuery = { userId: { $in: validUserIds } };
    const query = { ...baseQuery };
    if (status !== 'all') {
      query.status = status;
    }

    const [rawRequests, counts] = await Promise.all([
      DeviceRequest.find(query)
        .populate({
          path: 'userId',
          select: 'name email role designation teamId avatarUrl',
          populate: { path: 'teamId', select: 'name' },
        })
        .sort({ createdAt: -1 })
        .lean(),
      (async () => {
        const [all, pending, approved, rejected] = await Promise.all([
          DeviceRequest.countDocuments(baseQuery),
          DeviceRequest.countDocuments({ ...baseQuery, status: 'pending' }),
          DeviceRequest.countDocuments({ ...baseQuery, status: 'approved' }),
          DeviceRequest.countDocuments({ ...baseQuery, status: 'rejected' }),
        ]);
        return { all, pending, approved, rejected };
      })(),
    ]);

    const requests = rawRequests.map((r) => ({
      ...r,
      requestedDeviceLabel: formatDeviceLabel(r.requestedDeviceLabel),
    }));

    // Mark notifications for device requests as read for this admin
    if (req.user?._id) {
      await Notification.updateMany(
        { userId: req.user._id, isRead: false, type: { $in: ['device_request', 'new_device_request', 'device_request_submitted'] } },
        { $set: { isRead: true } }
      );
    }

    return success(res, 'Fetched device requests', { requests, counts });
  } catch (error) {
    console.error('getDeviceRequests error:', error);
    return badRequest(res, 'Failed to fetch device requests');
  }
};

/**
 * PATCH /api/admin/device-requests/:id/decision
 * Admin approves or rejects any employee device replacement request.
 */
const handleDeviceRequestDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, decisionNote, approvedUntil } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return badRequest(res, 'Action must be approve or reject');
    }

    const request = await DeviceRequest.findById(id);
    if (!request) return badRequest(res, 'Device request not found');

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    request.status = newStatus;
    request.decisionNote = decisionNote || null;
    if (action === 'approve' && approvedUntil) {
      request.requestedUntil = approvedUntil;
    }
    await request.save();

    if (action === 'approve') {
      // Revoke all previous devices
      await RegisteredDevice.updateMany({ userId: request.userId }, { isActive: false, status: 'REVOKED' });

      // Invalidate all previous biometric credentials tied to revoked devices
      await BiometricCredential.updateMany({ userId: request.userId }, { isActive: false });

      // Create new active device
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
      title: 'Device Request ' + (action === 'approve' ? 'Approved by Admin ✅' : 'Rejected by Admin ❌'),
      message: `Your device request has been ${action}d by Admin.` + (decisionNote ? ` Note: ${decisionNote}` : ''),
      relatedId: request._id,
    });

    // Mark notifications related to this request as read
    await Notification.updateMany(
      { relatedId: request._id, isRead: false },
      { $set: { isRead: true } }
    );

    // Real-time WebSocket emission to all channels
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

    return success(res, `Device request ${action}d successfully`, { request });
  } catch (error) {
    console.error('admin handleDeviceRequestDecision error:', error);
    return badRequest(res, 'Failed to handle device request decision');
  }
};

const getActiveAttendanceMethod = async (req, res) => {
  try {
    const latest = await AttendanceMethodSetting.findOne().sort({ changedAt: -1 });
    const activeMethod = latest ? latest.activeMethod : 'qr_code';
    return success(res, 'Active attendance method fetched', { activeMethod });
  } catch (error) {
    console.error('getActiveAttendanceMethod error:', error);
    return badRequest(res, 'Failed to fetch active attendance method');
  }
};

const switchAttendanceMethod = async (req, res) => {
  try {
    const method = req.body.method || req.body.activeMethod;
    const { reason } = req.body;
    const validMethods = ['qr_code', 'wifi_ip', 'device_fingerprint', 'biometric'];
    if (!method || !validMethods.includes(method)) {
      return badRequest(res, `Invalid method. Must be one of: ${validMethods.join(', ')}`);
    }
    if (!reason || !reason.trim()) {
      return badRequest(res, 'Reason is required when switching attendance method');
    }
    if (reason.trim().length > 300) {
      return badRequest(res, 'Reason cannot exceed 300 characters');
    }

    const newSetting = new AttendanceMethodSetting({
      activeMethod: method,
      changedBy: req.user._id,
      reason: reason.trim(),
      changedAt: new Date(),
    });
    await newSetting.save();

    await writeAuditLog({
      action: 'ATTENDANCE_METHOD_SWITCHED',
      performedBy: req.user,
      targetCollection: 'AttendanceMethodSetting',
      targetId: newSetting._id,
      reason: reason.trim(),
      metadata: { newMethod: method },
      ipAddress: getClientIp(req),
    });

    return success(res, 'Attendance method switched successfully', { activeMethod: method });
  } catch (error) {
    console.error('switchAttendanceMethod error:', error);
    return badRequest(res, 'Failed to switch attendance method');
  }
};

const getManagerPermissions = async (req, res) => {
  try {
    const managers = await User.find({ role: 'manager' }).select('name email role teamId mfaEnabled').lean();
    const permissions = await ManagerPermission.find({
      userId: { $in: managers.map(m => m._id) },
    }).lean();

    const permMap = {};
    permissions.forEach(p => {
      permMap[p.userId.toString()] = p.permissions || {};
    });

    const defaultPerms = {
      canApproveLeaves: true,
      canEditAttendance: false,
      canAddPerformanceNotes: true,
      canViewTeamReports: true,
    };

    const result = managers.map(m => ({
      _id: m._id,
      name: m.name,
      email: m.email,
      role: m.role,
      mfaEnabled: !!m.mfaEnabled,
      permissions: {
        ...defaultPerms,
        ...(permMap[m._id.toString()] || {}),
      },
    }));

    return success(res, 'Manager permissions retrieved', { managers: result });
  } catch (error) {
    console.error('getManagerPermissions error:', error);
    return badRequest(res, 'Failed to fetch manager permissions');
  }
};

const updateManagerPermission = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== 'object') {
      return badRequest(res, 'Permissions object required');
    }

    const manager = await User.findById(userId);
    if (!manager || manager.role !== 'manager') {
      return badRequest(res, 'Manager not found');
    }

    const updated = await ManagerPermission.findOneAndUpdate(
      { userId },
      {
        $set: {
          'permissions.canApproveLeaves': !!permissions.canApproveLeaves,
          'permissions.canEditAttendance': !!permissions.canEditAttendance,
          'permissions.canAddPerformanceNotes': !!permissions.canAddPerformanceNotes,
          'permissions.canViewTeamReports': !!permissions.canViewTeamReports,
        },
      },
      { upsert: true, new: true }
    );

    return success(res, 'Manager permissions updated successfully', {
      managerId: userId,
      permissions: updated.permissions,
    });
  } catch (error) {
    console.error('updateManagerPermission error:', error);
    return badRequest(res, 'Failed to update manager permissions');
  }
};

/**
 * GET /api/admin/attendance
 * Returns company-wide attendance records for a given date, with optional team filter.
 */
const getAttendance = async (req, res) => {
  try {
    const date = req.query.date || getTodayDateString();
    const query = { role: { $in: ['employee', 'manager'] }, isActive: true };
    if (req.query.role && req.query.role !== 'all') {
      query.role = req.query.role;
    }
    if (req.query.teamId && req.query.teamId !== 'all') {
      query.teamId = req.query.teamId;
    }

    const [members, teams] = await Promise.all([
      User.find(query)
        .select('name designation email avatarUrl phone teamId role')
        .populate('teamId', 'name')
        .sort({ name: 1 })
        .lean(),
      Team.find({ isActive: true }).select('name').sort({ name: 1 }).lean(),
    ]);

    const memberIds = members.map((m) => m._id);
    const [attendanceRecords, manualRequests] = await Promise.all([
      Attendance.find({ userId: { $in: memberIds }, date })
        .populate('userId', 'name designation email avatarUrl phone teamId role')
        .lean(),
      ManualAttendanceRequest.find({ userId: { $in: memberIds }, requestDate: date }).lean(),
    ]);

    const manualRequestMap = new Map();
    for (const mr of manualRequests) {
      if (mr.userId) {
        manualRequestMap.set(mr.userId.toString(), mr);
      }
    }

    const attendanceMap = new Map();
    for (const record of attendanceRecords) {
      if (record.userId?._id) {
        attendanceMap.set(record.userId._id.toString(), record);
      }
    }

    const fullAttendance = members.map((member) => {
      const existing = attendanceMap.get(member._id.toString());
      const manualReq = manualRequestMap.get(member._id.toString()) || null;

      if (existing) {
        return {
          ...existing,
          manualRequest: manualReq,
        };
      }
      return {
        _id: `roster-${member._id}`,
        userId: member,
        date,
        checkInTime: null,
        checkOutTime: null,
        totalWorkMinutes: 0,
        totalBreakMinutes: 0,
        status: manualReq && manualReq.status === 'pending' ? 'manual_pending' : 'not_checked_in',
        breaks: [],
        manualRequest: manualReq,
      };
    });

    return success(res, 'Fetched attendance records', {
      attendance: fullAttendance,
      teams,
    });
  } catch (error) {
    console.error('admin getAttendance error:', error);
    return badRequest(res, 'Failed to fetch attendance records');
  }
};

/**
 * GET /api/admin/leave-requests
 * Returns all company leave requests with optional status and team filters.
 */
const getLeaveRequests = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const baseQuery = {};

    if (req.query.teamId && req.query.teamId !== 'all') {
      const teamUsers = await User.find({ teamId: req.query.teamId }).select('_id');
      baseQuery.userId = { $in: teamUsers.map((u) => u._id) };
    }

    const query = { ...baseQuery };
    if (status !== 'all') {
      query.status = status;
    }

    const [requests, teams, pendingCount, approvedCount, rejectedCount, totalCount] = await Promise.all([
      LeaveRequest.find(query)
        .populate({
          path: 'userId',
          select: 'name email designation avatarUrl teamId',
          populate: { path: 'teamId', select: 'name' },
        })
        .populate('leaveTypeId', 'name code')
        .sort({ createdAt: -1 })
        .lean(),
      Team.find({ isActive: true }).select('name').sort({ name: 1 }).lean(),
      LeaveRequest.countDocuments({ ...baseQuery, status: 'pending' }),
      LeaveRequest.countDocuments({ ...baseQuery, status: 'approved' }),
      LeaveRequest.countDocuments({ ...baseQuery, status: 'rejected' }),
      LeaveRequest.countDocuments(baseQuery),
    ]);

    const counts = {
      total: totalCount,
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    };

    return success(res, 'Fetched leave requests', { requests, teams, counts });
  } catch (error) {
    console.error('admin getLeaveRequests error:', error);
    return badRequest(res, 'Failed to fetch leave requests');
  }
};

/**
 * POST /api/admin/leave/:id/decision
 * Admin approves or rejects a leave request.
 */
const handleLeaveDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, decisionNote } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return badRequest(res, 'Decision must be approved or rejected');
    }

    const leave = await LeaveRequest.findById(id);
    if (!leave) return badRequest(res, 'Leave request not found');

    const updatedLeave = await leaveService.makeLeaveDecision({
      leaveId: id,
      decidedBy: req.user,
      decision,
      decisionNote,
    });

    const socketPayload = {
      leaveId: id,
      decision,
      decisionNote,
      leave: updatedLeave,
    };

    emitToUser(leave.userId, 'leave:request_resolved', socketPayload);
    emitToAdmins('leave:request_resolved', socketPayload);
    emitToManagers('leave:request_resolved', socketPayload);

    return success(res, `Leave request ${decision}`, { leave: updatedLeave });
  } catch (error) {
    console.error('admin handleLeaveDecision error:', error);
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || 'Failed to handle leave decision',
    });
  }
};

/**
 * POST /api/admin/managers/:id/reset-mfa
 * Admin resets a manager's MFA configuration.
 * The old MFA secret is permanently invalidated and session tokens are revoked.
 * On next login, the manager will receive a brand new secret and QR code.
 */
const resetManagerMfa = async (req, res) => {
  try {
    const { id } = req.params;
    const manager = await User.findById(id).select('+mfaSecret +mfaPendingSecret');
    if (!manager || manager.role !== 'manager') {
      return badRequest(res, 'Manager not found.');
    }

    // Invalidate existing MFA configuration & secrets completely
    manager.mfaEnabled = false;
    manager.mfaSecret = null;
    manager.mfaPendingSecret = null;
    manager.mfaPendingCreatedAt = null;
    manager.tokenVersion = (manager.tokenVersion || 0) + 1; // Invalidate active session tokens
    await manager.save();

    console.log(`[MFA Reset] Admin ${req.user.name} (${req.user._id}) reset MFA for manager ${manager.name} (${manager._id})`);

    return success(res, `MFA for ${manager.name} has been reset. The previous MFA secret is invalidated and they will be prompted to scan a fresh QR code upon next login.`);
  } catch (error) {
    console.error('resetManagerMfa error:', error);
    return badRequest(res, error.message || 'Failed to reset manager MFA');
  }
};

/**
 * GET /api/admin/employees/:id/profile
 * Admin 360° employee profile view.
 */
const getEmployeeProfile = async (req, res) => {
  try {
    const profile = await employeeProfileService.getEmployeeProfile(req.params.id, req.query);
    if (!profile) {
      return badRequest(res, 'Employee not found');
    }
    return success(res, 'Employee profile fetched successfully', profile);
  } catch (err) {
    console.error('admin getEmployeeProfile error:', err);
    return badRequest(res, 'Failed to fetch employee profile');
  }
};

/**
 * GET /api/admin/employees/:id/attendance
 */
const getEmployeeAttendanceHistory = async (req, res) => {
  try {
    const result = await employeeProfileService.getPaginatedAttendance(req.params.id, req.query);
    return success(res, 'Attendance history fetched successfully', result);
  } catch (err) {
    console.error('admin getEmployeeAttendanceHistory error:', err);
    return badRequest(res, 'Failed to fetch attendance history');
  }
};

/**
 * GET /api/admin/employees/:id/daily-logs
 */
const getEmployeeDailyLogs = async (req, res) => {
  try {
    const result = await employeeProfileService.getPaginatedDailyLogs(req.params.id, req.query);
    return success(res, 'Daily logs fetched successfully', result);
  } catch (err) {
    console.error('admin getEmployeeDailyLogs error:', err);
    return badRequest(res, 'Failed to fetch daily logs');
  }
};

/**
 * GET /api/admin/employees/:id/overtime
 */
const getEmployeeOvertimeHistory = async (req, res) => {
  try {
    const result = await employeeProfileService.getPaginatedOvertime(req.params.id, req.query);
    return success(res, 'Overtime history fetched successfully', result);
  } catch (err) {
    console.error('admin getEmployeeOvertimeHistory error:', err);
    return badRequest(res, 'Failed to fetch overtime history');
  }
};

module.exports = { 
  getStatus, 
  getDashboard, 
  getEmployees, 
  getTeams,
  createTeam,
  updateTeam,
  createUser,
  updateUser,
  getOfficeLocations,
  createOfficeLocation,
  updateOfficeLocation,
  deleteOfficeLocation,
  getDeviceRequests,
  handleDeviceRequestDecision,
  getActiveAttendanceMethod,
  switchAttendanceMethod,
  getCurrentIp,
  getManagerPermissions,
  updateManagerPermission,
  getAttendance,
  getLeaveRequests,
  handleLeaveDecision,
  resetManagerMfa,
  getEmployeeProfile,
  getEmployeeAttendanceHistory,
  getEmployeeDailyLogs,
  getEmployeeOvertimeHistory,
};
