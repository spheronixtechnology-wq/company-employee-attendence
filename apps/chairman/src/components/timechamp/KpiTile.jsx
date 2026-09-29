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
      iconBg: 'bg-emerald-50 border-emerald-200 text-emerald-600',
      text: 'text-emerald-700',
      glow: 'hover:border-emerald-300 hover:shadow-emerald-500/5',
    },
    emerald: {
      iconBg: 'bg-emerald-50 border-emerald-200 text-emerald-600',
      text: 'text-emerald-700',
      glow: 'hover:border-emerald-300 hover:shadow-emerald-500/5',
    },
    blue: {
      iconBg: 'bg-sky-50 border-sky-200 text-sky-600',
      text: 'text-sky-700',
      glow: 'hover:border-sky-300 hover:shadow-sky-500/5',
    },
    sky: {
      iconBg: 'bg-sky-50 border-sky-200 text-sky-600',
      text: 'text-sky-700',
      glow: 'hover:border-sky-300 hover:shadow-sky-500/5',
    },
    purple: {
      iconBg: 'bg-purple-50 border-purple-200 text-purple-600',
      text: 'text-purple-700',
      glow: 'hover:border-purple-300 hover:shadow-purple-500/5',
    },
    violet: {
      iconBg: 'bg-violet-50 border-violet-200 text-violet-600',
      text: 'text-violet-700',
      glow: 'hover:border-violet-300 hover:shadow-violet-500/5',
    },
    red: {
      iconBg: 'bg-rose-50 border-rose-200 text-rose-600',
      text: 'text-rose-700',
      glow: 'hover:border-rose-300 hover:shadow-rose-500/5',
    },
    amber: {
      iconBg: 'bg-amber-50 border-amber-200 text-amber-600',
      text: 'text-amber-700',
      glow: 'hover:border-amber-300 hover:shadow-amber-500/5',
    },
    slate: {
      iconBg: 'bg-slate-100 border-slate-200 text-slate-600',
      text: 'text-slate-800',
      glow: 'hover:border-slate-300',
    },
  };

  const scheme = colorMap[variant] || colorMap.blue;

  return (
    <div
      onClick={onClick}
      className={`relative bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm hover:shadow transition-all duration-200 ${
        onClick ? `cursor-pointer ${scheme.glow} active:scale-[0.98]` : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${scheme.iconBg}`}>
          {Icon && <Icon size={16} />}
        </div>
        {subtext && (
          <span className="text-[10px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
            {subtext}
          </span>
        )}
      </div>

      <div className={`text-2xl font-bold tracking-tight ${scheme.text} font-mono leading-none`}>
        {value ?? '—'}
      </div>

      <p className="text-slate-600 text-xs font-medium mt-2 truncate">
        {label}
      </p>
    </div>
  );
}
