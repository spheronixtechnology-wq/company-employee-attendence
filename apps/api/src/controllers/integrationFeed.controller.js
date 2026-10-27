const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { signCursor, verifyAndDecodeCursor } = require('../utils/cursorUtils');

const VALID_EMPLOYEE_SCOPES = ['all', 'restricted'];
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes max future clock skew

/**
 * Validates or generates sync watermark and lower boundary parameters.
 * Fail-closed validation for ISO8601 formatting and boundary conditions.
 */
function resolveWatermarkAndBounds(rawWatermark, rawUpdatedSince, decodedCursor) {
  // If continuation cursor is present, the signed cursor watermark is authoritative
  if (decodedCursor && decodedCursor.wm) {
    const watermarkDate = new Date(decodedCursor.wm);
    if (isNaN(watermarkDate.getTime())) {
      return { error: 'INVALID_CURSOR_WATERMARK', message: 'Signed cursor contains an invalid watermark date.' };
    }

    // If client explicitly echoed a watermark in query, ensure it matches signed cursor
    if (rawWatermark && rawWatermark !== decodedCursor.wm) {
      return {
        error: 'CURSOR_CONTEXT_MISMATCH',
        message: 'Supplied watermark query parameter does not match the signed cursor watermark boundary.',
      };
    }

    let updatedSinceDate = null;
    if (decodedCursor.us) {
      updatedSinceDate = new Date(decodedCursor.us);
    } else if (rawUpdatedSince) {
      const parsedSince = new Date(rawUpdatedSince);
      if (!isNaN(parsedSince.getTime())) {
        updatedSinceDate = parsedSince;
      }
    }

    return {
      watermarkDate,
      isoWatermark: decodedCursor.wm,
      updatedSinceDate,
      isoUpdatedSince: decodedCursor.us || null,
    };
  }

  // Initial page without cursor: watermark parameter is mandatory for deterministic synchronization
  if (!rawWatermark) {
    return {
      error: 'WATERMARK_REQUIRED',
      message: 'Query parameter "watermark" is required (ISO8601 timestamp).',
    };
  }

  if (typeof rawWatermark !== 'string') {
    return { error: 'INVALID_WATERMARK', message: 'Watermark must be a valid ISO8601 string.' };
  }
  const watermarkDate = new Date(rawWatermark);
  if (isNaN(watermarkDate.getTime())) {
    return { error: 'INVALID_WATERMARK', message: 'Watermark must be a valid ISO8601 date string.' };
  }
  // Reject future timestamps exceeding clock-skew tolerance
  if (watermarkDate.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) {
    return {
      error: 'WATERMARK_FUTURE',
      message: 'Watermark timestamp cannot be in the future (skew exceeds 5 minutes).',
    };
  }

  // Reject watermarks within safe transaction commit buffer (10 seconds)
  const MIN_SAFE_WATERMARK_BUFFER_MS = 10 * 1000;
  if (watermarkDate.getTime() > Date.now() - MIN_SAFE_WATERMARK_BUFFER_MS) {
    return {
      error: 'WATERMARK_TOO_RECENT',
      message: 'Watermark must be at least 10 seconds behind server time to guarantee transaction commit safety.',
    };
  }

  const isoWatermark = watermarkDate.toISOString();

  // Validate optional updated_since lower boundary
  let updatedSinceDate = null;
  let isoUpdatedSince = null;
  if (rawUpdatedSince) {
    if (typeof rawUpdatedSince !== 'string') {
      return { error: 'INVALID_UPDATED_SINCE', message: 'updated_since must be a valid ISO8601 string.' };
    }
    updatedSinceDate = new Date(rawUpdatedSince);
    if (isNaN(updatedSinceDate.getTime())) {
      return { error: 'INVALID_UPDATED_SINCE', message: 'Query parameter "updated_since" must be a valid ISO8601 date string.' };
    }
    if (updatedSinceDate.getTime() > watermarkDate.getTime()) {
      return {
        error: 'UPDATED_SINCE_EXCEEDS_WATERMARK',
        message: 'updated_since lower boundary cannot exceed the synchronization watermark.',
      };
    }
    isoUpdatedSince = updatedSinceDate.toISOString();
  }

  return {
    watermarkDate,
    isoWatermark,
    updatedSinceDate,
    isoUpdatedSince,
  };
}

