/**
 * Date utility helpers used across the application.
 */

/**
 * Returns today's date as 'YYYY-MM-DD' string (UTC).
 * All attendance/daily-log date comparisons use this format.
 */
const getTodayDateString = (timeZone = 'Asia/Kolkata') => {
  return getBusinessDateString(new Date(), timeZone);
};

/**
 * Returns a business date string 'YYYY-MM-DD' formatted in a specific timezone (default: Asia/Kolkata).
 * @param {Date|string|number} [date=new Date()]
 * @param {string} [timeZone='Asia/Kolkata']
 * @returns {string} 'YYYY-MM-DD'
 */
const getBusinessDateString = (date = new Date(), timeZone = 'Asia/Kolkata') => {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
};

/**
 * Returns a Date object representing 23:59:59.000 at the end of the specified business date in Asia/Kolkata.
 * In Asia/Kolkata (UTC+5:30), 23:59:59 IST is 18:29:59 UTC on that same calendar day.
 * @param {string} dateString - 'YYYY-MM-DD'
 * @returns {Date}
 */
const getBusinessEndOfDay = (dateString) => {
  return new Date(`${dateString}T23:59:59.000+05:30`);
};

/**
 * Converts any Date object to 'YYYY-MM-DD' string (UTC).
 */
const toDateString = (date) => {
  return new Date(date).toISOString().split('T')[0];
};

/**
 * Calculates the number of calendar days between two date strings (inclusive).
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {string} endDate - 'YYYY-MM-DD'
 * @returns {number}
 */
const countDaysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end - start;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
};

/**
 * Returns the current year as a number.
 */
const getCurrentYear = () => new Date().getFullYear();

/**
 * Calculates net work minutes from check-in, check-out, and total break minutes.
 */
const calcNetWorkMinutes = (checkInTime, checkOutTime, totalBreakMinutes = 0) => {
  if (!checkInTime || !checkOutTime) return 0;
  const totalMinutes = (new Date(checkOutTime) - new Date(checkInTime)) / (1000 * 60);
  return Math.max(0, Math.round(totalMinutes - totalBreakMinutes));
};

/**
 * Determines attendance status based on net work minutes.
 * half_day = less than 240 minutes (4 hours)
 */
const calcAttendanceStatus = (netWorkMinutes) => {
  if (netWorkMinutes <= 0) return 'absent';
  if (netWorkMinutes < 240) return 'half_day';
  return 'present';
};

/**
 * Computes attendance metrics (totalDurationMinutes, totalBreakMinutes, actualWorkMinutes)
 * using interval union so breaks (suspensions, manual) and company lunch window (1:00 PM - 2:00 PM IST)
 * are NEVER double-counted.
 *
 * @param {Object} params
 * @param {Date|string|number} params.checkInTime - The check-in timestamp
 * @param {Date|string|number|null} [params.checkOutTime=null] - The check-out timestamp if checked out
 * @param {Array} [params.breaks=[]] - List of break objects with startedAt and endedAt
 * @param {Object|null} [params.activeBreak=null] - Currently active break if ongoing
 * @param {Date|string|number} [params.referenceTime=new Date()] - Reference time for live sessions
 * @returns {{ totalDurationMinutes: number, totalBreakMinutes: number, actualWorkMinutes: number, totalDurationMs: number, totalBreakMs: number, actualWorkMs: number }}
 */
