const Attendance = require('../models/Attendance');
const DailyLog = require('../models/DailyLog');
const LeaveRequest = require('../models/LeaveRequest');
const Notification = require('../models/Notification');
const LeaveBalance = require('../models/LeaveBalance');
const LeaveType = require('../models/LeaveType');
const AttendanceMethodSetting = require('../models/AttendanceMethodSetting');
const RegisteredDevice = require('../models/RegisteredDevice');
const GeofenceSetting = require('../models/GeofenceSetting');
const DeviceRequest = require('../models/DeviceRequest');
const ManualAttendanceRequest = require('../models/ManualAttendanceRequest');
const User = require('../models/User');
const OfficeLocation = require('../models/OfficeLocation');

const { success, badRequest } = require('../utils/response');
const { getTodayDateString, getCurrentYear, calcNetWorkMinutes, calcAttendanceStatus, finalizeAttendanceCheckout } = require('../utils/dateUtils');
const { isWithinGeofence } = require('../utils/haversine');
const dailyLogService = require('../services/dailyLog.service');
const leaveService = require('../services/leave.service');
const authService = require('../services/auth.service');
const { createNotification } = require('../services/notification.service');
const { enrichAttendanceRecord } = require('../services/employeeProfile.service');
const { UAParser } = require('ua-parser-js');
const { getClientIp, isIpInAllowedList, maskIp } = require('../utils/ipUtils');
const { buildDeviceLabel, formatDeviceLabel } = require('../utils/deviceUtils');
const { emitToTeam, emitToManagers, emitToAdmins, emitToUser } = require('../socket');
const crypto = require('crypto');
const webauthnService = require('../services/webauthn.service');
const { getActiveOfficeQr, verifyOfficeQrPayload } = require('../utils/qrUtils');

// In-memory active checkout sessions: Map<userIdStr, { token: string, expiresAt: number }>
const activeCheckoutSessions = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Notifies ALL active managers (plus admins as fallback if there are no
 * managers) that a request needs attention. Any manager can then act on it.
 * Silent on failure — approval flow must not break because of a notification.
 */
const notifyRequestSubmitted = async ({ type, title, message, relatedId }) => {
  try {
    const recipients = await User.find(
      { role: { $in: ['manager', 'admin'] }, isActive: true },
      '_id role'
    ).lean();

    const recipientIds = recipients.map((r) => r._id);

    for (const recipientId of recipientIds) {
      await createNotification({ userId: recipientId, type, title, message, relatedId });
    }
  } catch (err) {
    console.error('[notifyRequestSubmitted] Failed:', err.message);
  }
};

/**
 * Throttles alert notifications to managers when an unapproved device attempt occurs.
 * Limits alerts to at most 1 notification per employee per 60 minutes.
 */
const throttleUnregisteredDeviceAlert = async ({ employee, deviceLabel, ipAddress }) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAlert = await Notification.findOne({
      type: 'device_unregistered_attempt',
      relatedId: employee._id,
      createdAt: { $gte: oneHourAgo },
    });

    if (recentAlert) {
      console.log(`[Alert Throttled] Skipping unregistered device alert for ${employee.name} (already alerted within 60m)`);
      return;
    }

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    await notifyRequestSubmitted({
      type: 'device_unregistered_attempt',
      title: 'Unregistered Device Attempt',
      message: `${employee.name} tried to mark attendance from an unregistered device (${deviceLabel}, IP: ${ipAddress}, Time: ${timeStr}).`,
      relatedId: employee._id,
    });
  } catch (err) {
    console.error('[throttleUnregisteredDeviceAlert] Failed:', err.message);
  }
};

/**
 * Extracts device status for a given userId.
 * Shared by getDashboard and getDeviceStatus.
 */
const computeDeviceStatus = async (userId) => {
  const registeredDevice = await RegisteredDevice.findOne({ userId, isActive: true, status: 'ACTIVE' });
  const pendingRequest = await DeviceRequest.findOne({ userId, status: 'pending' });

  let deviceStatus = { statusType: 'none', statusLabel: 'No Device' };

  if (pendingRequest) {
    const pendObj = pendingRequest.toObject ? pendingRequest.toObject() : { ...pendingRequest };
    if (pendObj.requestedDeviceLabel) {
      pendObj.requestedDeviceLabel = formatDeviceLabel(pendObj.requestedDeviceLabel);
    }
    deviceStatus = { statusType: 'pending', statusLabel: 'Approval Pending', device: { status: 'PENDING' } };
    return { deviceStatus, pendingRequest: pendObj };
  } else if (registeredDevice) {
    const devObj = registeredDevice.toObject ? registeredDevice.toObject() : { ...registeredDevice };
    if (devObj.deviceLabel) {
      devObj.deviceLabel = formatDeviceLabel(devObj.deviceLabel);
    }
    if (registeredDevice.temporaryUntil && new Date() > new Date(registeredDevice.temporaryUntil)) {
      deviceStatus = { statusType: 'none', statusLabel: 'Temporary Access Expired', device: devObj };
    } else {
      deviceStatus = {
        statusType: registeredDevice.temporaryUntil ? 'temporary' : 'active',
        statusLabel: registeredDevice.temporaryUntil ? 'Temporary Access' : 'Active Device',
        device: devObj
      };
    }
    return { deviceStatus, pendingRequest: null };
  }

  return { deviceStatus, pendingRequest };
};

const getStatus = async (req, res) => {
  res.status(200).json({ success: true, message: 'Employee controller is running' });
};

const getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayDateString();
    
    const attendanceRecord = await Attendance.findOne({ userId, date: today });
    
    // Compute work minutes and duration metrics
    let totalWorkMinutes = 0;
    let totalDurationMinutes = 0;
    let totalBreakMinutes = 0;

    if (attendanceRecord && attendanceRecord.checkInTime) {
      if (attendanceRecord.checkOutTime) {
        totalBreakMinutes = attendanceRecord.totalBreakMinutes ?? (attendanceRecord.completedBreakMinutes || 0);
        totalDurationMinutes = attendanceRecord.totalDurationMinutes ?? Math.max(0, Math.floor((new Date(attendanceRecord.checkOutTime) - new Date(attendanceRecord.checkInTime)) / 60000));
        totalWorkMinutes = attendanceRecord.actualWorkMinutes ?? Math.max(0, totalDurationMinutes - totalBreakMinutes);
      } else {
        // Still checked in: live duration and completed breaks
        totalBreakMinutes = attendanceRecord.completedBreakMinutes || 0;
        totalDurationMinutes = Math.max(0, Math.floor((new Date() - new Date(attendanceRecord.checkInTime)) / 60000));
        totalWorkMinutes = Math.max(0, totalDurationMinutes - totalBreakMinutes);
      }
    }
    
    const formattedAttendance = attendanceRecord ? {
      ...attendanceRecord.toObject(),
      totalWorkMinutes,
      totalDurationMinutes,
      totalBreakMinutes,
      actualWorkMinutes: totalWorkMinutes,
      checkInMethod: attendanceRecord.checkInMethod || 'qr_code',
    } : null;

    const dailyLogCount = await DailyLog.countDocuments({ userId, logDate: today });
    const dailyLogSubmitted = dailyLogCount > 0;

    const pendingLeaves = await LeaveRequest.countDocuments({ userId, status: 'pending' });
    const unreadNotifications = await Notification.countDocuments({ userId, isRead: false });

    let leaveBalances = await LeaveBalance.find({ userId, year: getCurrentYear() }).populate('leaveTypeId');
    if (!leaveBalances || leaveBalances.length === 0) {
      await leaveService.initializeLeaveBalances(userId);
      leaveBalances = await LeaveBalance.find({ userId, year: getCurrentYear() }).populate('leaveTypeId');
    }

    const activeMethodSetting = await AttendanceMethodSetting.findOne().sort({ changedAt: -1 });
    const activeMethod = activeMethodSetting ? activeMethodSetting.activeMethod : 'qr_code';

    const { deviceStatus, pendingRequest } = await computeDeviceStatus(userId);

    // Calculate active break and completed break minutes
    let activeBreak = null;
    let completedBreakMinutes = 0;
    if (attendanceRecord) {
      completedBreakMinutes = attendanceRecord.totalBreakMinutes ?? (attendanceRecord.completedBreakMinutes || 0);
      if (attendanceRecord.breaks && attendanceRecord.breaks.length > 0 && !attendanceRecord.checkOutTime) {
        const lastBreak = attendanceRecord.breaks[attendanceRecord.breaks.length - 1];
        if (!lastBreak.endedAt) {
          activeBreak = lastBreak;
        }
      }
    }

    return success(res, 'Dashboard data fetched', {
      attendance: {
        attendance: formattedAttendance,
        activeBreak,
        completedBreakMinutes,
        breaks: attendanceRecord?.breaks || []
      },
      teamName: req.user.teamId?.name || null,
      dailyLogSubmitted,
      activeMethod,
      deviceStatus,
      pendingLeaves,
      unreadNotifications,
      leaveBalances
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return badRequest(res, 'Failed to load dashboard data');
  }
};