/**
 * Returns audience filter condition for MongoDB queries.
 * Strictly fail-closed: missing, corrupted, or non-whitelisted scopes throw 403 immediately.
 */
function getAudienceFilter(credential, userField) {
  if (!credential || !VALID_EMPLOYEE_SCOPES.includes(credential.employeeScope)) {
    const err = new Error('Unauthorized: Credential has invalid, missing, or unconfigured employee scope.');
    err.statusCode = 403;
    err.code = 'INVALID_EMPLOYEE_SCOPE';
    throw err;
  }

  if (credential.employeeScope === 'restricted') {
    if (!Array.isArray(credential.allowedEmployees) || credential.allowedEmployees.length === 0) {
      const err = new Error('Forbidden: Restricted integration key has no employees configured in its audience.');
      err.statusCode = 403;
      err.code = 'RESTRICTED_KEY_EMPTY_AUDIENCE';
      throw err;
    }

    const objectIds = credential.allowedEmployees.map((id) =>
      id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))
    );
    return { [userField]: { $in: objectIds } };
  }

  // employeeScope === 'all' -> Organization-wide access (no audience filter added)
  return null;
}

/**
 * Universal Feed Query Builder
 * Combines audience boundary, upper watermark, lower updated_since, and cursor continuation safely with $and.
 */
function buildUniversalFeedQuery({
  credential,
  watermarkDate,
  updatedSinceDate = null,
  cursorData = null,
  userField,
  extraConditions = [],
}) {
  const queryParts = [...extraConditions];

  // 1. Strict Fail-Closed Audience Boundary
  const audienceCondition = getAudienceFilter(credential, userField);
  if (audienceCondition) {
    queryParts.push(audienceCondition);
  }

  // 2. Cursor Continuation vs Initial Page
  if (cursorData) {
    const { cursorDate, cursorObjectId } = cursorData;

    // Safety guard: cursor must never exceed upper watermark
    if (cursorDate.getTime() > watermarkDate.getTime()) {
      const err = new Error('Cursor timestamp strictly exceeds the sync watermark boundary.');
      err.code = 'CURSOR_OUT_OF_BOUNDS';
      err.statusCode = 400;
      throw err;
    }

    queryParts.push({
      $or: [
        // Case A: Strictly newer timestamp, bounded by upper watermark
        { updatedAt: { $gt: cursorDate, $lte: watermarkDate } },
        // Case B: Timestamp equality tie-breaker (No duplicate keys; $eq and $lte combined)
        {
          updatedAt: { $eq: cursorDate, $lte: watermarkDate },
          _id: { $gt: cursorObjectId },
        },
      ],
    });
  } else {
    // Initial page query: bounded by upper watermark
    const timeFilter = { updatedAt: { $lte: watermarkDate } };
    if (updatedSinceDate) {
      timeFilter.updatedAt.$gt = updatedSinceDate;
    }
    queryParts.push(timeFilter);
  }

  return queryParts.length === 1 ? queryParts[0] : { $and: queryParts };
}

/**
 * Validates and decodes signed continuation cursor.
 */
function parseContinuationCursor(req, endpointName, pepper) {
  if (!req.query.cursor) return { cursorData: null, decoded: null };

  const decoded = verifyAndDecodeCursor(req.query.cursor, pepper);
  if (!decoded) {
    return {
      error: 'INVALID_CURSOR_SIGNATURE',
      message: 'Cursor signature verification failed, expired (24h TTL), or token is malformed.',
    };
  }

  const credentialKeyId = req.integration.keyId;
  const cursorKeyId = decoded.keyId || decoded.tenant;

  // Strict context binding checks
  if (cursorKeyId !== credentialKeyId) {
    return {
      error: 'CURSOR_CONTEXT_MISMATCH',
      message: 'Cursor was issued to a different integration key.',
    };
  }

  if (decoded.ep !== endpointName) {
    return {
      error: 'CURSOR_CONTEXT_MISMATCH',
      message: `Cursor was issued for endpoint "${decoded.ep}", not "${endpointName}".`,
    };
  }

  const cursorDate = new Date(decoded.u);
  if (isNaN(cursorDate.getTime())) {
    return { error: 'INVALID_CURSOR_TIMESTAMP', message: 'Cursor contains an unparseable timestamp.' };
  }

  const hexRegex = /^[0-9a-fA-F]{24}$/;
  if (!decoded.id || !hexRegex.test(String(decoded.id))) {
    return { error: 'INVALID_CURSOR_ID', message: 'Cursor contains an invalid record ID.' };
  }

  return {
    decoded,
    cursorData: {
      cursorDate,
      cursorObjectId: new mongoose.Types.ObjectId(String(decoded.id)),
    },
  };
}

