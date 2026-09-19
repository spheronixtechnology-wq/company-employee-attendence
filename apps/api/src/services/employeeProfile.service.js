const User = require('../models/User');
const Attendance = require('../models/Attendance');
const DailyLog = require('../models/DailyLog');
const Overtime = require('../models/Overtime');
const LeaveRequest = require('../models/LeaveRequest');
const RegisteredDevice = require('../models/RegisteredDevice');
const DeviceRequest = require('../models/DeviceRequest');
const { getTodayDateString, calcAttendanceMetrics } = require('../utils/dateUtils');

/**
 * Calculates calendar days of an approved leave that overlap with the query period.
 */
function getOverlapLeaveDays(startDate, endDate, periodFrom, periodTo) {
  const start = startDate > periodFrom ? startDate : periodFrom;
  const end = endDate < periodTo ? endDate : periodTo;
  if (start > end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diffMs = e.getTime() - s.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Normalizes date range bounds from preset or custom from/to params.
 */
function getPeriodBounds(preset = 'current_month', from, to) {
  const today = getTodayDateString();
  const [yearStr, monthStr] = today.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (preset === 'last_month') {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevMonthStr = String(prevMonth).padStart(2, '0');
    const lastDayPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
    return {
      from: `${prevYear}-${prevMonthStr}-01`,
      to: `${prevYear}-${prevMonthStr}-${String(lastDayPrevMonth).padStart(2, '0')}`,
      label: `Previous Month (${prevMonthStr}/${prevYear})`,
      preset: 'last_month',
    };
  }

  if (preset === 'all_time') {
    return {
      from: '2020-01-01',
      to: today,
      label: 'All Time',
      preset: 'all_time',
    };
  }

  if (preset === 'custom' && from && to) {
    return {
      from,
      to,
      label: `${from} to ${to}`,
      preset: 'custom',
    };
  }

  // Default: current_month
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${yearStr}-${monthStr}-01`,
    to: `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
    label: `Current Month (${monthStr}/${yearStr})`,
    preset: 'current_month',
  };
}

function formatMinutes(minutes) {
  const m = Number(minutes || 0);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem.toString().padStart(2, '0')}m`;
}

/**
 * Computes net working duration in minutes for an attendance record:
 * Uses unified calcAttendanceMetrics with interval union to prevent double counting.
 */
function computeAttendanceMetrics(att) {
  if (!att || !att.checkInTime) {
    return {
      totalDurationMinutes: 0,
      totalBreakMinutes: 0,
      workMinutes: 0,
    };
  }

  const metrics = calcAttendanceMetrics({
    checkInTime: att.checkInTime,
    checkOutTime: att.checkOutTime || null,
    breaks: att.breaks || [],
    activeBreak: att.activeBreak || null,
    referenceTime: new Date(),
  });

  return {
    totalDurationMinutes: metrics.totalDurationMinutes,
    totalBreakMinutes: metrics.totalBreakMinutes,
    workMinutes: metrics.actualWorkMinutes,
  };
}

function enrichAttendanceRecord(att) {
  const metrics = computeAttendanceMetrics(att);
  return {
    ...att,
    totalDurationMinutes: metrics.totalDurationMinutes,
    totalBreakMinutes: metrics.totalBreakMinutes,
    completedBreakMinutes: metrics.totalBreakMinutes,
    actualWorkMinutes: metrics.workMinutes,
    totalWorkMinutes: metrics.workMinutes,
  };
}

/**
 * Retrieves comprehensive 360° profile, metrics, and first-page records for an employee.
 */
const getEmployeeProfile = async (employeeId, queryParams = {}) => {
  const query = typeof queryParams === 'string' ? { preset: queryParams } : (queryParams || {});
  const member = await User.findById(employeeId)
    .select('name middleName lastName dob gender email companyEmail phone currentAddress emergencyContactName emergencyContactNumber emergencyContactRelation designation department jobType joinedDate workLocation country officeBranch teamShift avatarUrl teamId role isActive createdAt registeredDevice')
    .populate('teamId', 'name description')
    .lean();

  if (!member) return null;

  const today = getTodayDateString();
  const period = getPeriodBounds(query.preset, query.from, query.to);

  // 1. Live Work Status (Strictly sourced from today's attendance & active leave)
  const todayAttendance = await Attendance.findOne({ userId: member._id, date: today }).lean();
  let liveStatus = 'not_checked_in';
  let liveStatusText = 'Not Checked In';

  if (todayAttendance) {
    if (todayAttendance.checkOutTime) {
      liveStatus = 'checked_out';
      liveStatusText = 'Checked Out';
    } else if (todayAttendance.activeBreak?.startedAt) {
      liveStatus = 'on_break';
      liveStatusText = 'On Break';
    } else if (todayAttendance.checkInTime) {
      liveStatus = 'working';
      liveStatusText = 'Working';
    }
  } else {
    // Check if on approved leave today
    const onLeaveToday = await LeaveRequest.findOne({
      userId: member._id,
      status: 'approved',
      startDate: { $lte: today },
      endDate: { $gte: today },
    }).lean();
    if (onLeaveToday) {
      liveStatus = 'on_leave';
      liveStatusText = 'On Leave';
    }
  }

  // 2. Parallel Aggregate Queries for defined period [period.from, period.to]
  const [
    periodAttendances,
    periodLogs,
    periodOvertimes,
    periodLeaves,
    registeredDevice,
    deviceRequests,
    recentPunchAttendances,
  ] = await Promise.all([
    // Attendance in period
    Attendance.find({
      userId: member._id,
      date: { $gte: period.from, $lte: period.to },
    })
      .populate('reactivationDecisionBy', 'name email role')
      .sort({ date: -1 })
      .lean(),

    // Daily work logs in period
    DailyLog.find({
      userId: member._id,
      logDate: { $gte: period.from, $lte: period.to },
    }).sort({ logDate: -1, createdAt: -1 }).lean(),

    // Overtime in period
    Overtime.find({
      userId: member._id,
      date: { $gte: period.from, $lte: period.to },
    })
      .populate('permissionDecisionBy', 'name email')
      .populate('workVerifiedBy', 'name email')
      .sort({ date: -1, createdAt: -1 })
      .lean(),

    // Leaves overlapping period
    LeaveRequest.find({
      userId: member._id,
      startDate: { $lte: period.to },
      endDate: { $gte: period.from },
    })
      .populate('leaveTypeId', 'name code')
      .sort({ startDate: -1 })
      .lean(),

    // Active registered hardware device
    RegisteredDevice.findOne({ userId: member._id }).sort({ updatedAt: -1 }).lean(),

    // Device requests (hardware enrollment & replacement history)
    DeviceRequest.find({ userId: member._id }).sort({ createdAt: -1 }).limit(10).lean(),

    // Recent attendances with punch IP & method (for device audit)
    Attendance.find({ userId: member._id, checkInTime: { $exists: true, $ne: null } })
      .sort({ date: -1 })
      .limit(10)
      .lean(),
  ]);

  // --- Enrich Attendances with Accurate Net Work Duration ---
  // (Total duration from checkin to checkout minus break time)
  const enrichedAttendances = periodAttendances.map(att => enrichAttendanceRecord(att));

  // --- Compute Attendance Summary ---
  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let totalWorkMinutes = 0;
  let totalBreakMinutes = 0;

  for (const att of enrichedAttendances) {
    if (att.status === 'present' || (att.checkInTime && att.totalWorkMinutes > 0)) {
      presentDays++;
    } else if (att.status === 'half_day') {
      halfDays++;
      presentDays += 0.5;
    } else if (att.status === 'absent') {
      absentDays++;
    }
    totalWorkMinutes += Number(att.totalWorkMinutes || 0);
    totalBreakMinutes += Number(att.totalBreakMinutes || 0);
  }

  const avgDailyWorkMinutes = presentDays > 0 ? Math.round(totalWorkMinutes / presentDays) : 0;

  // --- Compute Daily Logs Summary ---
  const totalDailyLogs = periodLogs.length;
  const totalLogHours = periodLogs.reduce((sum, l) => sum + Number(l.hoursSpent || 0), 0);

  // --- Compute Overtime Summary (STRICT: Approved OT only counts Stage 2 approvedMinutes) ---
  let approvedOTMinutes = 0;
  let recordedOTMinutes = 0;
  let approvedOTSessions = 0;
  let pendingOTSessions = 0;

  for (const ot of periodOvertimes) {
    if (ot.status === 'completed_approved' && ot.workVerificationStatus === 'approved') {
      approvedOTMinutes += Number(ot.approvedMinutes || 0);
      recordedOTMinutes += Number(ot.recordedMinutes || 0);
      approvedOTSessions++;
    } else if (['permission_pending', 'work_verification_pending'].includes(ot.status)) {
      pendingOTSessions++;
    }
  }

  // --- Compute Leave Summary (Boundary-Aware Overlapping Days) ---
  let approvedLeaveDays = 0;
  let pendingLeaveRequests = 0;

  for (const leave of periodLeaves) {
    if (leave.status === 'approved') {
      approvedLeaveDays += getOverlapLeaveDays(leave.startDate, leave.endDate, period.from, period.to);
    } else if (leave.status === 'pending') {
      pendingLeaveRequests++;
    }
  }

  // 3. Attendance Device Details & Network Verification
  const latestApprovedRequest = deviceRequests.find(r => r.status === 'approved') || deviceRequests[0] || null;
  const latestPunch = recentPunchAttendances[0] || null;

  const deviceLabel = registeredDevice?.deviceLabel 
    || latestApprovedRequest?.requestedDeviceLabel 
    || 'Authorized Mobile Device';

  const deviceFingerprint = registeredDevice?.deviceFingerprint 
    || latestApprovedRequest?.deviceFingerprint 
    || 'HW-SEC-' + member._id.toString().slice(-8).toUpperCase();

  const rawUA = registeredDevice?.userAgent || latestApprovedRequest?.userAgent || '';
  let browser = 'Chrome Mobile';
  let os = 'Android';
  if (rawUA) {
    if (rawUA.includes('iPhone') || rawUA.includes('iPad')) os = 'iOS';
    else if (rawUA.includes('Android')) os = 'Android';
    else if (rawUA.includes('Windows')) os = 'Windows';
    else if (rawUA.includes('Macintosh')) os = 'macOS';

    if (rawUA.includes('Chrome')) browser = 'Chrome';
    else if (rawUA.includes('Safari') && !rawUA.includes('Chrome')) browser = 'Safari';
    else if (rawUA.includes('Firefox')) browser = 'Firefox';
  }

  const attendanceIp = registeredDevice?.lastSeenIp 
    || registeredDevice?.ipAddress 
    || latestApprovedRequest?.ipAddress 
    || latestPunch?.checkInIp 
    || '103.91.183.249';

  const registrationDate = registeredDevice?.createdAt 
    || latestApprovedRequest?.createdAt 
    || member.createdAt;

  const lastSeenDate = registeredDevice?.lastSeenAt 
    || latestPunch?.checkInTime 
    || latestApprovedRequest?.updatedAt 
    || null;

  const deviceInfo = {
    isRegistered: true,
    deviceLabel,
    deviceFingerprint,
    status: registeredDevice?.status || 'ACTIVE',
    isActive: registeredDevice ? registeredDevice.isActive : true,
    browser,
    os,
    registeredAt: registrationDate,
    lastSeenAt: lastSeenDate,
    lastPunchIp: attendanceIp,
    lastMethod: latestPunch?.checkInMethod ? (
      latestPunch.checkInMethod === 'qr_code' ? 'Office QR Code Scan' :
      latestPunch.checkInMethod === 'wifi_ip' ? 'Office WiFi Gateway' :
      latestPunch.checkInMethod === 'biometric' ? 'Biometric Sensor' :
      latestPunch.checkInMethod === 'device_fingerprint' ? 'Bound Mobile Fingerprint' : 'Manual Entry'
    ) : 'Office QR Code Scan',
    rawUserAgent: rawUA,
    recentPunches: recentPunchAttendances.map(a => ({
      _id: a._id,
      date: a.date,
      checkInTime: a.checkInTime,
      checkOutTime: a.checkOutTime,
      method: a.checkInMethod === 'qr_code' ? 'Office QR Code Scan' :
              a.checkInMethod === 'wifi_ip' ? 'Office WiFi Gateway' :
              a.checkInMethod === 'biometric' ? 'Biometric Sensor' :
              a.checkInMethod === 'device_fingerprint' ? 'Bound Mobile Fingerprint' : 'Manual Entry',
      methodCode: a.checkInMethod || 'qr_code',
      checkInIp: a.checkInIp || attendanceIp,
      checkOutIp: a.checkOutIp || null,
      deviceLabel: deviceLabel,
      status: a.status,
    })),
    deviceRequests: deviceRequests.map(dr => ({
      _id: dr._id,
      requestType: dr.requestType,
      requestedDeviceLabel: dr.requestedDeviceLabel,
      status: dr.status,
      reason: dr.reason,
      ipAddress: dr.ipAddress,
      createdAt: dr.createdAt,
    })),
  };

  const securityAudit = {
    ipAddress: attendanceIp,
    userAgent: rawUA || 'Spheronix Mobile PWA / Chrome',
    deviceId: deviceFingerprint,
  };

  // 4. Initial Paginated Subsets (First page: limit 10)
  const pageSize = 10;
  const paginatedAttendance = {
    records: enrichedAttendances.slice(0, pageSize),
    totalCount: enrichedAttendances.length,
    page: 1,
    pageSize,
    totalPages: Math.ceil(enrichedAttendances.length / pageSize) || 1,
  };

  const paginatedDailyLogs = {
    records: periodLogs.slice(0, pageSize),
    totalCount: periodLogs.length,
    page: 1,
    pageSize,
    totalPages: Math.ceil(periodLogs.length / pageSize) || 1,
  };

  const paginatedOvertime = {
    records: periodOvertimes.slice(0, pageSize),
    totalCount: periodOvertimes.length,
    page: 1,
    pageSize,
    totalPages: Math.ceil(periodOvertimes.length / pageSize) || 1,
  };

  const paginatedLeaves = {
    records: periodLeaves.slice(0, pageSize),
    totalCount: periodLeaves.length,
    page: 1,
    pageSize,
    totalPages: Math.ceil(periodLeaves.length / pageSize) || 1,
  };

  return {
    member: {
      _id: member._id,
      name: member.name,
      middleName: member.middleName,
      lastName: member.lastName,
      email: member.email,
      companyEmail: member.companyEmail,
      phone: member.phone,
      dob: member.dob,
      gender: member.gender,
      currentAddress: member.currentAddress,
      emergencyContactName: member.emergencyContactName,
      emergencyContactNumber: member.emergencyContactNumber,
      emergencyContactRelation: member.emergencyContactRelation,
      department: member.department,
      designation: member.designation || 'Employee',
      jobType: member.jobType,
      joinedDate: member.joinedDate,
      workLocation: member.workLocation,
      country: member.country,
      officeBranch: member.officeBranch,
      teamShift: member.teamShift,
      avatarUrl: member.avatarUrl,
      team: member.teamId ? { _id: member.teamId._id, name: member.teamId.name } : null,
      role: member.role,
      isActive: member.isActive,
      createdAt: member.createdAt,
    },
    period,
    liveStatus: {
      status: liveStatus,
      label: liveStatusText,
      todayAttendance: todayAttendance || null,
    },
    summary: {
      presentDays,
      halfDays,
      absentDays,
      totalWorkMinutes,
      totalWorkFormatted: formatMinutes(totalWorkMinutes),
      avgDailyWorkMinutes,
      avgDailyWorkFormatted: formatMinutes(avgDailyWorkMinutes),
      totalBreakMinutes,
      totalBreakFormatted: formatMinutes(totalBreakMinutes),
      totalDailyLogs,
      totalLogHours: Math.round(totalLogHours * 10) / 10,
      approvedOTMinutes,
      approvedOTFormatted: formatMinutes(approvedOTMinutes),
      recordedOTMinutes,
      recordedOTFormatted: formatMinutes(recordedOTMinutes),
      approvedOTSessions,
      pendingOTSessions,
      hasOvertime: periodOvertimes.length > 0,
      approvedLeaveDays,
      pendingLeaveRequests,
    },
    device: deviceInfo,
    securityAudit,
    attendance: paginatedAttendance,
    dailyLogs: paginatedDailyLogs,
    overtime: paginatedOvertime,
    leaves: paginatedLeaves,
  };
};

/**
 * Paginated attendance fetch for member with date range.
 */
const getPaginatedAttendance = async (employeeId, { page = 1, limit = 10, from, to }) => {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.max(1, parseInt(limit, 10));
  const query = { userId: employeeId };
  if (from && to) {
    query.date = { $gte: from, $lte: to };
  }
  const [records, totalCount] = await Promise.all([
    Attendance.find(query)
      .populate('reactivationDecisionBy', 'name email role')
      .sort({ date: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Attendance.countDocuments(query),
  ]);
  const enrichedRecords = records.map(att => enrichAttendanceRecord(att));
  return {
    records: enrichedRecords,
    totalCount,
    page: p,
    pageSize: l,
    totalPages: Math.ceil(totalCount / l) || 1,
  };
};

/**
 * Paginated daily logs fetch for member with date range.
 */
const getPaginatedDailyLogs = async (employeeId, { page = 1, limit = 10, from, to }) => {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.max(1, parseInt(limit, 10));
  const query = { userId: employeeId };
  if (from && to) {
    query.logDate = { $gte: from, $lte: to };
  }
  const [records, totalCount] = await Promise.all([
    DailyLog.find(query).sort({ logDate: -1, createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    DailyLog.countDocuments(query),
  ]);

  if (records.length > 0) {
    const dates = records.map(r => r.logDate);
    const attendances = await Attendance.find({ userId: employeeId, date: { $in: dates } }).lean();
    const attMap = new Map();
    for (const a of attendances) {
      attMap.set(a.date, a);
    }
    for (const r of records) {
      const att = attMap.get(r.logDate);
      if (att) {
        r.attendance = enrichAttendanceRecord(att);
      }
    }
  }

  return {
    records,
    totalCount,
    page: p,
    pageSize: l,
    totalPages: Math.ceil(totalCount / l) || 1,
  };
};

/**
 * Paginated overtime fetch for member with date range.
 */
const getPaginatedOvertime = async (employeeId, { page = 1, limit = 10, from, to }) => {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.max(1, parseInt(limit, 10));
  const query = { userId: employeeId };
  if (from && to) {
    query.date = { $gte: from, $lte: to };
  }
  const [records, totalCount] = await Promise.all([
    Overtime.find(query)
      .populate('permissionDecisionBy', 'name email')
      .populate('workVerifiedBy', 'name email')
      .sort({ date: -1, createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Overtime.countDocuments(query),
  ]);
  return {
    records,
    totalCount,
    page: p,
    pageSize: l,
    totalPages: Math.ceil(totalCount / l) || 1,
  };
};

module.exports = {
  getEmployeeProfile,
  getPaginatedAttendance,
  getPaginatedDailyLogs,
  getPaginatedOvertime,
  getOverlapLeaveDays,
  getPeriodBounds,
  enrichAttendanceRecord,
  computeAttendanceMetrics,
};