const checkIn = async (req, res) => {
  try {
    const { lat, lng, accuracy, qrCodeValue } = req.body;
    const userId = req.user._id;
    const today = getTodayDateString();

    const existingAttendance = await Attendance.findOne({ userId, date: today });
    if (existingAttendance && existingAttendance.checkInTime) {
      return badRequest(res, 'Attendance already marked for today.');
    }

    // Strict Geofencing Validation
    if (lat === undefined || lat === null || lng === undefined || lng === null || isNaN(Number(lat)) || isNaN(Number(lng))) {
      return badRequest(res, 'Location Access Required — please allow location access to verify your work location.');
    }
    
    const activeOffices = await OfficeLocation.find({ status: 'active' });
    let passedGeofence = false;
    let minDistance = Infinity;

    if (activeOffices.length > 0) {
      for (const office of activeOffices) {
        const geoCheck = isWithinGeofence(lat, lng, office.latitude, office.longitude, office.radiusMeters);
        if (geoCheck.inside) {
          passedGeofence = true;
          break;
        }
        if (geoCheck.distanceMeters < minDistance) {
          minDistance = geoCheck.distanceMeters;
        }
      }
      
      if (!passedGeofence) {
        return badRequest(res, `Outside Office Location — nearest office is ${minDistance}m away.`);
      }
    } else {
      // Fallback to legacy GeofenceSetting
      const geofence = await GeofenceSetting.findOne({ isActive: true });
      if (geofence) {
        const geoCheck = isWithinGeofence(lat, lng, geofence.latitude, geofence.longitude, geofence.radiusMeters);
        if (!geoCheck.inside) {
          return badRequest(res, 'Outside Office Location — you must be within the authorized office to mark attendance.');
        }
      }
    }

    // Strict Device Verification
    let registeredDevice = await RegisteredDevice.findOne({ userId, isActive: true, status: 'ACTIVE' });
    if (!registeredDevice) {
      if (req.user.role === 'manager') {
        const clientIp = getClientIp(req);
        const rawUA = req.headers['user-agent'] || '';
        const currentDeviceLabel = buildDeviceLabel(rawUA);
        const currentFingerprint = req.body.deviceFingerprint || req.headers['x-device-fingerprint'] || crypto.randomBytes(16).toString('hex');
        registeredDevice = await RegisteredDevice.create({
          userId,
          deviceFingerprint: currentFingerprint,
          deviceLabel: currentDeviceLabel,
          status: 'ACTIVE',
          isActive: true,
          ipAddress: clientIp,
          lastSeenIp: clientIp,
          userAgent: rawUA,
          lastSeenAt: new Date(),
        });
        console.log(`[Device Enrollment] Auto-registered active device for manager ${req.user.name} (${currentDeviceLabel})`);
      } else {
        return badRequest(res, 'Use Your Registered Mobile — this device is not authorized for attendance.');
      }
    }
    if (registeredDevice.temporaryUntil && new Date() > new Date(registeredDevice.temporaryUntil)) {
      return badRequest(res, 'Use Your Registered Mobile — temporary access has expired.');
    }

    const currentFingerprint = req.body.deviceFingerprint || req.headers['x-device-fingerprint'] || null;
    const clientIp = getClientIp(req);
    const rawUA = req.headers['user-agent'] || '';
    const currentDeviceLabel = buildDeviceLabel(rawUA);

    // Rollout: Self-enroll existing active devices that do not yet have a fingerprint stored
    if (!registeredDevice.deviceFingerprint) {
      if (currentFingerprint) {
        registeredDevice.deviceFingerprint = currentFingerprint;
        registeredDevice.ipAddress = registeredDevice.ipAddress || clientIp;
        registeredDevice.userAgent = registeredDevice.userAgent || rawUA;
        registeredDevice.lastSeenIp = clientIp;
        registeredDevice.lastSeenAt = new Date();
        await registeredDevice.save();
        console.log(`[Device Enrollment] Silently enrolled device for ${req.user.name} (${currentDeviceLabel})`);
      }
    } else {
      // Device has an enrolled fingerprint — enforce hard lock for employees
      if (!currentFingerprint || currentFingerprint !== registeredDevice.deviceFingerprint) {
        if (req.user.role === 'manager') {
          // Managers punch from desktop/browser portal — sync device info
          if (currentFingerprint) {
            registeredDevice.deviceFingerprint = currentFingerprint;
          }
          registeredDevice.lastSeenIp = clientIp;
          registeredDevice.lastSeenAt = new Date();
          await registeredDevice.save();
        } else {
          // Trigger throttled manager alert (at most 1 per 60 mins)
          await throttleUnregisteredDeviceAlert({
            employee: req.user,
            deviceLabel: currentDeviceLabel,
            ipAddress: clientIp,
          });

          return badRequest(
            res,
            'Use Your Registered Mobile — this device is not authorized for attendance. If you cleared your browser data or switched devices, please request a device replacement from the Device Status page.'
          );
        }
      }

      // Fingerprint matches! Silently update IP and last seen timestamp
      if (registeredDevice.lastSeenIp !== clientIp) {
        registeredDevice.lastSeenIp = clientIp;
      }
      registeredDevice.lastSeenAt = new Date();
      await registeredDevice.save();
    }

    const activeMethodSetting = await AttendanceMethodSetting.findOne().sort({ changedAt: -1 });
    const activeMethod = activeMethodSetting ? activeMethodSetting.activeMethod : 'qr_code';
    
    // ============================================================================
    // METHOD-SPECIFIC AUTHENTICATION GATES
    // Strict Isolation: WiFi / IP network verification occurs ONLY in 'wifi_ip'.
    // QR Code, Biometric, and Device Fingerprint methods NEVER check IP addresses.
    // ============================================================================
    switch (activeMethod) {
      case 'wifi_ip': {
        // ONLY the wifi_ip method inspects the employee's network IP address
        if (accuracy !== undefined && accuracy !== null && !isNaN(Number(accuracy))) {
          if (Number(accuracy) > 300) {
            return badRequest(res, `GPS accuracy is too low (${Math.round(accuracy)}m). Please enable high-accuracy location and try again.`);
          }
        }

        // 1. Identify which active office matches client's public egress IP
        const matchingOffices = activeOffices.filter((office) =>
          isIpInAllowedList(clientIp, office.allowedIps)
        );

        if (matchingOffices.length === 0) {
          const officeWithSsid = activeOffices.find((o) => o.wifiSsid);
          const targetSsid = officeWithSsid ? officeWithSsid.wifiSsid : 'Office WiFi';
          return badRequest(
            res,
            `Unauthorized Network — You must be connected to the authorized office network (${targetSsid}). Detected IP: ${maskIp(clientIp)}.`
          );
        }

        // 2. Strict Paired Geofence Check: Verify device GPS against THAT SAME matching office
        let pairedGeofencePassed = false;
        let nearestDistance = Infinity;
        let targetOfficeName = matchingOffices[0].officeName;

        for (const office of matchingOffices) {
          const geoCheck = isWithinGeofence(lat, lng, office.latitude, office.longitude, office.radiusMeters);
          if (geoCheck.inside) {
            pairedGeofencePassed = true;
            targetOfficeName = office.officeName;
            break;
          }
          if (geoCheck.distanceMeters < nearestDistance) {
            nearestDistance = geoCheck.distanceMeters;
            targetOfficeName = office.officeName;
          }
        }

        if (!pairedGeofencePassed) {
          return badRequest(
            res,
            `Outside Office Location — You are connected to ${targetOfficeName}'s network, but you are outside its physical perimeter (${nearestDistance}m away).`
          );
        }
        break;
      }

      case 'qr_code': {
        // STRICT ISOLATION: Zero IP check. Authoritatively validates HMAC-signed office QR code.
        if (!qrCodeValue) {
          return badRequest(res, 'Invalid QR Code — please scan today\'s office QR code.');
        }
        const verification = verifyOfficeQrPayload(qrCodeValue);
        if (!verification.valid) {
          return badRequest(res, verification.reason || 'Invalid or expired Office QR code. Please scan the current code on the office screen.');
        }
        break;
      }

      case 'biometric': {
        // STRICT ISOLATION: Zero IP check. Only validates WebAuthn cryptographic passkey.
        const { biometricToken } = req.body;
        if (!biometricToken) {
          return badRequest(res, 'Biometric verification required — please authenticate with your fingerprint, Face ID, or PIN.');
        }
        const decoded = webauthnService.verifyAndConsumeBiometricToken(biometricToken, userId);
        if (!decoded) {
          return badRequest(res, 'Invalid or expired biometric verification. Please authenticate again.');
        }
        break;
      }

      case 'device_fingerprint': {
        // STRICT ISOLATION: Zero IP check. Covered by strict device verification gate.
        break;
      }

      default:
        return badRequest(res, `Unknown attendance method: ${activeMethod}`);
    }

    const newAttendance = new Attendance({
      userId,
      date: today,
      checkInTime: new Date(),
      status: 'present',
      checkInMethod: activeMethod,
      checkInIp: clientIp,
    });

    await newAttendance.save();

    const populatedAttendance = await Attendance.findById(newAttendance._id)
      .populate('userId', 'name designation email');

    const teamId = req.user.teamId?._id || req.user.teamId;
    if (teamId) {
      emitToTeam(teamId, 'attendance:update', {
        type: 'check_in',
        userId: req.user._id,
        userName: req.user.name,
        teamId,
        attendance: populatedAttendance || newAttendance,
      });
    }
    emitToManagers('attendance:update', {
      type: 'check_in',
      userId: req.user._id,
      userName: req.user.name,
      teamId,
      attendance: populatedAttendance || newAttendance,
    });

    return success(res, 'Checked in successfully');
  } catch (error) {
    console.error('Check-in error:', error);
    return badRequest(res, 'Check-in failed');
  }
};

