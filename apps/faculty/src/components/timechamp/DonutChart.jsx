import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function DonutChart({
  data = [],
  centerLabel = '',
  centerValue = '',
}) {
  const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const displayData = total === 0 ? [{ name: 'No Data', value: 1, color: '#e2e8f0' }] : data;

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
                    <div className="bg-white border border-violet-100 px-3 py-1.5 rounded-xl shadow-[0_10px_28px_-10px_rgba(139,92,246,0.4)] text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-semibold text-slate-800">{item.name}:</span>
                        <span className="font-bold text-violet-600">{item.value}</span>
                      </div>
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
              innerRadius={50}
              outerRadius={72}
              paddingAngle={total === 0 ? 0 : 2}
              dataKey="value"
              stroke="none"
              cornerRadius={4}
            >
              {displayData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || '#0ea5e9'} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-xl font-bold text-slate-800 font-mono leading-none">{centerValue}</span>
            {centerLabel && <span className="text-[10px] text-slate-400 mt-1 font-medium">{centerLabel}</span>}
          </div>
        )}
      </div>

      {/* Legend with progress bars — reference style */}
      <div className="flex-1 w-full space-y-3.5 text-xs">
        {data.map((item, idx) => {
          const pct = total > 0 ? Math.round(((item.value || 0) / total) * 100) : 0;
          return (
            <div key={idx} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color, boxShadow: `0 3px 8px -2px ${item.color}66` }}
                  />
                  <span className="text-slate-700 truncate font-semibold">{item.name}</span>
                </div>
                <div className="flex items-center gap-2 pl-2">
                  <span className="font-mono font-bold text-slate-800">{item.displayValue || item.value}</span>
                  <span className="text-[10px] text-slate-400 w-9 text-right font-mono">({pct}%)</span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100/80 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${item.color}99, ${item.color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
