import { MoreVertical } from 'lucide-react';

export default function Panel({
  title,
  subtitle,
  badge,
  action,
  showMenu = true,
  onMenuClick,
  children,
  className = '',
  bodyClassName = '',
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col ${className}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 tracking-wide truncate">{title}</h2>
          {badge && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {badge}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {action}
          {showMenu && (
            <button
              type="button"
              onClick={onMenuClick}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="More options"
            >
              <MoreVertical size={16} />
            </button>
          )}
        </div>
      </div>

      {subtitle && (
        <div className="px-5 pt-2.5 text-xs text-slate-500">
          {subtitle}
        </div>
      )}

      <div className={`p-5 flex-1 ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
