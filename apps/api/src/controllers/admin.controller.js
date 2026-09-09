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
const { writeAuditLog } = require('../services/audit.service');
const { getClientIp, getActiveLocalInterfaces } = require('../utils/ipUtils');
const { formatDeviceLabel } = require('../utils/deviceUtils');
const ipaddr = require('ipaddr.js');

const getStatus = (req, res) => {
  return success(res, 'Admin portal backend is active');
};

const getDashboard = async (req, res) => {
  try {
    const totalEmployees = await User.countDocuments({ role: 'employee' });
    
    // Mocking the rest for now since many models might still be missing
    return success(res, 'Dashboard data retrieved', {
      activeAttendanceMethod: 'qr_code',
      totalEmployees,
      checkedInToday: 12,
      absentToday: 2,
      onLeaveToday: 1,
      pendingLeaveRequests: 3,
      pendingManualAttendanceRequests: 0,
      pendingDeviceApprovals: 5,
      missingDailyLogs: 4
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Dashboard fetch failed', error: err.message });
  }
};

const getEmployees = async (req, res) => {
  try {
    const { search, role } = req.query;
    const query = {};
    
    // Filter by role if specified, otherwise return all employees and managers
    if (role) {
      query.role = role;
    } else {
      query.role = { $in: ['employee', 'manager'] };
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const employees = await User.find(query).populate('teamId', 'name');
    
    return success(res, 'Employees fetched successfully', { employees: employees.map(e => e.toSafeObject()) });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return badRequest(res, 'Failed to fetch employees');
  }
};

const getTeams = async (req, res) => {
  try {
    const teams = await Team.find().populate('leadUserId', 'name email');
    return success(res, 'Teams fetched successfully', { teams });
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
    const { name, email, password, role, teamId, designation, phone } = req.body;
    
    if (!name || !email || !password) {
      return badRequest(res, 'Name, email and password are required.');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return badRequest(res, 'User with this email already exists.');
    }
    
    const user = new User({
      name,
      email,
      passwordHash: password,
      role: role || 'employee',
      teamId: teamId && teamId.trim() !== '' ? teamId : null,
      designation: designation || null,
      phone: phone || null
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
 * Returns all company device requests, filtered by status.
 */
const getDeviceRequests = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const query = {};
    if (status !== 'all') {
      query.status = status;
    }

    const requests = await DeviceRequest.find(query)
      .populate('userId', 'name email role designation teamId avatarUrl')
      .sort({ createdAt: -1 })
      .lean();

    return success(res, 'Fetched device requests', { requests });
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
};
