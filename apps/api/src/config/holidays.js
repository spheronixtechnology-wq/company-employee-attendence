/**
 * Company working-day calendar (Asia/Kolkata).
 * Single source of truth for the EOD absence job and the daily roster, so neither
 * reports employees as absent on a weekend or holiday.
 *
 * - FIXED_HOLIDAYS repeat every year (MM-DD).
 * - VARIABLE_HOLIDAYS hold lunar/festival dates that change yearly (YYYY-MM-DD).
 *   Fill next year's list before January; tests/unit/holidays.test.js fails in December otherwise.
 * - HOLIDAYS_EXTRA (comma-separated YYYY-MM-DD) adds company or regional days without a deploy.
 */

const FIXED_HOLIDAYS = [
  '01-26', // Republic Day
  '08-15', // Independence Day
  '10-02', // Gandhi Jayanti
  '12-25', // Christmas
];

const VARIABLE_HOLIDAYS = {
  2026: [],
  2027: [],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseExtraHolidays = (raw = process.env.HOLIDAYS_EXTRA || '') =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => DATE_RE.test(s));

/**
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {{ isNonWorkingDay: boolean, reason: 'weekend' | 'holiday' | null }}
 */
const isNonWorkingDay = (dateStr) => {
  const day = new Date(`${dateStr}T12:00:00+05:30`).getUTCDay();
  if (day === 0 || day === 6) return { isNonWorkingDay: true, reason: 'weekend' };

  const year = Number(dateStr.slice(0, 4));
  const isHoliday =
    FIXED_HOLIDAYS.includes(dateStr.slice(5)) ||
    (VARIABLE_HOLIDAYS[year] || []).includes(dateStr) ||
    parseExtraHolidays().includes(dateStr);

  if (isHoliday) return { isNonWorkingDay: true, reason: 'holiday' };
  return { isNonWorkingDay: false, reason: null };
};

module.exports = { isNonWorkingDay, FIXED_HOLIDAYS, VARIABLE_HOLIDAYS, parseExtraHolidays };
