import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles } from 'lucide-react';

/**
 * Format Date to 'YYYY-MM-DD'
 */
const toYMD = (year, month, day) => {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
};

/**
 * Interactive TimeChamp Month Calendar Widget (Premium Edition)
 * 
 * @param {string} selectedDate - Currently selected date in 'YYYY-MM-DD'
 * @param {Function} onSelectDate - Callback when a date is clicked
 * @param {string[]} [activeDates=[]] - List of 'YYYY-MM-DD' dates that have attendance activity
 */
export default function MonthCalendar({
  selectedDate,
  onSelectDate,
  activeDates = [],
}) {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  // Track viewing year and month (1-indexed for month, 1-12)
  const initialYearMonth = useMemo(() => {
    if (selectedDate && selectedDate.includes('-')) {
      const parts = selectedDate.split('-');
      return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) };
    }
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }, [selectedDate, today]);

  const [viewYear, setViewYear] = useState(initialYearMonth.year);
  const [viewMonth, setViewMonth] = useState(initialYearMonth.month);

  // Sync calendar view month/year whenever external selectedDate changes
  useEffect(() => {
    if (selectedDate && selectedDate.includes('-')) {
      const parts = selectedDate.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (!isNaN(y) && !isNaN(m)) {
        setViewYear(y);
        setViewMonth(m);
      }
    }
  }, [selectedDate]);

  const monthName = useMemo(() => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleJumpToday = () => {
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    setViewYear(y);
    setViewMonth(m);
    onSelectDate(todayStr);
  };

  // Build grid of calendar days (Monday to Sunday)
  const calendarDays = useMemo(() => {
    const days = [];
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const lastDay = new Date(viewYear, viewMonth, 0);
    const totalDaysInMonth = lastDay.getDate();

    // Monday as first day: 0=Sun, 1=Mon, ..., 6=Sat
    // Convert so Monday=0, Sunday=6
    let startDayOfWeek = (firstDay.getDay() + 6) % 7;

    // Previous month padding days
    const prevMonthLastDay = new Date(viewYear, viewMonth - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const pDay = prevMonthLastDay - i;
      const prevM = viewMonth === 1 ? 12 : viewMonth - 1;
      const prevY = viewMonth === 1 ? viewYear - 1 : viewYear;
      const dateStr = toYMD(prevY, prevM, pDay);
      days.push({
        dayNumber: pDay,
        dateStr,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dateStr = toYMD(viewYear, viewMonth, d);
      days.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
      });
    }

    // Next month padding days to complete standard 35 or 42 grid
    const totalGridSlots = days.length > 35 ? 42 : 35;
    const remainingSlots = totalGridSlots - days.length;
    for (let n = 1; n <= remainingSlots; n++) {
      const nextM = viewMonth === 12 ? 1 : viewMonth + 1;
      const nextY = viewMonth === 12 ? viewYear + 1 : viewYear;
      const dateStr = toYMD(nextY, nextM, n);
      days.push({
        dayNumber: n,
        dateStr,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [viewYear, viewMonth]);

  const weekHeaders = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08)] transition-all space-y-3.5">
      {/* Calendar Header: Month/Year + Steppers */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-600 text-white flex items-center justify-center shadow-sm shadow-primary-500/25">
            <CalendarIcon size={16} />
          </div>
          <span className="font-extrabold text-slate-900 text-sm tracking-tight">{monthName}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleJumpToday}
            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80 transition-all hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
            title="Go to Today"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-slate-200 cursor-pointer"
            title="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-slate-200 cursor-pointer"
            title="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Weekday Row */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekHeaders.map((h, i) => (
          <div
            key={h}
            className={`text-[11px] font-bold py-1 select-none ${
              i >= 5 ? 'text-amber-500' : 'text-slate-400'
            }`}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((item) => {
          const isSelected = item.dateStr === selectedDate;
          const isToday = item.dateStr === todayStr;
          const hasActivity = activeDates.includes(item.dateStr);

          let cellClass =
            'relative h-10 w-full rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-all duration-200 cursor-pointer select-none';

          if (isSelected) {
            cellClass +=
              ' bg-gradient-to-r from-primary-600 to-indigo-600 text-white font-extrabold shadow-md shadow-primary-600/30 ring-2 ring-primary-300/70 scale-[1.06] z-10';
          } else if (isToday) {
            cellClass +=
              ' border-2 border-primary-500 text-primary-700 bg-primary-50/60 hover:bg-primary-100/70 font-bold hover:scale-105';
          } else if (item.isCurrentMonth) {
            cellClass +=
              ' text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 hover:scale-105';
          } else {
            cellClass +=
              ' text-slate-300 hover:bg-slate-50 hover:text-slate-400';
          }

          return (
            <button
              key={item.dateStr}
              type="button"
              onClick={() => onSelectDate(item.dateStr)}
              className={cellClass}
              title={`${item.dateStr}${hasActivity ? ' (Attendance Recorded)' : ''}`}
            >
              <span>{item.dayNumber}</span>
              {/* Activity indicator dot */}
              {hasActivity && (
                <span
                  className={`w-1.5 h-1.5 rounded-full -mt-0.5 transition-all ${
                    isSelected
                      ? 'bg-white'
                      : 'bg-emerald-500 ring-1 ring-white shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Mini Legend */}
      <div className="pt-2 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-500 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
          <span className="font-medium">Active check-ins</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gradient-to-r from-primary-600 to-indigo-600" />
          <span className="font-medium">Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border border-primary-500 bg-primary-50" />
          <span className="font-medium">Today</span>
        </div>
      </div>
    </div>
  );
}