const initiateCheckout = async (req, res) => {
  try {
    const userId = req.user._id;
    const userIdStr = userId.toString();
    const today = getTodayDateString();

    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance || !attendance.checkInTime) {
      return badRequest(res, 'No active check-in found for today.');
    }
    if (attendance.checkOutTime) {
      return badRequest(res, 'Already checked out today.');
    }

    // Daily log check (mandatory before check-out for employees)
    if (req.user.role === 'employee') {
      const dailyLog = await DailyLog.findOne({ userId, logDate: today });
      if (!dailyLog) {
        return badRequest(res, 'Log sheet is mandatory before check-out. Please submit your daily log sheet first.');
      }
    }

    // Generate short-lived token (90 seconds)
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 90 * 1000;
    activeCheckoutSessions.set(userIdStr, { token, expiresAt });

    // Emit to user's mobile room via socket
    emitToUser(userId, 'checkout:initiate_scan', {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return success(res, 'Checkout session initiated', {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    console.error('initiateCheckout error:', error);
    return badRequest(res, 'Failed to initiate checkout.');
  }
};

const checkOut = async (req, res) => {
  try {
    const userId = req.user._id;
    const userIdStr = userId.toString();
    const today = getTodayDateString();
    const { lat, lng, token, deviceFingerprint } = req.body;

    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance || !attendance.checkInTime) {
      return badRequest(res, 'No active check-in found for today.');
    }
    if (attendance.checkOutTime) {
      return badRequest(res, 'Already checked out today.');
    }

    // Daily Log Verification (mandatory before check-out for employees)
    let dailyLog = null;
    if (req.user.role === 'employee') {
      dailyLog = await DailyLog.findOne({ userId, logDate: today });
      if (!dailyLog) {
        return badRequest(res, 'Log sheet is mandatory before check-out. Please submit your daily log sheet first.');
      }
    } else {
      dailyLog = await DailyLog.findOne({ userId, logDate: today });
    }

    const clientIp = getClientIp(req);
    attendance.checkOutIp = clientIp;

    // Strict paired Office Network & Geofence Verification if checked in via wifi_ip
    if (attendance.checkInMethod === 'wifi_ip') {
      const activeOffices = await OfficeLocation.find({ status: 'active' });
      const matchingOffice = activeOffices.find((office) => isIpInAllowedList(clientIp, office.allowedIps));

      if (!matchingOffice) {
        return badRequest(
          res,
          'Unauthorized Network — You must be connected to the authorized office network to check out.'
        );
      }

      if (lat === undefined || lat === null || lng === undefined || lng === null || isNaN(Number(lat)) || isNaN(Number(lng))) {
        return badRequest(res, 'Location Access Required — please allow location access to verify your work location.');
      }

      const geoCheck = isWithinGeofence(lat, lng, matchingOffice.latitude, matchingOffice.longitude, matchingOffice.radiusMeters);
      if (!geoCheck.inside) {
        return badRequest(
          res,
          `Outside Office Location — You are connected to ${matchingOffice.officeName}'s network, but you are outside its physical perimeter (${geoCheck.distanceMeters}m away).`
        );
      }
    } else {
      // Standard Geofencing Validation for other check-in methods (QR, biometric)
      if (lat === undefined || lat === null || lng === undefined || lng === null || isNaN(Number(lat)) || isNaN(Number(lng))) {
        return badRequest(res, 'Location Access Required — please allow location access to verify your work location.');
      }

      const activeOffices = await OfficeLocation.find({ status: 'active' });
      let passedGeofence = false;
      let minDistance = Infinity;

      if (activeOffices.length > 0) {
        for (const office of activeOffices) {
          const geoCheck = isWithinGeofence(lat, lng, office.latitude, office.longitude, office.radiusMeters);
          if (geoCheck.inside) {
            passedGeofence = true;
            break;
          }
          if (geoCheck.distanceMeters < minDistance) {
            minDistance = geoCheck.distanceMeters;
          }
        }

        if (!passedGeofence) {
          return badRequest(res, `Outside Office Location — nearest office is ${minDistance}m away.`);
        }
      } else {
        // Fallback to legacy GeofenceSetting
        const geofence = await GeofenceSetting.findOne({ isActive: true });
        if (geofence) {
          const geoCheck = isWithinGeofence(lat, lng, geofence.latitude, geofence.longitude, geofence.radiusMeters);
          if (!geoCheck.inside) {
            return badRequest(res, 'Outside Office Location — you must be within the authorized office to check out.');
          }
        }
      }
    }

    // Token verification if provided (QR scan flow)
    if (token) {
      const session = activeCheckoutSessions.get(userIdStr);
      if (!session || session.token !== token || Date.now() > session.expiresAt) {
        return badRequest(res, 'Invalid or expired checkout session. Please scan the newly generated QR code.');
      }
    }

    // Always invalidate any active checkout session token upon successful checkout (or PC location fallback)
    activeCheckoutSessions.delete(userIdStr);

    // Strict Device Verification if device fingerprint is supplied
    const currentFingerprint = deviceFingerprint || req.headers['x-device-fingerprint'] || null;
    const registeredDevice = await RegisteredDevice.findOne({ userId, isActive: true, status: 'ACTIVE' });
    if (registeredDevice && registeredDevice.deviceFingerprint && currentFingerprint) {
      if (registeredDevice.deviceFingerprint !== currentFingerprint && req.user.role !== 'manager') {
        return badRequest(res, 'Use Your Registered Mobile — this device is not authorized for attendance.');
      }
    }

    const checkOutTime = new Date();
    const metrics = finalizeAttendanceCheckout(attendance, checkOutTime);
    attendance.status = calcAttendanceStatus(metrics.actualWorkMinutes);
    attendance.checkOutTime = checkOutTime;
    await attendance.save();

    // Synchronize daily log hours with finalized actual work duration
    if (dailyLog && metrics.actualWorkMinutes > 0) {
      dailyLog.hoursSpent = Math.round((metrics.actualWorkMinutes / 60) * 10) / 10;
      await dailyLog.save();
    }

    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate('userId', 'name designation email');

    const teamId = req.user.teamId?._id || req.user.teamId;
    if (teamId) {
      emitToTeam(teamId, 'attendance:update', {
        type: 'check_out',
        userId: req.user._id,
        userName: req.user.name,
        teamId,
        attendance: populatedAttendance || attendance,
      });
    }
    emitToManagers('attendance:update', {
      type: 'check_out',
      userId: req.user._id,
      userName: req.user.name,
      teamId,
      attendance: populatedAttendance || attendance,
    });

    // Notify user's personal room (e.g. PC browser) that checkout succeeded
    emitToUser(userId, 'attendance:checked_out', {
      attendance: populatedAttendance || attendance,
      summary: {
        checkInTime: attendance.checkInTime,
        checkOutTime: attendance.checkOutTime,
        totalDurationMinutes: metrics.totalDurationMinutes,
        totalBreakMinutes: metrics.totalBreakMinutes,
        actualWorkMinutes: metrics.actualWorkMinutes,
        breaks: attendance.breaks,
        status: attendance.status,
        dailyLog,
      }
    });

    return success(res, 'Checked out successfully', {
      attendance: populatedAttendance || attendance,
      summary: {
        checkInTime: attendance.checkInTime,
        checkOutTime: attendance.checkOutTime,
        totalDurationMinutes: metrics.totalDurationMinutes,
        totalBreakMinutes: metrics.totalBreakMinutes,
        actualWorkMinutes: metrics.actualWorkMinutes,
        breaks: attendance.breaks,
        status: attendance.status,
        dailyLog,
      }
    });
  } catch (error) {
    console.error('Check-out error:', error);
    return badRequest(res, 'Check-out failed');
  }
};

const getCurrentQrCode = async (req, res) => {
  try {
    let office = await OfficeLocation.findOne({ status: 'active' }).lean();
    if (!office) {
      office = await OfficeLocation.findOne({}).lean();
    }
    const officeId = office?._id ? office._id.toString() : 'default_office';
    const activeQr = getActiveOfficeQr(officeId, 5); // 5-minute rotating window
    
    return success(res, 'QR code fetched successfully', {
      qr: {
        codeValue: activeQr.qrString,
        expiresAt: activeQr.expiresAt,
      },
    });
  } catch (error) {
    console.error('Error fetching QR code:', error);
    return badRequest(res, 'Failed to fetch QR code');
  }
};

const requestDeviceApproval = async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestType, reason, requestedDeviceLabel, requestedUntil } = req.body;
    const rawUA = req.headers['user-agent'] || '';

    // GUARD 1: Block if already has an active registered device (force replacement flow)
    if (requestType === 'register' || !requestType) {
      const activeDevice = await RegisteredDevice.findOne({ userId, isActive: true, status: 'ACTIVE' });
      if (activeDevice && !(activeDevice.temporaryUntil && new Date() > new Date(activeDevice.temporaryUntil))) {
        return badRequest(res, 'You already have an active registered device. To switch devices, please submit a replacement request from the Device Status page.');
      }
    }

    // GUARD 2: Block duplicate pending request
    const existingRequest = await DeviceRequest.findOne({ userId, status: 'pending' });
    if (existingRequest) {
      return badRequest(res, 'You already have a pending device request. Please wait for it to be approved or rejected.');
    }

    // Auto-build device label from User-Agent if client didn't send one
    const autoLabel = buildDeviceLabel(rawUA);
    let finalLabel = (requestedDeviceLabel && requestedDeviceLabel.trim()) ? requestedDeviceLabel.trim() : autoLabel;
    finalLabel = formatDeviceLabel(finalLabel);
    if (finalLabel.length > 80) {
      finalLabel = finalLabel.slice(0, 80).trim();
    }

    const newRequest = new DeviceRequest({
      userId,
      status: 'pending',
      requestType: requestType || 'register',
      reason: reason || '',
      requestedDeviceLabel: finalLabel,
      requestedUntil: requestedUntil ? new Date(requestedUntil) : null,
      deviceFingerprint: req.body.deviceFingerprint || req.headers['x-device-fingerprint'] || null,
      ipAddress: getClientIp(req),
      userAgent: rawUA,
    });

    await newRequest.save();

    const populatedRequest = await DeviceRequest.findById(newRequest._id).populate('userId', 'name email');
    const teamId = req.user.teamId?._id || req.user.teamId;
    if (teamId) {
      emitToTeam(teamId, 'device:request_created', {
        request: populatedRequest || newRequest,
        userName: req.user.name,
        teamId,
      });
    }
    emitToManagers('device:request_created', {
      request: populatedRequest || newRequest,
      userName: req.user.name,
      teamId,
    });
    emitToAdmins('device:request_created', {
      request: populatedRequest || newRequest,
      userName: req.user.name,
      teamId,
    });

    // Auto-reflect to all managers (or admins if none) so any manager can act
    await notifyRequestSubmitted({
      type: 'device_request_submitted',
      title: 'New Device Request',
      message: `${req.user.name} submitted a ${newRequest.requestType} request for ${finalLabel}.${reason ? ' Reason: ' + reason : ''}`,
      relatedId: newRequest._id,
    });

    return success(res, 'Device approval requested successfully', { request: newRequest });
  } catch (error) {
    console.error('Error requesting device approval:', error);
    return badRequest(res, 'Failed to request device approval');
  }
};

