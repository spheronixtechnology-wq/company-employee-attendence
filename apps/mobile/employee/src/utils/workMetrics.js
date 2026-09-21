/**
 * Workday Calculation Engine
 * 100% mathematical parity with apps/employee/src/pages/DashboardPage.jsx
 * Enforces:
 * 1. Asia/Kolkata timezone (IST)
 * 2. 18:00 IST regular shift end cap
 * 3. 13:00 - 14:00 IST automatic lunch break deduction
 * 4. Interval union algorithm to merge overlapping breaks and prevent double-deduction
 * 5. 20:00 IST break lockout
 */

export const formatTimerSeconds = (sec = 0) => {
  const s = Math.max(0, Math.floor(sec));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

export const formatDuration = (mins = 0) => {
  const m = Math.max(0, Math.floor(mins));
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

export const formatTime = (isoString) => {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return '—';
  }
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    if (typeof dateStr === 'string' && dateStr.includes('-')) {
      const parts = dateStr.split('T')[0].split('-');
      if (parts.length === 3) {
        const [y, m, d] = parts.map(Number);
        const dateObj = new Date(y, m - 1, d);
        return dateObj.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return dateStr;
  }
};

export const calculateLiveWorkMetrics = (
  checkInTime,
  checkOutTime,
  breaks = [],
  activeBreak = null
) => {
  if (!checkInTime) {
    return {
      totalElapsedMs: 0,
      breakMs: 0,
      workMs: 0,
      totalDurationMinutes: 0,
      totalBreakMinutes: 0,
      actualWorkMinutes: 0,
    };
  }

  const checkInDate = new Date(checkInTime);
  if (isNaN(checkInDate.getTime())) {
    return {
      totalElapsedMs: 0,
      breakMs: 0,
      workMs: 0,
      totalDurationMinutes: 0,
      totalBreakMinutes: 0,
      actualWorkMinutes: 0,
    };
  }

  const checkInDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(checkInDate);

  const shiftEndLimit = new Date(`${checkInDateStr}T18:00:00.000+05:30`).getTime();
  const now = Date.now();

  let endTime = checkOutTime ? new Date(checkOutTime).getTime() : now;
  if (endTime > shiftEndLimit) {
    endTime = shiftEndLimit;
  }
  const checkInMs = checkInDate.getTime();
  if (endTime < checkInMs) {
    endTime = checkInMs;
  }

  const totalElapsedMs = Math.max(0, endTime - checkInMs);

  // Collect all non-working break intervals within [checkInMs, endTime]
  const rawIntervals = [];

  if (Array.isArray(breaks)) {
    for (const b of breaks) {
      if (b && b.startedAt) {
        const bStart = new Date(b.startedAt).getTime();
        const bEnd = b.endedAt ? new Date(b.endedAt).getTime() : endTime;
        const cStart = Math.max(checkInMs, bStart);
        const cEnd = Math.min(endTime, bEnd);
        if (cEnd > cStart) {
          rawIntervals.push({ start: cStart, end: cEnd });
        }
      }
    }
  }

  if (activeBreak && activeBreak.startedAt) {
    const bStart = new Date(activeBreak.startedAt).getTime();
    const cStart = Math.max(checkInMs, bStart);
    const cEnd = Math.min(endTime, now);
    if (cEnd > cStart) {
      rawIntervals.push({ start: cStart, end: cEnd });
    }
  }

  // Automatic Lunch Break Deduction (1:00 PM to 2:00 PM IST)
  const lunchStart = new Date(`${checkInDateStr}T13:00:00.000+05:30`).getTime();
  const lunchEnd = new Date(`${checkInDateStr}T14:00:00.000+05:30`).getTime();
  const lStart = Math.max(checkInMs, lunchStart);
  const lEnd = Math.min(endTime, lunchEnd);
  if (lEnd > lStart) {
    rawIntervals.push({ start: lStart, end: lEnd });
  }

  // Interval Union: Merge overlapping / adjacent intervals
  let breakMs = 0;
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
      breakMs += interval.end - interval.start;
    }
  }

  const workMs = Math.max(0, totalElapsedMs - breakMs);
  const totalDurationMinutes = Math.floor(totalElapsedMs / 60000);
  const totalBreakMinutes = Math.floor(breakMs / 60000);
  const actualWorkMinutes = Math.floor(workMs / 60000);

  return {
    totalElapsedMs,
    breakMs,
    workMs,
    totalDurationMinutes,
    totalBreakMinutes,
    actualWorkMinutes,
  };
};

export const calculateLiveWorkMs = (
  checkInTime,
  checkOutTime,
  breaks = [],
  activeBreak = null
) => {
  return calculateLiveWorkMetrics(checkInTime, checkOutTime, breaks, activeBreak).workMs;
};

/**
 * Checks if current time is past 20:00 (8:00 PM) IST
 */
export const isLogSheetLocked = (checkInTime) => {
  const now = Date.now();
  let baseDate = checkInTime ? new Date(checkInTime) : new Date();
  if (isNaN(baseDate.getTime())) baseDate = new Date();

  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(baseDate);

  const limit = new Date(`${dateStr}T20:00:00.000+05:30`).getTime();
  return now > limit;
};