const calcAttendanceMetrics = ({
  checkInTime,
  checkOutTime = null,
  breaks = [],
  activeBreak = null,
  referenceTime = new Date(),
}) => {
  if (!checkInTime) {
    return {
      totalDurationMinutes: 0,
      totalBreakMinutes: 0,
      actualWorkMinutes: 0,
      totalDurationMs: 0,
      totalBreakMs: 0,
      actualWorkMs: 0,
    };
  }

  const checkInDate = new Date(checkInTime);
  if (isNaN(checkInDate.getTime())) {
    return {
      totalDurationMinutes: 0,
      totalBreakMinutes: 0,
      actualWorkMinutes: 0,
      totalDurationMs: 0,
      totalBreakMs: 0,
      actualWorkMs: 0,
    };
  }

  const checkInDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(checkInDate);

  const shiftEndLimit = new Date(`${checkInDateStr}T18:00:00.000+05:30`).getTime();
  const refMs = referenceTime ? new Date(referenceTime).getTime() : Date.now();

  let effectiveEndTime = checkOutTime ? new Date(checkOutTime).getTime() : refMs;
  if (effectiveEndTime > shiftEndLimit) {
    effectiveEndTime = shiftEndLimit;
  }
  const checkInMs = checkInDate.getTime();
  if (effectiveEndTime < checkInMs) {
    effectiveEndTime = checkInMs;
  }

  const totalDurationMs = Math.max(0, effectiveEndTime - checkInMs);

  // Collect all non-working break intervals within [checkInMs, effectiveEndTime]
  const rawIntervals = [];

  if (Array.isArray(breaks)) {
    for (const b of breaks) {
      if (b && b.startedAt) {
        const bStart = new Date(b.startedAt).getTime();
        const bEnd = b.endedAt ? new Date(b.endedAt).getTime() : effectiveEndTime;
        const cStart = Math.max(checkInMs, bStart);
        const cEnd = Math.min(effectiveEndTime, bEnd);
        if (cEnd > cStart) {
          rawIntervals.push({ start: cStart, end: cEnd });
        }
      }
    }
  }

  if (activeBreak && activeBreak.startedAt) {
    const bStart = new Date(activeBreak.startedAt).getTime();
    const cStart = Math.max(checkInMs, bStart);
    const cEnd = Math.min(effectiveEndTime, refMs);
    if (cEnd > cStart) {
      rawIntervals.push({ start: cStart, end: cEnd });
    }
  }

  // Automatic Lunch Break Deduction (1:00 PM to 2:00 PM IST)
  const lunchStart = new Date(`${checkInDateStr}T13:00:00.000+05:30`).getTime();
  const lunchEnd = new Date(`${checkInDateStr}T14:00:00.000+05:30`).getTime();
  const lStart = Math.max(checkInMs, lunchStart);
  const lEnd = Math.min(effectiveEndTime, lunchEnd);
  if (lEnd > lStart) {
    rawIntervals.push({ start: lStart, end: lEnd });
  }

  // Interval Union: Sort and merge overlapping / adjacent intervals
  let totalBreakMs = 0;
  if (rawIntervals.length > 0) {
    rawIntervals.sort((a, b) => a.start - b.start);
    const merged = [rawIntervals[0]];
    for (let i = 1; i < rawIntervals.length; i++) {
      const cur = rawIntervals[i];
      const prev = merged[merged.length - 1];
      if (cur.start <= prev.end) {
        prev.end = Math.max(prev.end, cur.end);
      } else {
        merged.push(cur);
      }
    }
    for (const interval of merged) {
      totalBreakMs += (interval.end - interval.start);
    }
  }

  const actualWorkMs = Math.max(0, totalDurationMs - totalBreakMs);
  const totalDurationMinutes = Math.floor(totalDurationMs / 60000);
  const totalBreakMinutes = Math.floor(totalBreakMs / 60000);
  const actualWorkMinutes = Math.floor(actualWorkMs / 60000);

  return {
    totalDurationMinutes,
    totalBreakMinutes,
    actualWorkMinutes,
    totalDurationMs,
    totalBreakMs,
    actualWorkMs,
  };
};

/**
 * Finalizes checkout for an attendance document.
 * - Sets checkOutTime.
 * - Auto-closes any active break by setting endedAt to checkOutTime.
 * - Computes metrics via calcAttendanceMetrics using interval union.
 * - Updates attendance properties directly.
 * 
 * @param {Object} attendance - Mongoose Attendance document
 * @param {Date|string} [checkOutTime=new Date()] - The checkout timestamp
 * @returns {Object} { totalDurationMinutes, totalBreakMinutes, actualWorkMinutes }
 */
const finalizeAttendanceCheckout = (attendance, checkOutTime = new Date()) => {
  const finalCheckOut = checkOutTime instanceof Date ? checkOutTime : new Date(checkOutTime);
  attendance.checkOutTime = finalCheckOut;

  // Auto-close any unended breaks
  if (Array.isArray(attendance.breaks)) {
    for (const b of attendance.breaks) {
      if (!b.endedAt && b.startedAt) {
        b.endedAt = finalCheckOut;
      }
    }
  }

  const metrics = calcAttendanceMetrics({
    checkInTime: attendance.checkInTime || finalCheckOut,
    checkOutTime: finalCheckOut,
    breaks: attendance.breaks,
    referenceTime: finalCheckOut,
  });

  attendance.completedBreakMinutes = metrics.totalBreakMinutes;
  attendance.totalBreakMinutes = metrics.totalBreakMinutes;
  attendance.totalDurationMinutes = metrics.totalDurationMinutes;
  attendance.actualWorkMinutes = metrics.actualWorkMinutes;

  return {
    totalDurationMinutes: metrics.totalDurationMinutes,
    totalBreakMinutes: metrics.totalBreakMinutes,
    actualWorkMinutes: metrics.actualWorkMinutes,
  };
};

module.exports = {
  getTodayDateString,
  getBusinessDateString,
  getBusinessEndOfDay,
  toDateString,
  countDaysBetween,
  getCurrentYear,
  calcNetWorkMinutes,
  calcAttendanceStatus,
  calcAttendanceMetrics,
  finalizeAttendanceCheckout,
};