const getDeviceStatus = async (req, res) => {
  try {
    const { deviceStatus, pendingRequest } = await computeDeviceStatus(req.user._id);
    return success(res, 'Device status fetched', { deviceStatus, pendingRequest });
  } catch (error) {
    console.error('getDeviceStatus error:', error);
    return badRequest(res, 'Failed to fetch device status');
  }
};

const getMyDeviceRequests = async (req, res) => {
  try {
    const requests = await DeviceRequest.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return success(res, 'Device requests fetched', { requests });
  } catch (error) {
    console.error('getMyDeviceRequests error:', error);
    return badRequest(res, 'Failed to fetch device requests');
  }
};

const startBreak = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayDateString();
    const { breakType } = req.body;

    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance || !attendance.checkInTime) {
      return badRequest(res, 'You must be checked in to start a break.');
    }
    if (attendance.checkOutTime) {
      return badRequest(res, 'You have already checked out for today.');
    }

    const hasActiveBreak = attendance.breaks.some(b => !b.endedAt);
    if (hasActiveBreak) {
      return badRequest(res, 'You are already on an active break.');
    }

    attendance.breaks.push({
      type: breakType || 'personal',
      startedAt: new Date()
    });

    await attendance.save();

    const teamId = req.user.teamId?._id || req.user.teamId;
    const activeBreak = attendance.breaks[attendance.breaks.length - 1];
    if (teamId) {
      emitToTeam(teamId, 'break:update', {
        type: 'start',
        userId: req.user._id,
        userName: req.user.name,
        teamId,
        activeBreak,
      });
    }
    emitToManagers('break:update', {
      type: 'start',
      userId: req.user._id,
      userName: req.user.name,
      teamId,
      activeBreak,
    });

    return success(res, 'Break started successfully');
  } catch (error) {
    console.error('Start break error:', error);
    return badRequest(res, 'Failed to start break');
  }
};

