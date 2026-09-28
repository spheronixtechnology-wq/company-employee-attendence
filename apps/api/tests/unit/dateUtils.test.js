const { calcAttendanceStatus, calcAttendanceMetrics } = require('../../src/utils/dateUtils');

describe('Date Utilities', () => {
  describe('calcAttendanceStatus()', () => {
    it('should return "absent" for 0 minutes', () => {
      expect(calcAttendanceStatus(0)).toBe('absent');
      expect(calcAttendanceStatus(-10)).toBe('absent');
    });

    it('should return "half_day" for less than 4 hours (240 mins)', () => {
      expect(calcAttendanceStatus(239)).toBe('half_day');
      expect(calcAttendanceStatus(120)).toBe('half_day');
    });

    it('should return "present" for 4 hours or more', () => {
      expect(calcAttendanceStatus(240)).toBe('present');
      expect(calcAttendanceStatus(480)).toBe('present'); // 8 hours
    });
  });

  describe('calcAttendanceMetrics()', () => {
    it('should correctly calculate net work minutes without double-counting breaks', () => {
      const checkInTime = new Date('2023-10-10T10:00:00.000+05:30').getTime(); // 10:00 AM IST
      const checkOutTime = new Date('2023-10-10T15:00:00.000+05:30').getTime(); // 3:00 PM IST (5 hours total)

      // 5 hours total duration.
      // Lunch break is automatically deducted (1:00 PM to 2:00 PM = 60 mins).
      // So expected work minutes = 5 hours - 1 hour = 4 hours (240 mins).

      const metrics = calcAttendanceMetrics({
        checkInTime,
        checkOutTime,
        breaks: [],
      });

      expect(metrics.totalDurationMinutes).toBe(300); // 5 hours
      expect(metrics.totalBreakMinutes).toBe(60); // Lunch
      expect(metrics.actualWorkMinutes).toBe(240); // 4 hours
    });

    it('should accurately merge manual breaks with the lunch window (Interval Union)', () => {
      const checkInTime = new Date('2023-10-10T10:00:00.000+05:30').getTime(); // 10:00 AM IST
      const checkOutTime = new Date('2023-10-10T15:00:00.000+05:30').getTime(); // 3:00 PM IST (5 hours total)

      // Break overlaps with lunch (12:30 PM to 1:30 PM)
      const breaks = [
        {
          startedAt: new Date('2023-10-10T12:30:00.000+05:30').getTime(),
          endedAt: new Date('2023-10-10T13:30:00.000+05:30').getTime(),
        }
      ];

      // Total breaks: Manual (12:30-1:30) U Lunch (1:00-2:00) = Union is 12:30 to 2:00 (90 mins).
      const metrics = calcAttendanceMetrics({
        checkInTime,
        checkOutTime,
        breaks,
      });

      expect(metrics.totalBreakMinutes).toBe(90);
      expect(metrics.actualWorkMinutes).toBe(210); // 300 total - 90 break
    });
  });
});
