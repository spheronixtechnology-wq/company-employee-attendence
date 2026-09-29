import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import {
  Users, UserCheck, Calendar, ClipboardList, Settings,
  TrendingUp, Shield, AlertCircle, Fingerprint,
  RefreshCw, Loader2, Smartphone, Building2, Wifi
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

import PageHeader from '../components/timechamp/PageHeader';
import KpiTile from '../components/timechamp/KpiTile';
import Panel from '../components/timechamp/Panel';
import DonutChart from '../components/timechamp/DonutChart';

// Formats a Date object to YYYY-MM-DD
const formatYMD = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Computes date boundaries and label based on viewMode
const computeRangeInfo = (currentDate, viewMode) => {
  const d = new Date(currentDate);

  if (viewMode === 'Week') {
    const dayOfWeek = d.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - distanceToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startStr = formatYMD(monday);
    const endStr = formatYMD(sunday);

    const startLabel = monday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    const endLabel = sunday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });

    return {
      startDate: startStr,
      endDate: endStr,
      date: formatYMD(d),
      label: `${startLabel} – ${endLabel}`,
      subtitle: `Weekly view (${startLabel} – ${endLabel})`,
      isToday: false,
    };
  }

  if (viewMode === 'Month') {
    const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);

    const startStr = formatYMD(startOfMonth);
    const endStr = formatYMD(endOfMonth);
    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    return {
      startDate: startStr,
      endDate: endStr,
      date: formatYMD(d),
      label,
      subtitle: `Monthly view (${label})`,
      isToday: false,
    };
  }

  // Day mode
  const dayStr = formatYMD(d);
  const label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  const isToday = formatYMD(new Date()) === dayStr;

  return {
    startDate: dayStr,
    endDate: dayStr,
    date: dayStr,
    label,
    subtitle: isToday ? 'Today' : label,
    isToday,
  };
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('Day');

  const rangeInfo = useMemo(() => computeRangeInfo(currentDate, viewMode), [currentDate, viewMode]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        viewMode,
        date: rangeInfo.date,
        startDate: rangeInfo.startDate,
        endDate: rangeInfo.endDate,
      });
      const res = await api.get(`/admin/dashboard?${params.toString()}`);
      setData(res.data.data);
    } catch (err) {
      console.error('Error loading admin dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [rangeInfo, viewMode]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Real-time live sync on socket updates
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      const todayStr = formatYMD(new Date());
      if (rangeInfo.date === todayStr || viewMode !== 'Day') {
        fetchDashboard();
      }
    };
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
    };
  }, [socket, rangeInfo.date, viewMode, fetchDashboard]);

  const handlePrevDate = () => {
    const d = new Date(currentDate);
    if (viewMode === 'Week') {
      d.setDate(d.getDate() - 7);
    } else if (viewMode === 'Month') {
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setCurrentDate(d);
  };

  const handleNextDate = () => {
    const d = new Date(currentDate);
    if (viewMode === 'Week') {
      d.setDate(d.getDate() + 7);
    } else if (viewMode === 'Month') {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDate(d);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: ClipboardList },
    { id: 'leaves', label: 'Leave Requests', icon: Calendar, badge: data?.pendingLeaveRequests ? `${data.pendingLeaveRequests}` : null, badgeClass: 'bg-amber-500/20 text-amber-300' },
    { id: 'settings', label: 'System Settings', icon: Settings },
  ];

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'employees') navigate('/employees');
    if (tabId === 'attendance') navigate('/attendance');
    if (tabId === 'leaves') navigate('/leave-requests');
    if (tabId === 'settings') navigate('/attendance-method');
  };

  // Donut chart dataset
  const donutData = useMemo(() => {
    if (!data) return [];
    const present = data.checkedInToday || 0;
    const absent = data.absentToday || 0;
    const onLeave = data.onLeaveToday || 0;
    const missingLogs = data.missingDailyLogs || 0;

    return [
      { name: 'Present & Checked In', value: present, color: '#10b981', key: 'present' },
      { name: 'Absent', value: absent, color: '#f43f5e', key: 'absent' },
      { name: 'On Approved Leave', value: onLeave, color: '#f59e0b', key: 'leave' },
      { name: 'Missing Work Logs', value: missingLogs, color: '#8b5cf6', key: 'missing_logs' },
    ];
  }, [data]);

  const handleDonutItemClick = (item) => {
    if (!item) return;
    const targetDate = rangeInfo.date;
    const name = (item.name || '').toLowerCase();

    if (name.includes('present') || name.includes('checked in')) {
      navigate(`/attendance?date=${targetDate}&filter=attended`);
    } else if (name.includes('absent')) {
      navigate(`/attendance?date=${targetDate}&filter=not_attended`);
    } else if (name.includes('leave')) {
      navigate('/leave-requests?status=approved');
    } else if (name.includes('missing')) {
      navigate(`/attendance?date=${targetDate}&filter=missing_logs`);
    }
  };

  // Attendance 14-day trend data from real DB records
  const trendData = useMemo(() => {
    if (data?.trendData && data.trendData.length > 0) {
      return data.trendData;
    }
    return [];
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Loader2 className="animate-spin text-sky-400" size={36} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      {/* ── Sub-Header & Date Controls ── */}
      <PageHeader
        title="Admin Overview"
        subtitle="Workforce monitoring, real-time presence tracking, and system dispatch"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        date={currentDate}
        dateText={rangeInfo.label}
        onPrevDate={handlePrevDate}
        onNextDate={handleNextDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        badgeText={`Active Mode: ${data?.activeAttendanceMethod?.replace('_', ' ').toUpperCase() || 'QR CODE'}`}
        rightActions={
          <button
            id="admin-refresh-btn"
            onClick={fetchDashboard}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm"
            title="Refresh statistics"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {/* ── 7 KPI Tile Ribbon (TimeChamp style) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <KpiTile
          icon={Users}
          label="Total Employees"
          value={data?.totalEmployees}
          variant="blue"
          subtext="Headcount"
          onClick={() => navigate('/employees')}
        />
        <KpiTile
          icon={UserCheck}
          label={rangeInfo.isToday ? 'Checked In Today' : 'Checked In'}
          value={data?.checkedInToday}
          variant="green"
          subtext={rangeInfo.isToday ? 'On Duty' : rangeInfo.subtitle}
          onClick={() => navigate(`/attendance?date=${rangeInfo.date}&filter=attended`)}
        />
        <KpiTile
          icon={AlertCircle}
          label={rangeInfo.isToday ? 'Absent Today' : 'Absent'}
          value={data?.absentToday}
          variant="red"
          subtext="Unmarked"
          onClick={() => navigate(`/attendance?date=${rangeInfo.date}&filter=not_attended`)}
        />
        <KpiTile
          icon={Calendar}
          label={rangeInfo.isToday ? 'On Leave Today' : 'On Leave'}
          value={data?.onLeaveToday}
          variant="amber"
          subtext="Leaves"
          onClick={() => navigate('/leave-requests?status=approved')}
        />
        <KpiTile
          icon={ClipboardList}
          label="Pending Leaves"
          value={data?.pendingLeaveRequests}
          variant="amber"
          subtext="Requires Review"
          onClick={() => navigate('/leave-requests?status=pending')}
        />
        <KpiTile
          icon={Fingerprint}
          label="Pending Devices"
          value={data?.pendingDeviceApprovals}
          variant="purple"
          subtext="Hardware"
          onClick={() => navigate('/device-requests')}
        />
        <KpiTile
          icon={AlertCircle}
          label="Missing Daily Logs"
          value={data?.missingDailyLogs}
          variant="red"
          subtext="Incomplete"
          onClick={() => navigate(`/attendance?date=${rangeInfo.date}&filter=missing_logs`)}
        />
      </div>

      {/* ── Two-Column Analytics Area ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Donut Chart Split */}
        <div className="lg:col-span-5 flex flex-col">
          <Panel
            title={rangeInfo.isToday ? "Today's Attendance Split" : 'Attendance Split'}
            subtitle={`Workforce activity & presence ratio for ${rangeInfo.label}`}
            badge={rangeInfo.isToday ? 'Live' : viewMode}
            className="h-full"
          >
            <DonutChart
              data={donutData}
              centerValue={String(data?.totalEmployees || 0)}
              centerLabel="Employees"
              onItemClick={handleDonutItemClick}
            />
          </Panel>
        </div>

        {/* Right: Quick Dispatch Actions Grid */}
        <div className="lg:col-span-7 flex flex-col">
          <Panel
            title="Quick Dispatch & System Actions"
            subtitle="Immediate shortcuts for daily workforce management"
            className="h-full"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 h-full">
              {[
                { label: 'Manage Employees', desc: 'Accounts & profiles', icon: Users, href: '/employees', color: 'text-sky-400', bg: 'hover:border-sky-500/50 hover:bg-sky-500/5' },
                { label: 'Attendance Records', desc: 'Daily punch logs', icon: ClipboardList, href: '/attendance', color: 'text-emerald-400', bg: 'hover:border-emerald-500/50 hover:bg-emerald-500/5' },
                { label: 'Leave Requests', desc: `${data?.pendingLeaveRequests || 0} pending review`, icon: Calendar, href: '/leave-requests', color: 'text-amber-400', bg: 'hover:border-amber-500/50 hover:bg-amber-500/5' },
                { label: 'Device Approvals', desc: `${data?.pendingDeviceApprovals || 0} pending hardware`, icon: Smartphone, href: '/device-requests', color: 'text-purple-400', bg: 'hover:border-purple-500/50 hover:bg-purple-500/5' },
                { label: 'Manager Permissions', desc: 'Roles & overrides', icon: Shield, href: '/manager-permissions', color: 'text-indigo-400', bg: 'hover:border-indigo-500/50 hover:bg-indigo-500/5' },
                { label: 'Attendance Mode', desc: 'QR, WiFi & Biometrics', icon: Settings, href: '/attendance-method', color: 'text-rose-400', bg: 'hover:border-rose-500/50 hover:bg-rose-500/5' },
              ].map((act) => (
                <button
                  key={act.href}
                  type="button"
                  onClick={() => navigate(act.href)}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 hover:shadow-sm text-left transition-all duration-200 cursor-pointer flex flex-col justify-between"
                >
                  <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-3 shadow-sm">
                    <act.icon size={18} className={act.color} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 tracking-wide">{act.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{act.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Attendance Trend (Last 14 Days) Chart ── */}
      <Panel
        title="Attendance Trend (Last 14 Days)"
        subtitle={`Workforce check-in progression up to ${rangeInfo.label}`}
        badge="Historical"
      >
        <div className="w-full h-64 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={[0, 'dataMax + 4']} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const val = payload[0].value;
                    const cap = payload[0].payload.capacity;
                    const pct = cap ? Math.round((val / cap) * 100) : 0;
                    return (
                      <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-lg text-xs space-y-1">
                        <p className="font-semibold text-slate-900">{label}</p>
                        <p className="text-sky-600 font-bold">Checked In: {val} employees</p>
                        <p className="text-slate-500 text-[10px]">Turnout Rate: {pct}%</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="present"
                stroke="#0284c7"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#attendanceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