const endBreak = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayDateString();

    const attendance = await Attendance.findOne({ userId, date: today });
    if (!attendance) {
      return badRequest(res, 'No attendance record found.');
    }

    const activeBreakIndex = attendance.breaks.findIndex(b => !b.endedAt);
    if (activeBreakIndex === -1) {
      return badRequest(res, 'No active break to end.');
    }

    const now = new Date();
    attendance.breaks[activeBreakIndex].endedAt = now;
    
    // Compute duration in minutes
    const breakDurationMs = now - attendance.breaks[activeBreakIndex].startedAt;
    const breakDurationMinutes = Math.floor(breakDurationMs / 60000);
    attendance.completedBreakMinutes = (attendance.completedBreakMinutes || 0) + breakDurationMinutes;
    attendance.totalBreakMinutes = attendance.completedBreakMinutes;

    await attendance.save();

    const teamId = req.user.teamId?._id || req.user.teamId;
    if (teamId) {
      emitToTeam(teamId, 'break:update', {
        type: 'end',
        userId: req.user._id,
        userName: req.user.name,
        teamId,
        activeBreak: null,
      });
    }
    emitToManagers('break:update', {
      type: 'end',
      userId: req.user._id,
      userName: req.user.name,
      teamId,
      activeBreak: null,
    });

    return success(res, 'Break ended successfully');
  } catch (error) {
    console.error('End break error:', error);
    return badRequest(res, 'Failed to end break');
  }
};

