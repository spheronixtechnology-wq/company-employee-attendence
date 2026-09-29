import { useState, useEffect, useCallback } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../lib/api';
import companyLogo from '../images/company logo.png';
import {
  LayoutDashboard, ClipboardList, Calendar, FileText,
  LogOut, Menu, X, Smartphone, MapPin, Users,
  Settings, Wifi, Building2, Clock, UserCircle2, ShieldAlert
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'nav-dashboard' },
  { path: '/team/members', label: 'Team Members', icon: Users, id: 'nav-members' },
  { path: '/team/attendance', label: 'Team Attendance', icon: ClipboardList, id: 'nav-attendance' },
  { path: '/session-reactivations', label: 'Session Reactivations', icon: ShieldAlert, id: 'nav-session-reactivations' },
  { path: '/team/overtime', label: 'Overtime', icon: Clock, id: 'nav-overtime' },
  { path: '/team/daily-logs', label: 'Daily Logs', icon: FileText, id: 'nav-logs' },
  { path: '/team/leave-requests', label: 'Leave Requests', icon: Calendar, id: 'nav-leaves' },
  { path: '/device-requests', label: 'Device Requests', icon: Smartphone, id: 'nav-device-requests' },
  { path: '/attendance-method', label: 'Attendance Method', icon: Settings, id: 'nav-method' },
  { path: '/wifi-settings', label: 'WiFi / IP Settings', icon: Wifi, id: 'nav-wifi' },
  { path: '/office-locations', label: 'Office Locations', icon: Building2, id: 'nav-locations' },
  { path: '/profile', label: 'My Profile', icon: UserCircle2, id: 'nav-profile' },
];

