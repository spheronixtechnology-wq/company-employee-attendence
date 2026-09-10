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
 * Finalizes checkout for an attendance document.
 * - Sets checkOutTime.
 * - Auto-closes any active break by setting endedAt to checkOutTime.
 * - Computes totalBreakMinutes from all completed breaks.
 * - Computes totalDurationMinutes (checkOutTime - checkInTime).
 * - Computes actualWorkMinutes (totalDurationMinutes - totalBreakMinutes).
 * - Updates attendance properties directly.
 * 
 * @param {Object} attendance - Mongoose Attendance document
 * @param {Date|string} [checkOutTime=new Date()] - The checkout timestamp
 * @returns {Object} { totalDurationMinutes, totalBreakMinutes, actualWorkMinutes }
 */
const finalizeAttendanceCheckout = (attendance, checkOutTime = new Date()) => {
  const finalCheckOut = checkOutTime instanceof Date ? checkOutTime : new Date(checkOutTime);
  attendance.checkOutTime = finalCheckOut;

  let totalBreakMinutes = 0;
  if (Array.isArray(attendance.breaks)) {
    for (const b of attendance.breaks) {
      if (!b.endedAt && b.startedAt) {
        b.endedAt = finalCheckOut;
      }
      if (b.startedAt && b.endedAt) {
        const diffMs = new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime();
        const mins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
        totalBreakMinutes += mins;
      }
    }
  }

  const checkInMs = attendance.checkInTime ? new Date(attendance.checkInTime).getTime() : finalCheckOut.getTime();
  const totalDurationMs = finalCheckOut.getTime() - checkInMs;
  const totalDurationMinutes = Math.max(0, Math.floor(totalDurationMs / (1000 * 60)));
  const actualWorkMinutes = Math.max(0, totalDurationMinutes - totalBreakMinutes);

  attendance.completedBreakMinutes = totalBreakMinutes;
  attendance.totalBreakMinutes = totalBreakMinutes;
  attendance.totalDurationMinutes = totalDurationMinutes;
  attendance.actualWorkMinutes = actualWorkMinutes;

  return {
    totalDurationMinutes,
    totalBreakMinutes,
    actualWorkMinutes,
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
  finalizeAttendanceCheckout,
};
