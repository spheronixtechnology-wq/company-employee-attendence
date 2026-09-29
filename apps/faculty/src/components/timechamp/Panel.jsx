import { MoreVertical } from 'lucide-react';

export default function Panel({
  title,
  subtitle,
  badge,
  icon: Icon,
  iconVariant = 'violet',
  action,
  showMenu = true,
  onMenuClick,
  children,
  className = '',
  bodyClassName = '',
}) {
  const iconStyles = {
    violet: 'bg-violet-100/80 text-violet-600 shadow-[0_4px_12px_-4px_rgba(139,92,246,0.5)]',
    blue: 'bg-sky-100/80 text-sky-600 shadow-[0_4px_12px_-4px_rgba(14,165,233,0.5)]',
    green: 'bg-emerald-100/80 text-emerald-600 shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]',
    amber: 'bg-amber-100/80 text-amber-600 shadow-[0_4px_12px_-4px_rgba(245,158,11,0.5)]',
  };
  const iconCls = iconStyles[iconVariant] || iconStyles.violet;

  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-3xl border border-white/90 overflow-hidden flex flex-col shadow-[0_12px_32px_-14px_rgba(148,163,184,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] ${className}`}>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconCls}`}>
              <Icon size={18} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-slate-800 tracking-tight truncate">{title}</h2>
              {badge && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100/80 text-violet-600 shadow-[inset_0_1px_2px_rgba(139,92,246,0.15)] whitespace-nowrap">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {action}
          {showMenu && (
            <button
              type="button"
              onClick={onMenuClick}
              className="p-1.5 rounded-xl text-slate-300 hover:text-violet-600 hover:bg-violet-50/70 transition-colors"
              title="More options"
            >
              <MoreVertical size={16} />
            </button>
          )}
        </div>
      </div>

      <div className={`px-5 pb-5 pt-1 flex-1 ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
