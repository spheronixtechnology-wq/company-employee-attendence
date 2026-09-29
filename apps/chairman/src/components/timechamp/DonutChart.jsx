import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ChevronRight } from 'lucide-react';

export default function DonutChart({
  data = [],
  centerLabel = '',
  centerValue = '',
  onItemClick,
}) {
  const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const displayData = total === 0 ? [{ name: 'No Data', value: 1, color: '#e2e8f0' }] : data;

  const handleCellClick = (entry) => {
    if (onItemClick && entry && entry.name !== 'No Data') {
      onItemClick(entry);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 w-full h-full min-h-[190px]">
      <div className="relative w-44 h-44 flex-shrink-0 flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className="bg-white/95 backdrop-blur-md border border-slate-200 px-3 py-1.5 rounded-xl shadow-xl text-xs z-50">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-semibold text-slate-800">{item.name}:</span>
                        <span className="font-bold text-slate-900">{item.value}</span>
                      </div>
                      {onItemClick && item.name !== 'No Data' && (
                        <p className="text-[10px] text-primary-600 font-bold mt-1">Click to view details &rarr;</p>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Pie
              data={displayData}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={70}
              paddingAngle={total === 0 ? 0 : 3}
              dataKey="value"
              stroke="none"
              onClick={handleCellClick}
              cursor={onItemClick && total > 0 ? 'pointer' : 'default'}
            >
              {displayData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || '#0ea5e9'}
                  onClick={() => handleCellClick(entry)}
                  className={onItemClick && entry.name !== 'No Data' ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-xl font-bold text-slate-900 font-mono leading-none">{centerValue}</span>
            {centerLabel && <span className="text-[10px] text-slate-500 mt-1 font-medium">{centerLabel}</span>}
          </div>
        )}
      </div>

      <div className="flex-1 w-full space-y-1.5 text-xs">
        {data.map((item, idx) => {
          const pct = total > 0 ? Math.round(((item.value || 0) / total) * 100) : 0;
          const isClickable = Boolean(onItemClick && item.name !== 'No Data');

          return (
            <div
              key={idx}
              onClick={() => isClickable && onItemClick(item)}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={(e) => {
                if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onItemClick(item);
                }
              }}
              title={isClickable ? `Click to view ${item.name} records` : undefined}
              className={`group flex items-center justify-between py-1.5 px-2.5 rounded-xl transition-all duration-150 ${
                isClickable
                  ? 'cursor-pointer hover:bg-slate-100/90 active:scale-[0.99] border border-transparent hover:border-slate-200/80 shadow-2xs hover:shadow-xs'
                  : 'border-b border-slate-100 last:border-0'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0 shadow-2xs transition-transform duration-150 group-hover:scale-125"
                  style={{ backgroundColor: item.color }}
                />
                <span className={`truncate font-semibold transition-colors ${
                  isClickable ? 'text-slate-700 group-hover:text-slate-900' : 'text-slate-700'
                }`}>
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-2 flex-shrink-0">
                <span className="font-mono font-bold text-slate-900">{item.displayValue || item.value}</span>
                <span className="text-[10px] text-slate-400 w-8 text-right font-mono">({pct}%)</span>
                {isClickable && (
                  <ChevronRight
                    size={13}
                    className="text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