export default function ManagerLayout({ children }) {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [manualPendingCount, setManualPendingCount] = useState(0);
  const [pendingReactivationsCount, setPendingReactivationsCount] = useState(0);

  // Fetch pending manual attendance request count
  const fetchManualPending = useCallback(() => {
    api.get('/manager/team/attendance?date=' + new Date().toISOString().split('T')[0])
      .then(res => {
        const records = res.data?.data?.attendance || [];
        const count = records.filter(r =>
          r.status === 'manual_pending' || (r.manualRequest && r.manualRequest.status === 'pending')
        ).length;
        setManualPendingCount(count);
      })
      .catch(() => {});
  }, []);

  // Fetch pending session reactivation request count
  const fetchPendingReactivations = useCallback(() => {
    api.get('/manager/session-reactivations')
      .then(res => {
        setPendingReactivationsCount(res.data?.data?.kpis?.pendingCount || 0);
      })
      .catch(() => {});
  }, []);

  // Poll unread notification count (new team requests etc.) every 30s + on tab focus
  const fetchUnread = useCallback(() => {
    api.get('/manager/notifications/unread-count')
      .then(res => setUnreadCount(res.data.data.count || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUnread();
    fetchManualPending();
    fetchPendingReactivations();
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUnread();
        fetchManualPending();
        fetchPendingReactivations();
      }
    }, 30000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUnread();
        fetchManualPending();
        fetchPendingReactivations();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchUnread, fetchManualPending, fetchPendingReactivations, location.pathname]);

  // Real-time WebSocket listener for instant badge counter bumps and clears
  useEffect(() => {
    if (!socket) return;
    const onNewEvent = () => fetchUnread();
    const onManualRequest = () => fetchManualPending();
    socket.on('notification:new', onNewEvent);
    socket.on('device:request_created', onNewEvent);
    socket.on('device:request_resolved', onNewEvent);
    socket.on('leave:request_created', onNewEvent);
    socket.on('leave:request_resolved', onNewEvent);
    // Instantly bump the Team Attendance badge when a manual request comes in
    socket.on('attendance:manual_request_created', onManualRequest);
    socket.on('reactivation:requested', fetchPendingReactivations);
    socket.on('attendance:update', fetchPendingReactivations);
    return () => {
      socket.off('notification:new', onNewEvent);
      socket.off('device:request_created', onNewEvent);
      socket.off('device:request_resolved', onNewEvent);
      socket.off('leave:request_created', onNewEvent);
      socket.off('leave:request_resolved', onNewEvent);
      socket.off('attendance:manual_request_created', onManualRequest);
      socket.off('reactivation:requested', fetchPendingReactivations);
      socket.off('attendance:update', fetchPendingReactivations);
    };
  }, [socket, fetchUnread, fetchManualPending, fetchPendingReactivations]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col relative">
      {/* ── Fixed Ultra-Premium Glass Floating Navbar ── */}
      <header className="sticky top-0 z-40 border-b border-emerald-200/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(240,253,244,0.85)_100%)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_44px_-14px_rgba(16,185,129,0.55),0_6px_18px_-6px_rgba(16,185,129,0.3)] transition-all">
        <div className="mx-auto flex h-[84px] max-w-[1600px] items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          
          {/* Brand */}
          <Link to="/dashboard" className="group flex shrink-0 items-center gap-2.5">
            <img
              src={companyLogo}
              alt="Spheronix"
              className="h-14 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.04]"
            />
            <span className="hidden shrink-0 items-center rounded-full bg-violet-600/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-violet-700 ring-1 ring-violet-200/70 sm:inline-flex">
              Manager
            </span>
          </Link>

          {/* Desktop Navigation Links (Full on xl+) */}
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-3.5 -my-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:flex">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              const showBadge = (unreadCount > 0 && item.id === 'nav-device-requests') ||
                                (manualPendingCount > 0 && item.id === 'nav-attendance') ||
                                (pendingReactivationsCount > 0 && item.id === 'nav-session-reactivations');
              const badgeVal = item.id === 'nav-session-reactivations'
                ? pendingReactivationsCount
                : item.id === 'nav-attendance'
                ? manualPendingCount
                : unreadCount;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  id={item.id}
                  className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] tracking-[-0.01em] transition-all duration-200 ${
                    active
                      ? 'bg-white font-semibold text-rose-700 shadow-[0_8px_24px_-4px_rgba(244,63,94,0.6),0_3px_10px_-2px_rgba(244,63,94,0.35)] ring-1 ring-rose-300/80'
                      : 'font-medium text-slate-500 hover:bg-white/80 hover:text-rose-600 hover:shadow-[0_4px_16px_-4px_rgba(244,63,94,0.45)]'
                  }`}
                >
                  <item.icon size={14} />
                  <span>{item.label}</span>
                  {showBadge && (
                    <span id={item.id === 'nav-session-reactivations' ? 'reactivation-badge' : 'manager-unread-badge'} className={`ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow-sm ${
                      item.id === 'nav-session-reactivations' ? 'bg-amber-500 animate-pulse' : 'bg-gradient-to-r from-rose-500 to-orange-400'
                    }`}>
                      {badgeVal > 9 ? '9+' : badgeVal}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Medium screen navigation fallback (md to xl) */}
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-3.5 -my-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex xl:hidden">
            {navItems.slice(0, 7).map((item) => {
              const active = location.pathname === item.path;
              const showBadge = (unreadCount > 0 && item.id === 'nav-device-requests') ||
                                (manualPendingCount > 0 && item.id === 'nav-attendance') ||
                                (pendingReactivationsCount > 0 && item.id === 'nav-session-reactivations');
              const badgeVal = item.id === 'nav-session-reactivations'
                ? pendingReactivationsCount
                : item.id === 'nav-attendance'
                ? manualPendingCount
                : unreadCount;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  id={`md-${item.id}`}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] tracking-[-0.01em] transition-all duration-200 ${
                    active
                      ? 'bg-white font-semibold text-rose-700 shadow-[0_4px_16px_-3px_rgba(244,63,94,0.5)] ring-1 ring-rose-200'
                      : 'font-medium text-slate-500 hover:bg-white/80 hover:text-rose-600 hover:shadow-[0_4px_12px_-3px_rgba(244,63,94,0.35)]'
                  }`}
                >
                  <item.icon size={14} />
                  <span>{item.label}</span>
                  {showBadge && (
                    <span className={`ml-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow-sm ${
                      item.id === 'nav-session-reactivations' ? 'bg-amber-500 animate-pulse' : 'bg-gradient-to-r from-rose-500 to-orange-400'
                    }`}>
                      {badgeVal > 9 ? '9+' : badgeVal}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right: Profile chip + controls */}
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:border-l sm:border-slate-200/70 sm:pl-4">
            <Link
              to="/profile"
              id="nav-profile-chip"
              className="hidden items-center gap-2.5 rounded-full bg-white/70 py-1 pl-1 pr-3.5 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.18)] ring-1 ring-white/90 backdrop-blur sm:flex hover:bg-white hover:shadow-[0_4px_14px_-4px_rgba(109,40,217,0.25)] transition-all"
            >
              <div className="relative">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-8 w-8 rounded-full object-cover shadow-[0_3px_10px_-2px_rgba(139,92,246,0.55)] ring-2 ring-white"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-rose-400 text-[11px] font-bold text-white shadow-[0_3px_10px_-2px_rgba(139,92,246,0.55)] ring-2 ring-white"
                  style={{ display: user?.avatarUrl ? 'none' : 'flex' }}
                >
                  {user?.name?.[0]?.toUpperCase() || 'M'}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>
              <div className="leading-tight">
                <p className="text-[11.5px] font-semibold text-slate-800">{user?.name}</p>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-violet-500">{user?.teamId?.name || 'Manager'}</p>
              </div>
            </Link>

            {/* Mobile Hamburger Toggle */}
            <button
              id="manager-menu-btn"
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-white/80 hover:text-violet-700 hover:shadow-[0_2px_10px_-4px_rgba(109,40,217,0.3)] md:hidden"
              aria-label="Toggle Navigation Menu"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer ── */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex">
          <div className="bg-white border-r border-slate-200 w-72 h-full flex flex-col p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <img src={companyLogo} alt="Spheronix" className="h-14 w-auto max-h-14 object-contain" />
                <span className="text-[10px] font-semibold text-violet-700 uppercase tracking-wider bg-violet-50 px-1.5 py-0.5 rounded-full border border-violet-200">
                  Manager
                </span>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            {/* Profile — clickable → /profile */}
            <Link
              to="/profile"
              id="drawer-nav-profile"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 py-4 border-b border-slate-200 hover:bg-violet-50/50 rounded-xl px-2 transition-all -mx-2"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-violet-100 shadow-sm"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm"
                style={{ display: user?.avatarUrl ? 'none' : 'flex' }}
              >
                {user?.name?.[0]?.toUpperCase() || 'M'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{user?.name}</p>
                <p className="text-xs text-violet-600 font-medium">View Profile →</p>
              </div>
            </Link>

            {/* Nav */}
            <nav className="flex-1 py-3 overflow-y-auto space-y-1">
              {navItems.map((item) => {
                const active = location.pathname === item.path;
                const showBadge = (unreadCount > 0 && item.id === 'nav-device-requests') ||
                                  (manualPendingCount > 0 && item.id === 'nav-attendance') ||
                                  (pendingReactivationsCount > 0 && item.id === 'nav-session-reactivations');
                const badgeVal = item.id === 'nav-session-reactivations'
                  ? pendingReactivationsCount
                  : item.id === 'nav-attendance'
                  ? manualPendingCount
                  : unreadCount;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    id={`drawer-${item.id}`}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      active
                        ? 'bg-violet-50 text-violet-700 font-semibold border border-violet-200'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <item.icon size={16} />
                      <span>{item.label}</span>
                    </div>
                    {showBadge && (
                      <span className={`min-w-[1.1rem] h-4 px-1 flex items-center justify-center rounded-full text-white text-[9px] font-bold ${
                        item.id === 'nav-session-reactivations' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
                      }`}>
                        {badgeVal > 9 ? '9+' : badgeVal}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Logout */}
            <div className="pt-3 border-t border-slate-200">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      {/* ── Page Content ── */}
      <main className="flex-1 w-full pb-16">
        {children}
      </main>

      {/* ── Floating Bottom-Right Logout Button ── */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          id="floating-manager-logout-btn"
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-rose-200 text-rose-600 font-semibold text-xs shadow-[0_8px_25px_-4px_rgba(244,63,94,0.5),0_2px_10px_-2px_rgba(244,63,94,0.25)] hover:bg-rose-50 hover:border-rose-300 hover:shadow-[0_12px_30px_-4px_rgba(244,63,94,0.65)] transition-all duration-200 group active:scale-95"
          title="Log out of Manager account"
        >
          <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 group-hover:bg-rose-200 transition-colors">
            <LogOut size={13} />
          </div>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