/**
 * GET /api/integrations/v1/attendance
 * Scope: attendance-daily:read
 */
exports.getAttendanceFeed = async (req, res, next) => {
  try {
    const tenantId = req.integration.keyId;
    const pepper = req.integration.pepper;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 250);

    // 1. Parse Cursor (if present)
    const { cursorData, decoded, error: cursorErr, message: cursorMsg } = parseContinuationCursor(
      req,
      'attendance',
      pepper
    );
    if (cursorErr) {
      return res.status(400).json({ success: false, code: cursorErr, message: cursorMsg, requestId: req.id });
    }

    // 2. Resolve Watermark & Boundaries
    const {
      error: wmError,
      message: wmMsg,
      watermarkDate,
      isoWatermark,
      updatedSinceDate,
      isoUpdatedSince,
    } = resolveWatermarkAndBounds(req.query.watermark, req.query.updated_since, decoded);
    if (wmError) {
      return res.status(400).json({ success: false, code: wmError, message: wmMsg, requestId: req.id });
    }

    // 3. Assemble Universal Fail-Closed Query
    const filter = buildUniversalFeedQuery({
      credential: req.integration.credential,
      watermarkDate,
      updatedSinceDate,
      cursorData,
      userField: 'userId', // Attendance documents reference User via userId
    });

    // 4. Query with deterministic compound index { updatedAt: 1, _id: 1 }
    const records = await Attendance.find(filter)
      .sort({ updatedAt: 1, _id: 1 })
      .limit(limit + 1)
      .select(
        '_id userId date status checkInTime checkOutTime totalDurationMinutes totalBreakMinutes actualWorkMinutes autoCheckedOut updatedAt'
      )
      .lean();

    const hasNextPage = records.length > limit;
    const items = hasNextPage ? records.slice(0, limit) : records;

    let nextCursor = null;
    if (hasNextPage) {
      const lastItem = items[items.length - 1];
      nextCursor = signCursor(
        {
          keyId: tenantId,
          org: req.integration.credential.integration || 'frappe_hrms',
          ep: 'attendance',
          wm: isoWatermark,
          us: isoUpdatedSince,
          u: lastItem.updatedAt.toISOString(),
          id: lastItem._id.toString(),
        },
        pepper
      );
    }

    return res.json({
      success: true,
      data: items,
      pagination: {
        limit,
        watermark: isoWatermark,
        nextCursor,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/integrations/v1/employees
 * Scope: employees:read
 */
exports.getEmployeesFeed = async (req, res, next) => {
  try {
    const tenantId = req.integration.keyId;
    const pepper = req.integration.pepper;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 250);

    // 1. Parse Cursor (if present)
    const { cursorData, decoded, error: cursorErr, message: cursorMsg } = parseContinuationCursor(
      req,
      'employees',
      pepper
    );
    if (cursorErr) {
      return res.status(400).json({ success: false, code: cursorErr, message: cursorMsg, requestId: req.id });
    }

    // 2. Resolve Watermark & Boundaries
    const {
      error: wmError,
      message: wmMsg,
      watermarkDate,
      isoWatermark,
      updatedSinceDate,
      isoUpdatedSince,
    } = resolveWatermarkAndBounds(req.query.watermark, req.query.updated_since, decoded);
    if (wmError) {
      return res.status(400).json({ success: false, code: wmError, message: wmMsg, requestId: req.id });
    }

    // 3. Assemble Universal Fail-Closed Query
    const filter = buildUniversalFeedQuery({
      credential: req.integration.credential,
      watermarkDate,
      updatedSinceDate,
      cursorData,
      userField: '_id', // User documents are keyed by _id
    });

    // 4. Strict projection excluding passwords, tokens, and MFA secrets
    const records = await User.find(filter)
      .sort({ updatedAt: 1, _id: 1 })
      .limit(limit + 1)
      .select(
        '_id employeeId name email role phone department designation jobType workLocation gender dob joinedDate isActive deletedAt updatedAt'
      )
      .lean();

    const hasNextPage = records.length > limit;
    const items = hasNextPage ? records.slice(0, limit) : records;

    let nextCursor = null;
    if (hasNextPage) {
      const lastItem = items[items.length - 1];
      nextCursor = signCursor(
        {
          keyId: tenantId,
          org: req.integration.credential.integration || 'frappe_hrms',
          ep: 'employees',
          wm: isoWatermark,
          us: isoUpdatedSince,
          u: lastItem.updatedAt.toISOString(),
          id: lastItem._id.toString(),
        },
        pepper
      );
    }

    return res.json({
      success: true,
      data: items,
      pagination: {
        limit,
        watermark: isoWatermark,
        nextCursor,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/integrations/v1/attendance-events
 * Scope: attendance-events:read
 */
exports.getAttendanceEventsFeed = async (req, res, next) => {
  try {
    const tenantId = req.integration.keyId;
    const pepper = req.integration.pepper;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 250);

    // 1. Parse Cursor (if present)
    const { cursorData, decoded, error: cursorErr, message: cursorMsg } = parseContinuationCursor(
      req,
      'attendance-events',
      pepper
    );
    if (cursorErr) {
      return res.status(400).json({ success: false, code: cursorErr, message: cursorMsg, requestId: req.id });
    }

    // 2. Resolve Watermark & Boundaries
    const {
      error: wmError,
      message: wmMsg,
      watermarkDate,
      isoWatermark,
      updatedSinceDate,
      isoUpdatedSince,
    } = resolveWatermarkAndBounds(req.query.watermark, req.query.updated_since, decoded);
    if (wmError) {
      return res.status(400).json({ success: false, code: wmError, message: wmMsg, requestId: req.id });
    }

    // 3. Assemble Universal Fail-Closed Query
    const filter = buildUniversalFeedQuery({
      credential: req.integration.credential,
      watermarkDate,
      updatedSinceDate,
      cursorData,
      userField: 'userId', // Attendance documents reference User via userId
      extraConditions: [{ checkInTime: { $ne: null } }], // Must have checked in to emit punch events
    });

    // 4. Query Attendance records
    const records = await Attendance.find(filter)
      .sort({ updatedAt: 1, _id: 1 })
      .limit(limit + 1)
      .select('_id userId checkInTime checkOutTime checkInMethod updatedAt')
      .lean();

    const hasNextPage = records.length > limit;
    const rawItems = hasNextPage ? records.slice(0, limit) : records;

    // 5. Expand into deterministic synthetic punch events
    // Event IDs are stable and globally unique (<_id>_IN and <_id>_OUT)
    const events = [];
    for (const rec of rawItems) {
      if (rec.checkInTime) {
        events.push({
          eventId: `${rec._id.toString()}_IN`,
          attendanceId: rec._id,
          userId: rec.userId,
          logType: 'IN',
          eventTime: rec.checkInTime,
          device: rec.checkInMethod || 'Spheronix-System',
          updatedAt: rec.updatedAt,
        });
      }
      if (rec.checkOutTime) {
        events.push({
          eventId: `${rec._id.toString()}_OUT`,
          attendanceId: rec._id,
          userId: rec.userId,
          logType: 'OUT',
          eventTime: rec.checkOutTime,
          device: 'Spheronix-System',
          updatedAt: rec.updatedAt,
        });
      }
    }

    let nextCursor = null;
    if (hasNextPage) {
      const lastRaw = rawItems[rawItems.length - 1];
      nextCursor = signCursor(
        {
          keyId: tenantId,
          org: req.integration.credential.integration || 'frappe_hrms',
          ep: 'attendance-events',
          wm: isoWatermark,
          us: isoUpdatedSince,
          u: lastRaw.updatedAt.toISOString(),
          id: lastRaw._id.toString(),
        },
        pepper
      );
    }

    return res.json({
      success: true,
      data: events,
      pagination: {
        limit,
        watermark: isoWatermark,
        nextCursor,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
};
