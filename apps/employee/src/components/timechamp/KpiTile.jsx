export default function KpiTile({
  icon: Icon,
  value,
  label,
  subtext,
  variant = 'blue',
  onClick,
  className = '',
}) {
  const colorMap = {
    green: {
      iconBg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-500 shadow-[0_4px_10px_-3px_rgba(16,185,129,0.4)]',
      text: 'text-emerald-600',
    },
    emerald: {
      iconBg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-500 shadow-[0_4px_10px_-3px_rgba(16,185,129,0.4)]',
      text: 'text-emerald-600',
    },
    blue: {
      iconBg: 'bg-gradient-to-br from-sky-100 to-sky-50 text-sky-500 shadow-[0_4px_10px_-3px_rgba(14,165,233,0.4)]',
      text: 'text-sky-600',
    },
    sky: {
      iconBg: 'bg-gradient-to-br from-sky-100 to-sky-50 text-sky-500 shadow-[0_4px_10px_-3px_rgba(14,165,233,0.4)]',
      text: 'text-sky-600',
    },
    purple: {
      iconBg: 'bg-gradient-to-br from-purple-100 to-purple-50 text-purple-500 shadow-[0_4px_10px_-3px_rgba(168,85,247,0.4)]',
      text: 'text-purple-600',
    },
    violet: {
      iconBg: 'bg-gradient-to-br from-violet-100 to-violet-50 text-violet-500 shadow-[0_4px_10px_-3px_rgba(139,92,246,0.4)]',
      text: 'text-violet-600',
    },
    red: {
      iconBg: 'bg-gradient-to-br from-rose-100 to-rose-50 text-rose-500 shadow-[0_4px_10px_-3px_rgba(244,63,94,0.4)]',
      text: 'text-rose-600',
    },
    amber: {
      iconBg: 'bg-gradient-to-br from-amber-100 to-amber-50 text-amber-500 shadow-[0_4px_10px_-3px_rgba(245,158,11,0.4)]',
      text: 'text-amber-600',
    },
    slate: {
      iconBg: 'bg-gradient-to-br from-slate-100 to-slate-50 text-slate-500',
      text: 'text-slate-700',
    },
  };

  const scheme = colorMap[variant] || colorMap.blue;

  return (
    <div
      onClick={onClick}
      className={`relative rounded-3xl p-4 bg-white/80 backdrop-blur-sm border border-white/90 shadow-[0_10px_28px_-12px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all duration-300 hover:shadow-[0_16px_36px_-12px_rgba(148,163,184,0.6)] hover:-translate-y-0.5 ${
        onClick ? 'cursor-pointer active:scale-[0.97]' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${scheme.iconBg}`}>
          {Icon && <Icon size={16} />}
        </div>
        {subtext && (
          <span className="text-[9.5px] font-semibold text-slate-400 bg-white/80 px-2 py-0.5 rounded-full shadow-[inset_0_1px_2px_rgba(148,163,184,0.25)]">
            {subtext}
          </span>
        )}
      </div>

      <div className={`text-2xl font-bold tracking-tight ${scheme.text} font-mono leading-none`}>
        {value ?? '—'}
      </div>

      <p className="text-slate-500 text-xs font-medium mt-2 truncate">
        {label}
      </p>
    </div>
  );
}
