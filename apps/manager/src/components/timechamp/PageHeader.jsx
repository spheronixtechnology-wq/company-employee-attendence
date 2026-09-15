import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Globe } from 'lucide-react';

export default function PageHeader({
  title,
  subtitle,
  tabs = [],
  activeTab,
  onTabChange,
  date,
  onPrevDate,
  onNextDate,
  onDateChange,
  onTodayJump,
  viewMode = 'Day',
  onViewModeChange,
  badgeText,
  rightActions,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const formattedDate = date instanceof Date
    ? date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
    : (date || new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }));

  const getIsoDateString = (d) => {
    if (!d) return '';
    const dateObj = d instanceof Date ? d : new Date(d);
    if (isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isoDateVal = getIsoDateString(date);

  const handleDateInputChange = (e) => {
    if (!e.target.value) return;
    const parts = e.target.value.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (onDateChange) onDateChange(d);
    }
  };

  return (
    <div className="space-y-4 pb-2">
      {/* Top Entity Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            {title}
            {badgeText && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                {badgeText}
              </span>
            )}
          </h1>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        {/* Date & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {onViewModeChange && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>{viewMode}</span>
                <span className="text-[10px] text-slate-400">▼</span>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-1 w-24 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 text-xs">
                  {['Day', 'Week', 'Month'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        onViewModeChange(mode);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 cursor-pointer ${
                        viewMode === mode ? 'text-sky-600 font-bold bg-sky-50/50' : 'text-slate-700'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date Navigator with interactive Picker & Steppers */}
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl overflow-hidden p-0.5 shadow-sm hover:border-slate-300 transition-all">
            {onPrevDate && (
              <button
                type="button"
                onClick={onPrevDate}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft size={15} />
              </button>
            )}

            {/* Interactive Date Indicator & Hidden Native Picker */}
            <div className="relative flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-slate-700 cursor-pointer group hover:bg-slate-50 rounded-lg transition-colors">
              <Calendar size={13} className="text-violet-600 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="select-none tracking-tight">{formattedDate}</span>
              <input
                type="date"
                value={isoDateVal}
                onChange={handleDateInputChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="Click to choose a date from calendar"
              />
            </div>

            {onNextDate && (
              <button
                type="button"
                onClick={onNextDate}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Next Day"
              >
                <ChevronRight size={15} />
              </button>
            )}

            {onTodayJump && (
              <button
                type="button"
                onClick={onTodayJump}
                className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200/60 ml-1 transition-all cursor-pointer shadow-2xs"
                title="Jump to Today"
              >
                Today
              </button>
            )}
          </div>

          <div className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-600 shadow-sm">
            <Globe size={13} className="text-slate-400" />
            <span>IST (UTC+5:30)</span>
          </div>

          {rightActions}
        </div>
      </div>

      {/* Horizontal Sub-Tabs */}
      {tabs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange && onTabChange(tab.id)}
                className={`relative px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'text-sky-600 border-b-2 border-sky-600 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.icon && <tab.icon size={14} />}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${tab.badgeClass || 'bg-slate-100 text-slate-600'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
