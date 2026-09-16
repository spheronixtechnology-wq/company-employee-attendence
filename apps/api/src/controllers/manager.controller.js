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
const AttendanceMethodSetting = require('../models/AttendanceMethodSetting');
const ManualAttendanceRequest = require('../models/ManualAttendanceRequest');

const leaveService = require('../services/leave.service');
const employeeProfileService = require('../services/employeeProfile.service');
const { writeAuditLog } = require('../services/audit.service');
const { createNotification } = require('../services/notification.service');

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
  const query = { teamId: { $in: ids }, role: { $in: ['employee'] }, deletedAt: null };
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

    const targetDate = req.query.date || getTodayDateString();
    const totalMembers = memberIds.length;
    
    const checkedInCount = await Attendance.countDocuments({
      userId: { $in: memberIds },
      date: targetDate,
      checkInTime: { $ne: null }
    });

    const onLeaveCount = await LeaveRequest.countDocuments({
      userId: { $in: memberIds },
      status: 'approved',
      startDate: { $lte: targetDate },
      endDate: { $gte: targetDate }
    });

    const loggedUsers = await DailyLog.distinct('userId', { logDate: targetDate, userId: { $in: memberIds } });
    const missingDailyLogs = Math.max(0, checkedInCount - loggedUsers.length);

    const pendingLeaveRequests = await LeaveRequest.countDocuments({ userId: { $in: memberIds }, status: 'pending' });
    const pendingDeviceRequests = await DeviceRequest.countDocuments({ userId: { $in: memberIds }, status: 'pending' });
    const pendingLocationRequests = await LocationRequest.countDocuments({ userId: { $in: memberIds }, status: 'pending' });

    const activeSetting = await AttendanceMethodSetting.findOne().sort({ createdAt: -1 });
    const activeAttendanceMethod = activeSetting?.method || 'qr_code';

    return success(res, 'Dashboard fetched', {
      selectedDate: targetDate,
      activeAttendanceMethod,
      teamTotal: totalMembers,
      checkedIn: checkedInCount,
      onLeave: onLeaveCount,
      notCheckedIn: Math.max(0, totalMembers - checkedInCount - onLeaveCount),
      missingDailyLogs,
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
    const members = await User.find({ teamId: { $in: teamIds }, role: 'employee', isActive: true, deletedAt: null })
      .select('name designation email avatarUrl phone')
      .sort({ name: 1 });

    const memberIds = members.map(m => m._id);
    const [attendanceRecords, manualRequests] = await Promise.all([
      Attendance.find({ userId: { $in: memberIds }, date })
        .populate('userId', 'name designation email avatarUrl phone')
        .sort({ 'userId.name': 1 }),
      ManualAttendanceRequest.find({ userId: { $in: memberIds }, requestDate: date }).lean(),
    ]);

    const manualRequestMap = new Map();
    for (const mr of manualRequests) {
      manualRequestMap.set(mr.userId.toString(), mr);
    }

    const attendanceMap = new Map();
    for (const record of attendanceRecords) {
      if (record.userId?._id) {
        attendanceMap.set(record.userId._id.toString(), record);
      }
    }

    // Merge team members so un-checked-in employees are still visible in roster
    const fullAttendance = members.map(member => {
      const existing = attendanceMap.get(member._id.toString());
      const manualReq = manualRequestMap.get(member._id.toString()) || null;

      if (existing) {
        const obj = existing.toObject ? existing.toObject() : { ...existing };
        obj.manualRequest = manualReq;
        return obj;
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
    const members = await User.find({ teamId: { $in: teamIds }, role: 'employee', isActive: true, deletedAt: null })
      .select('name email phone designation avatarUrl teamId createdAt')
      .populate('teamId', 'name')
      .sort({ name: 1 })
      .lean();

    const targetDate = req.query.date || getTodayDateString();
    const memberIds = members.map(m => m._id);

    const attendances = await Attendance.find({ userId: { $in: memberIds }, date: targetDate }).lean();
    const attMap = new Map(attendances.map(a => [a.userId.toString(), a]));

    const dailyLogs = await DailyLog.find({ userId: { $in: memberIds }, logDate: targetDate }).lean();
    const logMap = new Map(dailyLogs.map(l => [l.userId.toString(), l]));

    const enrichedMembers = members.map(member => {
      const att = attMap.get(member._id.toString());
      const dLog = logMap.get(member._id.toString());
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
        checkInTime: att?.checkInTime || (dLog?.checkInTime ? `${targetDate}T${dLog.checkInTime}:00` : null),
        checkOutTime: att?.checkOutTime || (dLog?.checkOutTime ? `${targetDate}T${dLog.checkOutTime}:00` : null),
        totalWorkMinutes: att?.actualWorkMinutes || att?.totalDurationMinutes || (dLog?.hoursSpent ? Math.round(dLog.hoursSpent * 60) : 0),
        dailyLogSubmitted: Boolean(dLog || att?.dailyLogSubmitted),
        todayAttendance: att || null,
      };
    });

    return success(res, 'Team members fetched successfully', {
      teams: teams.map(t => ({ id: t._id, name: t.name, description: t.description })),
      members: enrichedMembers,
      selectedDate: targetDate,
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
    if (!teams || teams.length === 0) return success(res, 'Fetched leave requests', { requests: [], counts: { total: 0, pending: 0, approved: 0, rejected: 0 } });

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    
    // Always fetch all to compute counts
    const allRequests = await LeaveRequest.find({ userId: { $in: memberIds } })
      .populate('userId', 'name email designation teamId')
      .populate('leaveTypeId', 'name code')
      .sort({ createdAt: -1 });

    const counts = {
      total: allRequests.length,
      pending: allRequests.filter(r => r.status === 'pending').length,
      approved: allRequests.filter(r => r.status === 'approved').length,
      rejected: allRequests.filter(r => r.status === 'rejected').length,
    };

    const requests = status === 'all' ? allRequests : allRequests.filter(r => r.status === status);

    return success(res, 'Fetched leave requests', { requests, counts });
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
    const { startDate, endDate, date, recent } = req.query;
    const isRecent = recent === 'true' || (!startDate && !endDate && !date);
    
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return success(res, 'Fetched daily logs', { logs: [], totalTeamMembers: 0 });

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    
    let query = { userId: { $in: memberIds } };
    
    if (startDate && endDate) {
      query.logDate = { $gte: startDate, $lte: endDate };
    } else if (date) {
      query.logDate = date;
    }

    const logsQuery = DailyLog.find(query)
      .populate('userId', 'name email designation avatarUrl phone teamId')
      .populate('teamId', 'name')
      .sort({ logDate: -1, createdAt: -1 });

    if (isRecent) logsQuery.limit(50);

    const logs = await logsQuery.lean();

    const uniqueDates = [...new Set(logs.map(l => l.logDate))];

    // Fetch attendance records for these members on these dates to provide full shift insights
    const attendances = await Attendance.find({ 
      userId: { $in: memberIds }, 
      date: { $in: uniqueDates } 
    }).lean();
    
    const attMap = new Map();
    for (const a of attendances) {
      if (a.userId) attMap.set(`${a.userId.toString()}_${a.date}`, a);
    }

    const enrichedLogs = logs.map(log => {
      const rawAtt = log.userId?._id ? attMap.get(`${log.userId._id.toString()}_${log.logDate}`) || null : null;
      const att = rawAtt ? employeeProfileService.enrichAttendanceRecord(rawAtt) : null;

      let hoursSpent = log.hoursSpent;
      if (att) {
        const netMins = att.actualWorkMinutes ?? (att.totalDurationMinutes ? Math.max(0, att.totalDurationMinutes - (att.totalBreakMinutes || 0)) : null);
        if (netMins !== null && netMins !== undefined && netMins > 0) {
          hoursSpent = Math.round((netMins / 60) * 10) / 10;
        }
      }

      return {
        ...log,
        checkInTime: log.checkInTime || (att?.checkInTime ? att.checkInTime : null),
        checkOutTime: log.checkOutTime || (att?.checkOutTime ? att.checkOutTime : null),
        hoursSpent,
        attendance: att,
      };
    });

    const teamMembers = await User.find({ _id: { $in: memberIds } })
      .select('name email designation avatarUrl joinedDate')
      .lean();

    // Compute missing logs
    const missingMembers = [];
    if (date) {
      const d = new Date(date);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (!isWeekend) {
        const submittedIds = new Set(logs.map(l => l.userId._id.toString()));
        for (const member of teamMembers) {
          // If date is before joinedDate, skip
          if (member.joinedDate && new Date(member.joinedDate) > d) continue;
          if (!submittedIds.has(member._id.toString())) {
            missingMembers.push(member);
          }
        }
      }
    }

    return success(res, 'Fetched daily logs', { 
      logs: enrichedLogs,
      totalTeamMembers: memberIds.length,
      teamMembers,
      missingMembers
    });
  } catch (error) {
    console.error('getTeamDailyLogs error:', error);
    return badRequest(res, 'Failed to fetch daily logs');
  }
};

// ── Manager Creating Employees ─────────────────────────────
const createTeamMember = async (req, res) => {
  try {
    const { 
      name, middleName, lastName, dob, gender,
      email, companyEmail, mobileNumber, currentAddress, 
      emergencyContactName, emergencyContactNumber, emergencyContactRelation,
      department, designation, jobType, dateOfJoining, workLocation, 
      country, officeBranch, teamShift, teamId, password
    } = req.body;

    if (!name || !lastName || !email || !mobileNumber || !currentAddress || 
        !emergencyContactName || !emergencyContactNumber || !emergencyContactRelation ||
        !department || !designation || !jobType || !dateOfJoining || 
        !workLocation || !country || !officeBranch || !teamShift || !password) {
      return badRequest(res, 'Missing required fields.');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return badRequest(res, 'User with this email already exists.');

    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) return forbidden(res, 'You do not manage any teams.');
    
    const validTeamIds = teams.map(t => t._id.toString());
    let assignedTeamId = teamId;
    if (validTeamIds.length === 1) {
      assignedTeamId = validTeamIds[0];
    } else if (!validTeamIds.includes(assignedTeamId)) {
      return forbidden(res, 'You are not authorized to add members to this team.');
    }

    const user = new User({
      name, middleName, lastName, dob, gender,
      email, companyEmail, phone: mobileNumber, currentAddress,
      emergencyContactName, emergencyContactNumber, emergencyContactRelation,
      department, designation, jobType, joinedDate: dateOfJoining,
      workLocation, country, officeBranch, teamShift,
      passwordHash: password,
      role: 'employee',
      teamId: assignedTeamId,
      reportingManager: req.user._id,
      forcePasswordChange: true
    });
    
    await user.save();
    return success(res, 'Team member created successfully', { user: user.toSafeObject() });
  } catch (error) {
    console.error('createTeamMember error:', error);
    return badRequest(res, 'Failed to create team member');
  }
};

// ── Manager Log Management ─────────────────────────────────
const submitTeamMemberDailyLog = async (req, res) => {
  try {
    const { userId, logDate, hoursSpent, taskTitle, projectName, description, blockers, checkInTime, checkOutTime } = req.body;
    if (!userId || !logDate || !hoursSpent) return badRequest(res, 'User ID, Date, and Hours are required');

    const targetUser = await User.findById(userId);
    if (!targetUser || !targetUser.teamId) return badRequest(res, 'User not found or unassigned');

    const teams = await getManagedTeams(req.user);
    if (!teams.some(t => t._id.toString() === targetUser.teamId.toString())) {
      return forbidden(res, 'Not authorized to upload logs for this employee');
    }

    const existingLog = await DailyLog.findOne({ userId, logDate });
    if (existingLog) return badRequest(res, 'A log already exists for this date. Use edit instead.');

    let docParams = {};
    if (req.file) {
      const extMatch = (req.file.originalname || '').split('.').pop();
      const doctype = extMatch ? extMatch.toLowerCase() : 'doc';
      let documentUrl = null;
      if (req.file.buffer) {
        const base64Data = req.file.buffer.toString('base64');
        const mime = req.file.mimetype || 'application/octet-stream';
        documentUrl = `data:${mime};base64,${base64Data}`;
      } else if (req.file.filename) {
        documentUrl = `/uploads/${req.file.filename}`;
      }
      docParams = {
        documentUrl,
        attachmentUrl: documentUrl,
        documentName: req.file.originalname,
        documentSize: req.file.size,
        documentMimeType: req.file.mimetype || 'application/octet-stream',
        doctype,
      };
    }

    const resolvedTaskTitle = (taskTitle || (req.file ? req.file.originalname : 'Daily Work Document')).trim();
    const resolvedProjectName = (projectName || 'Daily Log').trim();
    const resolvedDescription = (description || (req.file ? 'Submitted via daily work document upload.' : 'Submitted by Manager.')).trim();

    const log = new DailyLog({
      userId,
      teamId: targetUser.teamId,
      logDate,
      hoursSpent: parseFloat(hoursSpent),
      checkInTime: checkInTime || null,
      checkOutTime: checkOutTime || null,
      taskTitle: resolvedTaskTitle,
      projectName: resolvedProjectName,
      description: resolvedDescription,
      blockers: blockers ? blockers.trim() : null,
      ...docParams,
      createdBy: req.user._id,
      createdByRole: 'manager',
      submissionType: 'manager',
      isEdited: false,
      submittedAt: new Date(),
    });

    await log.save();

    // Mark dailyLogSubmitted in Attendance and sync check-in/out
    const attUpdate = { dailyLogSubmitted: true };
    if (checkInTime) {
      const d = new Date(`${logDate}T${checkInTime}:00`);
      if (!isNaN(d.getTime())) attUpdate.checkInTime = d;
    }
    if (checkOutTime) {
      const d = new Date(`${logDate}T${checkOutTime}:00`);
      if (!isNaN(d.getTime())) attUpdate.checkOutTime = d;
    }
    if (hoursSpent) {
      const workMins = Math.round(parseFloat(hoursSpent) * 60);
      attUpdate.actualWorkMinutes = workMins;
      attUpdate.totalDurationMinutes = workMins;
      attUpdate.status = 'present';
    }

    await Attendance.updateOne(
      { userId, date: logDate },
      { $set: attUpdate },
      { upsert: true }
    );

    return success(res, 'Daily log submitted successfully', { log });
  } catch (error) {
    console.error('submitTeamMemberDailyLog error:', error);
    return badRequest(res, 'Failed to submit log');
  }
};

const updateTeamMemberDailyLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const { hoursSpent, taskTitle, projectName, description, blockers, checkInTime, checkOutTime } = req.body;

    const log = await DailyLog.findById(logId);
    if (!log) return badRequest(res, 'Log not found');

    const targetUser = await User.findById(log.userId);
    const teams = await getManagedTeams(req.user);
    if (!teams.some(t => t._id.toString() === targetUser.teamId.toString())) {
      return forbidden(res, 'Not authorized to edit logs for this employee');
    }

    if (hoursSpent) log.hoursSpent = parseFloat(hoursSpent);
    if (checkInTime !== undefined) log.checkInTime = checkInTime;
    if (checkOutTime !== undefined) log.checkOutTime = checkOutTime;
    if (taskTitle !== undefined) log.taskTitle = taskTitle;
    if (projectName !== undefined) log.projectName = projectName;
    if (description !== undefined) log.description = description;
    if (blockers !== undefined) log.blockers = blockers;

    if (req.file) {
      const extMatch = (req.file.originalname || '').split('.').pop();
      const doctype = extMatch ? extMatch.toLowerCase() : 'doc';
      let documentUrl = null;
      if (req.file.buffer) {
        const base64Data = req.file.buffer.toString('base64');
        const mime = req.file.mimetype || 'application/octet-stream';
        documentUrl = `data:${mime};base64,${base64Data}`;
      } else if (req.file.filename) {
        documentUrl = `/uploads/${req.file.filename}`;
      }
      log.documentUrl = documentUrl;
      log.attachmentUrl = documentUrl;
      log.documentName = req.file.originalname;
      log.documentSize = req.file.size;
      log.documentMimeType = req.file.mimetype || 'application/octet-stream';
      log.doctype = doctype;
      if (!log.taskTitle) log.taskTitle = req.file.originalname;
      if (!log.projectName) log.projectName = 'Daily Log';
      if (!log.description) log.description = 'Submitted via daily work document upload.';
    }

    log.isEdited = true;
    log.editedBy = req.user._id;
    log.editedAt = new Date();

    await log.save();

    const attUpdate = { dailyLogSubmitted: true };
    if (checkInTime) {
      const d = new Date(`${log.logDate}T${checkInTime}:00`);
      if (!isNaN(d.getTime())) attUpdate.checkInTime = d;
    }
    if (checkOutTime) {
      const d = new Date(`${log.logDate}T${checkOutTime}:00`);
      if (!isNaN(d.getTime())) attUpdate.checkOutTime = d;
    }
    if (hoursSpent) {
      const workMins = Math.round(parseFloat(hoursSpent) * 60);
      attUpdate.actualWorkMinutes = workMins;
      attUpdate.totalDurationMinutes = workMins;
      attUpdate.status = 'present';
    }

    await Attendance.updateOne(
      { userId: log.userId, date: log.logDate },
      { $set: attUpdate },
      { upsert: true }
    );

    return success(res, 'Daily log updated successfully', { log });
  } catch (error) {
    console.error('updateTeamMemberDailyLog error:', error);
    return badRequest(res, 'Failed to update log');
  }
};

const getDeviceRequests = async (req, res) => {
  try {
    const canManage = await checkManagerPermission(req.user._id, 'canManageDeviceRequests');
    if (!canManage) return forbidden(res, 'You do not have permission to manage device requests');

    const status = req.query.status || 'pending';
    const teams = await getManagedTeams(req.user);
    if (!teams || teams.length === 0) {
      return success(res, 'Fetched device requests', {
        requests: [],
        counts: { all: 0, pending: 0, approved: 0, rejected: 0 }
      });
    }

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    
    const baseQuery = { userId: { $in: memberIds } };
    const query = { ...baseQuery };
    if (status !== 'all') query.status = status;

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

    // Mark notifications for device requests as read for this manager
    await Notification.updateMany(
      { userId: req.user._id, isRead: false, type: { $in: ['device_request', 'new_device_request', 'device_request_submitted'] } },
      { $set: { isRead: true } }
    );

    return success(res, 'Fetched device requests', { requests, counts });
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
    if (!teams || teams.length === 0) {
      return success(res, 'Fetched location requests', {
        requests: [],
        counts: { all: 0, pending: 0, approved: 0, rejected: 0 }
      });
    }

    const memberIds = await getTeamMemberIds(teams.map(t => t._id));
    
    const baseQuery = { userId: { $in: memberIds } };
    const query = { ...baseQuery };
    if (status !== 'all') query.status = status;

    const [requests, counts] = await Promise.all([
      LocationRequest.find(query)
        .populate({
          path: 'userId',
          select: 'name email role designation teamId avatarUrl',
          populate: { path: 'teamId', select: 'name' },
        })
        .populate('requestedLocationId', 'officeName address')
        .sort({ createdAt: -1 })
        .lean(),
      (async () => {
        const [all, pending, approved, rejected] = await Promise.all([
          LocationRequest.countDocuments(baseQuery),
          LocationRequest.countDocuments({ ...baseQuery, status: 'pending' }),
          LocationRequest.countDocuments({ ...baseQuery, status: 'approved' }),
          LocationRequest.countDocuments({ ...baseQuery, status: 'rejected' }),
        ]);
        return { all, pending, approved, rejected };
      })(),
    ]);

    return success(res, 'Fetched location requests', { requests, counts });
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

/**
 * POST /manager/team/manual-attendance/:id/decision
 * Body: { action: 'approve' | 'reject', decisionNote?: string }
 */
const handleManualAttendanceDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, decisionNote } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return badRequest(res, 'Action must be "approve" or "reject"');
    }

    const request = await ManualAttendanceRequest.findById(id).populate('userId');
    if (!request) {
      return notFound(res, 'Manual attendance request not found');
    }

    if (request.status !== 'pending') {
      return badRequest(res, `Request has already been ${request.status}`);
    }

    // Permission check: ensure manager manages this employee's team (unless admin)
    if (req.user.role !== 'admin') {
      const teams = await getManagedTeams(req.user);
      const managedTeamIds = teams.map(t => t._id.toString());
      const userTeamId = request.userId?.teamId?.toString() || request.teamId?.toString();
      if (!userTeamId || !managedTeamIds.includes(userTeamId)) {
        return forbidden(res, 'You do not have permission to manage this employee');
      }
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    request.status = newStatus;
    request.decidedBy = req.user._id;
    request.decidedAt = new Date();
    request.decisionNote = decisionNote || null;
    await request.save();

    // Now update or create the Attendance record for this user & requestDate
    let attendance = await Attendance.findOne({ userId: request.userId._id, date: request.requestDate });

    if (action === 'approve') {
      const now = new Date();
      const todayStr = getTodayDateString();
      const isToday = request.requestDate === todayStr;

      if (!attendance) {
        attendance = new Attendance({
          userId: request.userId._id,
          date: request.requestDate,
        });
      }

      attendance.status = 'present';
      attendance.checkInMethod = 'manual';
      // Set check-in time: if already set keep it; if today, now; if past, standard shift start 09:30
      if (!attendance.checkInTime) {
        attendance.checkInTime = isToday ? now : new Date(`${request.requestDate}T09:30:00.000Z`);
      }
      await attendance.save();

      await writeAuditLog({
        performedBy: req.user._id,
        performedByRole: req.user.role,
        action: 'ATTENDANCE_MANUAL_APPROVED',
        targetCollection: 'ManualAttendanceRequest',
        targetId: request._id,
        targetUserId: request.userId._id,
        teamId: request.teamId,
        metadata: { requestDate: request.requestDate, decisionNote },
      });

      await createNotification({
        userId: request.userId._id,
        type: 'general',
        title: 'Manual Attendance Approved ✅',
        message: `Your manual attendance request for ${request.requestDate} has been approved.`,
        relatedId: request._id,
      });
    } else {
      // action === 'reject'
      if (attendance && attendance.status === 'manual_pending') {
        attendance.status = 'absent';
        await attendance.save();
      }

      await writeAuditLog({
        performedBy: req.user._id,
        performedByRole: req.user.role,
        action: 'ATTENDANCE_MANUAL_REJECTED',
        targetCollection: 'ManualAttendanceRequest',
        targetId: request._id,
        targetUserId: request.userId._id,
        teamId: request.teamId,
        metadata: { requestDate: request.requestDate, decisionNote },
      });

      await createNotification({
        userId: request.userId._id,
        type: 'general',
        title: 'Manual Attendance Rejected ❌',
        message: `Your manual attendance request for ${request.requestDate} was rejected.` + (decisionNote ? ` Reason: ${decisionNote}` : ''),
        relatedId: request._id,
      });
    }

    // Real-time socket updates
    if (request.teamId) {
      emitToTeam(request.teamId, 'attendance:update', {
        date: request.requestDate,
        userId: request.userId._id,
        status: action === 'approve' ? 'present' : 'absent',
      });
    }
    emitToUser(request.userId._id, 'notification:new', {
      title: `Manual Attendance ${action === 'approve' ? 'Approved ✅' : 'Rejected ❌'}`,
    });

    return success(res, `Manual attendance request ${action}d successfully`, {
      request,
      attendance,
    });
  } catch (error) {
    console.error('handleManualAttendanceDecision error:', error);
    return badRequest(res, 'Failed to process manual attendance decision');
  }
};

/**
 * Helper to verify that manager has authority over an employee.
 */
const verifyManagerMemberAuthority = async (managerUser, memberId) => {
  const member = await User.findById(memberId).select('teamId role name').lean();
  if (!member) {
    return { authorized: false, status: 404, message: 'Employee not found.' };
  }
  if (managerUser.role === 'admin') {
    return { authorized: true, member };
  }
  const teams = await getManagedTeams(managerUser);
  const teamIds = teams.map((t) => t._id.toString());
  if (!member.teamId || !teamIds.includes(member.teamId.toString())) {
    return { authorized: false, status: 403, message: 'You do not have permission to view this employee profile.' };
  }
  return { authorized: true, member };
};

/**
 * GET /manager/team/members/:id/profile
 * Returns 360° employee performance profile scoped to selected period.
 */
const getMemberProfile = async (req, res) => {
  try {
    const authCheck = await verifyManagerMemberAuthority(req.user, req.params.id);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }
    const profile = await employeeProfileService.getEmployeeProfile(req.params.id, req.query);
    if (!profile) {
      return notFound(res, 'Employee profile could not be loaded.');
    }
    return success(res, 'Employee profile fetched successfully', profile);
  } catch (err) {
    console.error('getMemberProfile error:', err);
    return badRequest(res, 'Failed to fetch employee profile');
  }
};

