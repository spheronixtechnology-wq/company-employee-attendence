const RegisteredDevice = require('../models/RegisteredDevice');
const EmployeeLocation = require('../models/EmployeeLocation');
const LocationRequest = require('../models/LocationRequest');
const DeviceRequest = require('../models/DeviceRequest');
const { writeAuditLog } = require('./audit.service');


/**
 * Called once on app startup and then on a schedule.
 * Expires temporary devices and location assignments whose validity period has passed.
 */
const cleanupExpiredTemporaryAccess = async () => {
  const now = new Date();

  // 1. Expire TEMPORARY devices past their temporaryUntil date
  const expiredDevices = await RegisteredDevice.find({
    status: 'TEMPORARY',
    temporaryUntil: { $lt: now },
  });

  if (expiredDevices.length > 0) {
    const ids = expiredDevices.map(d => d._id);
    await RegisteredDevice.updateMany(
      { _id: { $in: ids } },
      { status: 'REVOKED', isActive: false, revokedReason: 'Temporary authorization expired' }
    );

    for (const device of expiredDevices) {
      await writeAuditLog({
        action: AUDIT_ACTIONS.TEMPORARY_DEVICE_EXPIRED,
        performedBy: { _id: null, role: 'system', name: 'System' },
        targetCollection: 'registered_devices',
        targetId: device._id,
        targetUserId: device.userId,
        reason: `Temporary device expired at ${device.temporaryUntil.toISOString()}`,
      });
    }

    console.log(`[cleanup] Expired ${expiredDevices.length} temporary device(s).`);
  }

  // 2. Expire temporary EmployeeLocation assignments past validUntil
  const expiredLocations = await EmployeeLocation.find({
    assignmentType: 'temporary',
    status: 'active',
    validUntil: { $lt: now },
  });

  if (expiredLocations.length > 0) {
    const ids = expiredLocations.map(l => l._id);
    await EmployeeLocation.updateMany(
      { _id: { $in: ids } },
      { status: 'expired' }
    );

    for (const loc of expiredLocations) {
      await writeAuditLog({
        action: AUDIT_ACTIONS.TEMPORARY_LOCATION_EXPIRED,
        performedBy: { _id: null, role: 'system', name: 'System' },
        targetCollection: 'employee_locations',
        targetId: loc._id,
        targetUserId: loc.userId,
        reason: `Temporary location access expired at ${loc.validUntil.toISOString()}`,
      });
    }

    console.log(`[cleanup] Expired ${expiredLocations.length} temporary location assignment(s).`);
  }

  // 3. Mark pending device/location requests as expired if they were for a past date
  await DeviceRequest.updateMany(
    {
      status: 'pending',
      requestType: 'temporary',
      requestedUntil: { $lt: now },
    },
    { status: 'expired' }
  );

  await LocationRequest.updateMany(
    {
      status: 'pending',
      requestType: 'temporary_access',
      requestedUntil: { $lt: now },
    },
    { status: 'expired' }
  );
};

/**
 * Schedule the cleanup to run every hour.
 * Called once when the API server starts.
 */
const startCleanupScheduler = () => {
  console.log('[cleanup] Starting temporary access cleanup scheduler (runs every hour).');
  cleanupExpiredTemporaryAccess().catch(err => console.error('[cleanup] Initial run error:', err));

  // Run every hour
  setInterval(() => {
    cleanupExpiredTemporaryAccess().catch(err => console.error('[cleanup] Error:', err));
  }, 60 * 60 * 1000); // 1 hour in ms
};

module.exports = { cleanupExpiredTemporaryAccess, startCleanupScheduler };
