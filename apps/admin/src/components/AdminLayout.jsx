import { useState, useEffect, useCallback } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../lib/api';
import companyLogo from '../images/company logo.png';
import {
  LayoutDashboard, Users, Calendar, ClipboardList, Shield,
  QrCode, Wifi, MapPin, Fingerprint, Settings, ScrollText,
  TrendingUp, LogOut, Menu, X, ChevronRight, BarChart3,
  UserCog, GitBranch, Building2, Smartphone, Monitor, Clock, UserCircle2
} from 'lucide-react';

const navSections = [
  {
    label: 'Overview',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'nav-dashboard' },
    ],
  },
  {
    label: 'People',
    items: [
      { path: '/employees', label: 'Employees', icon: Users, id: 'nav-employees' },
      { path: '/teams', label: 'Teams', icon: GitBranch, id: 'nav-teams' },
      { path: '/manager-permissions', label: 'Manager Permissions', icon: Shield, id: 'nav-permissions' },
    ],
  },
  {
    label: 'Attendance',
    items: [
      { path: '/attendance', label: 'Attendance Records', icon: ClipboardList, id: 'nav-attendance' },
      { path: '/overtime', label: 'Overtime Oversight', icon: Clock, id: 'nav-overtime' },
      { path: '/device-requests', label: 'Device Requests', icon: Smartphone, id: 'nav-device-requests' },
      { path: '/leave-requests', label: 'Leave Requests', icon: Calendar, id: 'nav-leaves' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/attendance-method', label: 'Attendance Method', icon: Settings, id: 'nav-method' },
      { path: '/wifi-settings', label: 'WiFi / IP Settings', icon: Wifi, id: 'nav-wifi' },
      { path: '/office-locations', label: 'Office Locations', icon: Building2, id: 'nav-locations' },
      { path: '/profile', label: 'My Profile', icon: UserCircle2, id: 'nav-profile' },
    ],
  },
];

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingDevicesCount, setPendingDevicesCount] = useState(0);

  const fetchPendingCounts = useCallback(async () => {
    try {
      const res = await api.get('/admin/device-requests?status=pending');
      const count = res.data?.data?.counts?.pending ?? (res.data?.data?.requests?.length || 0);
      setPendingDevicesCount(count);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPendingCounts();
  }, [fetchPendingCounts]);

  // Real-time socket updates for badge
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchPendingCounts();
    socket.on('device:request_created', handleUpdate);
    socket.on('device:request_resolved', handleUpdate);
    return () => {
      socket.off('device:request_created', handleUpdate);
      socket.off('device:request_resolved', handleUpdate);
    };
  }, [socket, fetchPendingCounts]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <img src={companyLogo} alt="Spheronix" className="h-14 w-auto object-contain" />
          <span className="text-slate-400 text-xs font-semibold">Admin</span>
        </div>
      </div>

      {/* User Info — clickable → /profile */}
      <div className="p-4 border-b border-slate-700">
        <Link
          to="/profile"
          id="admin-profile-link"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-3 rounded-xl p-2 -m-2 hover:bg-slate-700/60 transition-all group"
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-red-400/40"
            />
          ) : (
            <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-slate-400 text-[10px] font-medium group-hover:text-red-400 transition-colors">View Profile →</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin space-y-4">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-3 mb-1.5">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    id={item.id}
                    onClick={() => setSidebarOpen(false)}
                    className={`${active ? 'nav-item-active' : 'nav-item'} flex items-center justify-between`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <item.icon size={16} />
                      <span className="text-xs truncate">{item.label}</span>
                    </div>
                    {item.id === 'nav-device-requests' && pendingDevicesCount > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
                        {pendingDevicesCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-slate-700">
        <button id="admin-logout-btn" onClick={handleLogout} className="nav-item w-full text-danger-400 hover:bg-danger-500/10">
          <LogOut size={16} /> <span className="text-xs">Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col relative">
      {/* ── Top Navbar (ultra-premium) ── */}
      <header className="sticky top-0 z-40 border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(250,248,255,0.86)_100%)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_44px_-16px_rgba(79,42,178,0.5),0_6px_18px_-8px_rgba(79,42,178,0.25)]">
        <div className="mx-auto flex h-[84px] max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <Link to="/dashboard" className="group flex shrink-0 items-center gap-2.5">
            <img
              src={companyLogo}
              alt="Spheronix"
              className="h-14 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.04]"
            />
            <span className="hidden shrink-0 items-center rounded-full bg-violet-600/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-violet-700 ring-1 ring-violet-200/70 sm:inline-flex">
              Admin
            </span>
          </Link>

          <span className="hidden h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-slate-300/70 to-transparent xl:block" />

          {/* Desktop Nav — text-only, single line, never wraps */}
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-3.5 -my-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:flex">
            {navSections.flatMap(s => s.items).map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  id={item.id}
                  className={`relative flex shrink-0 items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] tracking-[-0.01em] transition-all duration-200 ${
                    active
                      ? 'bg-white font-semibold text-violet-700 shadow-[0_8px_22px_-6px_rgba(109,40,217,0.55),0_3px_8px_-2px_rgba(109,40,217,0.3)] ring-1 ring-violet-200/80'
                      : 'font-medium text-slate-500 hover:bg-white/70 hover:text-violet-700 hover:shadow-[0_4px_14px_-6px_rgba(109,40,217,0.4)]'
                  }`}
                >
                  {item.label}
                  {item.id === 'nav-device-requests' && pendingDevicesCount > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-1 text-[9px] font-bold text-white shadow-sm">
                      {pendingDevicesCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Medium screen nav fallback */}
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-3.5 -my-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex xl:hidden">
            {[
              { path: '/dashboard', label: 'Dashboard', id: 'nav-md-dashboard' },
              { path: '/employees', label: 'Employees', id: 'nav-md-employees' },
              { path: '/attendance', label: 'Attendance', id: 'nav-md-attendance' },
              { path: '/device-requests', label: 'Devices', id: 'nav-md-devices' },
              { path: '/leave-requests', label: 'Leaves', id: 'nav-md-leaves' },
              { path: '/attendance-method', label: 'Settings', id: 'nav-md-settings' },
            ].map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  id={item.id}
                  className={`flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] tracking-[-0.01em] transition-all duration-200 ${
                    active
                      ? 'bg-white font-semibold text-violet-700 shadow-[0_2px_12px_-3px_rgba(109,40,217,0.35)] ring-1 ring-violet-100'
                      : 'font-medium text-slate-500 hover:bg-white/70 hover:text-violet-700'
                  }`}
                >
                  {item.label}
                  {item.path === '/device-requests' && pendingDevicesCount > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-1 text-[9px] font-bold text-white shadow-sm">
                      {pendingDevicesCount}
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
              id="admin-navbar-profile-chip"
              className="hidden items-center gap-2.5 rounded-full bg-white/70 py-1 pl-1 pr-3.5 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.18)] ring-1 ring-white/90 backdrop-blur sm:flex hover:bg-white hover:shadow-[0_4px_14px_-4px_rgba(109,40,217,0.22)] transition-all"
            >
              <div className="relative">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-8 w-8 rounded-full object-cover shadow-[0_3px_10px_-2px_rgba(139,92,246,0.55)] ring-2 ring-white"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-rose-400 text-[11px] font-bold text-white shadow-[0_3px_10px_-2px_rgba(139,92,246,0.55)] ring-2 ring-white">
                    {user?.name?.[0]?.toUpperCase() || 'A'}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>
              <div className="leading-tight">
                <p className="text-[11.5px] font-semibold text-slate-800">{user?.name}</p>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-violet-500">Super Admin</p>
              </div>
            </Link>


              {/* Mobile Hamburger Toggle */}
              <button
                id="admin-menu-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-white/80 hover:text-violet-700 hover:shadow-[0_2px_10px_-4px_rgba(109,40,217,0.3)] md:hidden"
                aria-label="Toggle Navigation Menu"
              >
                {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer ── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex">
          <div className="bg-white border-r border-slate-200 w-72 h-full flex flex-col p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <img src={companyLogo} alt="Spheronix" className="h-14 w-auto max-h-14 object-contain" />
                <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                  Admin
                </span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            {/* Nav Sections in Drawer */}
            <nav className="flex-1 py-4 space-y-4 overflow-y-auto">
              {navSections.map((section) => (
                <div key={section.label}>
                  <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                            active
                              ? 'bg-sky-50 text-sky-700 font-semibold border border-sky-200'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <item.icon size={16} />
                            <span>{item.label}</span>
                          </div>
                          {item.id === 'nav-device-requests' && pendingDevicesCount > 0 && (
                            <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              {pendingDevicesCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
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
          <div className="flex-1" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* ── Page Content ── */}
      <main className="flex-1 w-full pb-16">
        {children}
      </main>

      {/* ── Floating Bottom-Right Logout Button ── */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          id="floating-admin-logout-btn"
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-rose-200 text-rose-600 font-semibold text-xs shadow-lg hover:bg-rose-50 hover:border-rose-300 hover:shadow-xl transition-all duration-200 group active:scale-95"
          title="Log out of Admin account"
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