/**
 * GET /manager/team/members/:id/attendance
 * Returns paginated attendance records for member with optional date range.
 */
const getMemberAttendanceHistory = async (req, res) => {
  try {
    const authCheck = await verifyManagerMemberAuthority(req.user, req.params.id);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }
    const result = await employeeProfileService.getPaginatedAttendance(req.params.id, req.query);
    return success(res, 'Attendance history fetched successfully', result);
  } catch (err) {
    console.error('getMemberAttendanceHistory error:', err);
    return badRequest(res, 'Failed to fetch attendance history');
  }
};

/**
 * GET /manager/team/members/:id/daily-logs
 * Returns paginated daily work logs for member with optional date range.
 */
const getMemberDailyLogs = async (req, res) => {
  try {
    const authCheck = await verifyManagerMemberAuthority(req.user, req.params.id);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }
    const result = await employeeProfileService.getPaginatedDailyLogs(req.params.id, req.query);
    return success(res, 'Daily logs fetched successfully', result);
  } catch (err) {
    console.error('getMemberDailyLogs error:', err);
    return badRequest(res, 'Failed to fetch daily logs');
  }
};

/**
 * GET /manager/team/members/:id/overtime
 * Returns paginated overtime records for member with optional date range.
 */
const getMemberOvertimeHistory = async (req, res) => {
  try {
    const authCheck = await verifyManagerMemberAuthority(req.user, req.params.id);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }
    const result = await employeeProfileService.getPaginatedOvertime(req.params.id, req.query);
    return success(res, 'Overtime history fetched successfully', result);
  } catch (err) {
    console.error('getMemberOvertimeHistory error:', err);
    return badRequest(res, 'Failed to fetch overtime history');
  }
};

const deleteTeamMember = async (req, res) => {
  try {
    const memberId = req.params.id;
    const authCheck = await verifyManagerMemberAuthority(req.user, memberId);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, message: authCheck.message });
    }

    const user = await User.findById(memberId);
    if (!user) {
      return badRequest(res, 'Member not found');
    }

    user.isActive = false;
    user.deletedAt = new Date();
    await user.save();

    await writeAuditLog({
      action: 'DELETE_TEAM_MEMBER',
      performedBy: req.user._id,
      targetUser: memberId,
      details: `Team member ${user.name} (${user.email}) was archived by manager.`,
    });

    return success(res, 'Team member archived successfully');
  } catch (error) {
    console.error('Error deleting team member:', error);
    return badRequest(res, 'Failed to archive team member');
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
  handleManualAttendanceDecision,
  getUnreadNotificationCount,
  createTeamMember,
  deleteTeamMember,
  submitTeamMemberDailyLog,
  updateTeamMemberDailyLog,
  getManagedTeams,
  getManagedTeam,
  getTeamMemberIds,
  getMemberProfile,
  getMemberAttendanceHistory,
  getMemberDailyLogs,
  getMemberOvertimeHistory,
};