const getDailyLog = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayDateString();
    
    const log = await DailyLog.findOne({ userId, logDate: today });
    return success(res, 'Daily log fetched', { log });
  } catch (error) {
    console.error('Fetch daily log error:', error);
    return badRequest(res, 'Failed to fetch daily log');
  }
};

const submitDailyLog = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayDateString();
    const logData = { ...(req.body || {}) };

    // Auto-compute hoursSpent if omitted, falsy, or not a number
    if (!logData.hoursSpent || isNaN(Number(logData.hoursSpent))) {
      const attendance = await Attendance.findOne({ userId, date: today });
      let computedHours = 1;
      if (attendance && attendance.checkInTime) {
        const completedBreaks = attendance.completedBreakMinutes || 0;
        const grossMinutes = Math.max(0, Math.floor((Date.now() - new Date(attendance.checkInTime).getTime()) / 60000));
        const netMinutes = Math.max(0, grossMinutes - completedBreaks);
        computedHours = Math.max(0.5, +(netMinutes / 60).toFixed(1));
      }
      logData.hoursSpent = computedHours;
    } else {
      logData.hoursSpent = Math.max(0.5, Number(logData.hoursSpent));
    }

    const log = await dailyLogService.submitDailyLog({
      user: req.user,
      logData,
      file: req.file,
    });

    return success(res, 'Daily log submitted successfully', { log });
  } catch (error) {
    console.error('Submit daily log error:', error);
    return badRequest(res, error.message || 'Failed to submit daily log');
  }
};

const sendDailyReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = getTodayDateString();

    const attendance = await Attendance.findOne({ userId, date: today });
    const log = await DailyLog.findOne({ userId, logDate: today });

    const teamId = req.user.teamId?._id || req.user.teamId;
    const reportData = {
      userId: req.user._id,
      userName: req.user.name,
      teamId,
      date: today,
      attendance,
      log,
    };

    // Consolidated single socket event to managers and team
    if (teamId) {
      emitToTeam(teamId, 'daily_log:submitted', reportData);
      emitToTeam(teamId, 'attendance:update', {
        type: 'report_sent',
        userId: req.user._id,
        userName: req.user.name,
        teamId,
        attendance,
      });
    }
    emitToManagers('daily_log:submitted', reportData);
    emitToManagers('attendance:update', {
      type: 'report_sent',
      userId: req.user._id,
      userName: req.user.name,
      teamId,
      attendance,
    });

    return success(res, 'Daily report sent to manager successfully', { report: reportData });
  } catch (error) {
    console.error('sendDailyReport error:', error);
    return badRequest(res, 'Failed to send daily report');
  }
};

const getLeaveTypes = async (req, res) => {
  try {
    const leaveTypes = await LeaveType.find({ isActive: true }).select('name code description annualQuota isPaid');
    return success(res, 'Leave types fetched', { leaveTypes });
  } catch (error) {
    console.error('Fetch leave types error:', error);
    return badRequest(res, 'Failed to fetch leave types');
  }
};

const getLeaveBalance = async (req, res) => {
  try {
    const userId = req.user._id;
    const year = getCurrentYear();
    let balances = await LeaveBalance.find({ userId, year }).populate('leaveTypeId');
    if (!balances || balances.length === 0) {
      await leaveService.initializeLeaveBalances(userId);
      balances = await LeaveBalance.find({ userId, year }).populate('leaveTypeId');
    }
    const leaveTypes = await LeaveType.find({ isActive: true }).select('name code description annualQuota isPaid');

    return success(res, 'Leave balance fetched', { balances, leaveTypes });
  } catch (error) {
    console.error('Fetch leave balance error:', error);
    return badRequest(res, 'Failed to fetch leave balance');
  }
};

const getMyLeaveRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const requests = await LeaveRequest.find({ userId }).populate('leaveTypeId').sort({ createdAt: -1 });
    
    return success(res, 'Leave requests fetched', { requests });
  } catch (error) {
    console.error('Fetch leave requests error:', error);
    return badRequest(res, 'Failed to fetch leave requests');
  }
};

const applyForLeave = async (req, res) => {
  try {
    const userId = req.user._id;
    const leaveData = req.body;
    
    const request = await leaveService.applyLeave({ userId, ...leaveData });
    
    return success(res, 'Leave request submitted successfully', { request });
  } catch (error) {
    console.error('Apply leave error:', error);
    return badRequest(res, error.message || 'Failed to submit leave request');
  }
};

const getMyAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const records = await Attendance.find({ userId }).sort({ date: -1 }).lean();

    const normalized = records.map(rec => enrichAttendanceRecord(rec));

    const totalDays = normalized.length;
    const presentCount = normalized.filter(r => r.status === 'present').length;
    const halfDayCount = normalized.filter(r => r.status === 'half_day').length;
    const totalMinutes = normalized.reduce((acc, r) => acc + (r.actualWorkMinutes || 0), 0);

    return success(res, 'Attendance history fetched successfully', {
      attendance: normalized,
      summary: {
        totalDays,
        presentCount,
        halfDayCount,
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      }
    });
  } catch (error) {
    console.error('Fetch attendance history error:', error);
    return badRequest(res, 'Failed to fetch attendance history');
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, phone, designation, avatarUrl } = req.body;

    const updates = {};
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return badRequest(res, 'Name cannot be empty.');
      }
      updates.name = name.trim();
    }
    if (phone !== undefined) {
      updates.phone = phone ? phone.trim() : null;
    }
    if (designation !== undefined) {
      updates.designation = designation ? designation.trim() : null;
    }
    if (avatarUrl !== undefined) {
      if (avatarUrl && typeof avatarUrl === 'string') {
        if (avatarUrl.length > 7 * 1024 * 1024) {
          return badRequest(res, 'Avatar image is too large.');
        }
        updates.avatarUrl = avatarUrl.trim();
      } else {
        updates.avatarUrl = null;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('teamId', 'name');

    if (!updatedUser) {
      return badRequest(res, 'User not found');
    }

    const userPayload = await authService.buildUserPayload(updatedUser);
    return success(res, 'Profile updated successfully', { user: userPayload });
  } catch (error) {
    console.error('Update profile error:', error);
    return badRequest(res, error.message || 'Failed to update profile');
  }
};

const getNetworkStatus = async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const activeOffices = await OfficeLocation.find({ status: 'active' });

    const matchingOffice = activeOffices.find((office) =>
      isIpInAllowedList(clientIp, office.allowedIps)
    );

    const primaryOffice = activeOffices[0];

    return success(res, 'Network status fetched', {
      isOfficeNetwork: Boolean(matchingOffice),
      targetSsid: matchingOffice?.wifiSsid || primaryOffice?.wifiSsid || null,
      officeName: matchingOffice?.officeName || primaryOffice?.officeName || null,
      maskedIp: maskIp(clientIp),
    });
  } catch (error) {
    console.error('getNetworkStatus error:', error);
    return badRequest(res, 'Failed to determine network status');
  }
};

const requestManualAttendance = async (req, res) => {
  try {
    const userId = req.user._id;
    const { requestDate, reason } = req.body;

    if (!requestDate) {
      return badRequest(res, 'Request date is required');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(requestDate)) {
      return badRequest(res, 'Invalid date format. Expected YYYY-MM-DD');
    }

    if (!reason || !reason.trim() || reason.trim().length < 3) {
      return badRequest(res, 'Reason is required and must be at least 3 characters');
    }

    const existingPending = await ManualAttendanceRequest.findOne({
      userId,
      requestDate,
      status: 'pending',
    });
    if (existingPending) {
      return badRequest(res, 'You already have a pending manual attendance request for this date.');
    }

    const existingAttendance = await Attendance.findOne({ userId, date: requestDate });
    if (existingAttendance && existingAttendance.status === 'present') {
      return badRequest(res, 'Attendance is already recorded as present for this date.');
    }

    const user = await User.findById(userId).populate('teamId');
    const teamId = user?.teamId?._id || user?.teamId || null;

    const request = await ManualAttendanceRequest.create({
      userId,
      teamId,
      requestDate,
      reason: reason.trim(),
      status: 'pending',
    });

    await Attendance.findOneAndUpdate(
      { userId, date: requestDate },
      {
        $setOnInsert: { userId, date: requestDate },
        $set: { status: 'manual_pending', checkInMethod: 'manual' },
      },
      { upsert: true, new: true }
    );

    if (teamId) {
      const managers = await User.find({ teamId, role: 'manager', isActive: true });
      for (const m of managers) {
        await createNotification({
          userId: m._id,
          type: 'manual_attendance_submitted',
          title: 'Manual Attendance Request',
          message: `${user.name} submitted a manual attendance request for ${requestDate}.`,
        });
      }
      emitToTeam(teamId, 'attendance:manual_request_created', {
        requestId: request._id,
        userId,
        userName: user.name,
        requestDate,
        reason: reason.trim(),
      });
    }

    const admins = await User.find({ role: 'admin', isActive: true });
    for (const a of admins) {
      await createNotification({
        userId: a._id,
        type: 'manual_attendance_submitted',
        title: 'Manual Attendance Request',
        message: `${user.name} submitted a manual attendance request for ${requestDate}.`,
      });
    }

    return success(res, 'Manual attendance request submitted successfully', { request });
  } catch (error) {
    console.error('requestManualAttendance error:', error);
    return badRequest(res, error.message || 'Failed to submit manual attendance request');
  }
};

const getMyManualAttendanceRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const requests = await ManualAttendanceRequest.find({ userId })
      .populate('decidedBy', 'name')
      .sort({ createdAt: -1 });

    return success(res, 'Manual attendance requests fetched', { requests });
  } catch (error) {
    console.error('getMyManualAttendanceRequests error:', error);
    return badRequest(res, 'Failed to fetch manual attendance requests');
  }
};

module.exports = {
  getStatus,
  getDashboard,
  checkIn,
  initiateCheckout,
  checkOut,
  sendDailyReport,
  getCurrentQrCode,
  requestDeviceApproval,
  getDeviceStatus,
  getMyDeviceRequests,
  startBreak,
  endBreak,
  getDailyLog,
  submitDailyLog,
  getLeaveTypes,
  getLeaveBalance,
  getMyLeaveRequests,
  applyForLeave,
  getMyAttendanceHistory,
  updateProfile,
  getNetworkStatus,
  requestManualAttendance,
  getMyManualAttendanceRequests,
};
