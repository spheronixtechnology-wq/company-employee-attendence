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
  viewMode = 'Day',
  onViewModeChange,
  badgeText,
  rightActions,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const formattedDate = date instanceof Date
    ? date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
    : (date || new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }));

  return (
    <div className="space-y-4 pb-2">
      {/* Top Entity Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-tight font-extrabold text-slate-800 tracking-tight flex flex-wrap items-center gap-2.5">
            {title}
            {badgeText && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-100/80 text-violet-600 shadow-[inset_0_1px_2px_rgba(139,92,246,0.15)]">
                {badgeText}
              </span>
            )}
          </h1>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>

        {/* Date & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {onViewModeChange && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="px-3.5 py-2 rounded-2xl bg-white/80 border border-white/90 text-xs font-semibold text-slate-600 hover:text-violet-600 hover:shadow-[0_6px_16px_-8px_rgba(139,92,246,0.5)] shadow-[0_4px_14px_-8px_rgba(148,163,184,0.5)] flex items-center gap-1.5 transition-all"
              >
                <span>{viewMode}</span>
                <span className="text-[10px] text-slate-400">▼</span>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-1 w-28 bg-white border border-violet-100 rounded-2xl shadow-[0_14px_34px_-14px_rgba(139,92,246,0.45)] z-20 py-1.5 text-xs overflow-hidden">
                  {['Day', 'Week', 'Month'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        onViewModeChange(mode);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 transition-colors ${
                        viewMode === mode ? 'text-violet-600 font-bold bg-violet-50/70' : 'text-slate-600 hover:bg-violet-50/40'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date Navigator */}
          <div className="flex items-center bg-white/80 border border-white/90 rounded-2xl p-1 shadow-[0_4px_14px_-8px_rgba(148,163,184,0.5)] backdrop-blur-sm">
            {onPrevDate && (
              <button
                type="button"
                onClick={onPrevDate}
                className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50/60 rounded-xl transition-colors"
                title="Previous Day"
              >
                <ChevronLeft size={15} />
              </button>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600">
              <Calendar size={13} className="text-violet-500" />
              <span>{formattedDate}</span>
            </div>
            {onNextDate && (
              <button
                type="button"
                onClick={onNextDate}
                className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50/60 rounded-xl transition-colors"
                title="Next Day"
              >
                <ChevronRight size={15} />
              </button>
            )}
          </div>

          <div className="hidden md:flex items-center gap-1 px-3 py-2 rounded-2xl bg-white/80 border border-white/90 text-xs font-medium text-slate-500 shadow-[0_4px_14px_-8px_rgba(148,163,184,0.5)]">
            <Globe size={13} className="text-slate-400" />
            <span>IST (UTC+5:30)</span>
          </div>

          {rightActions}
        </div>
      </div>

      {/* Horizontal Sub-Tabs — pastel style: pill row, pink active underline */}
      {tabs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-violet-100/80 overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange && onTabChange(tab.id)}
                className={`relative px-4 py-2.5 text-xs whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'text-pink-600 font-bold'
                    : 'font-medium text-slate-400 hover:text-slate-700'
                }`}
              >
                {tab.icon && <tab.icon size={14} />}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-pink-100 text-pink-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tab.badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t-full bg-gradient-to-r from-pink-400 via-fuchsia-500 to-violet-500" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
