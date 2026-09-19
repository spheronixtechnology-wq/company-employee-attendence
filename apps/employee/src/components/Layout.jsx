import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, FileText, Calendar, Smartphone,
  ClipboardList, User, LogOut, Menu, X, ChevronRight, Loader2, ShieldAlert, Clock
} from 'lucide-react';
import api from '../lib/api';
import companyLogo from '../images/company logo.png';

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'nav-dashboard' },
  { path: '/overtime', label: 'Overtime', icon: Clock, id: 'nav-overtime' },
  { path: '/daily-log', label: 'Daily Log', icon: FileText, id: 'nav-daily-log' },
  { path: '/leave', label: 'Leave', icon: Calendar, id: 'nav-leave' },
  { path: '/attendance', label: 'Attendance', icon: ClipboardList, id: 'nav-attendance' },
  { path: '/devices', label: 'My Devices', icon: Smartphone, id: 'nav-devices' },
  { path: '/manual-attendance', label: 'Manual Request', icon: ClipboardList, id: 'nav-manual' },
  { path: '/profile', label: 'Profile', icon: User, id: 'nav-profile' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [checkingDevice, setCheckingDevice] = useState(true);

  useEffect(() => {
    const checkDevice = async () => {
      try {
        const res = await api.get('/employee/dashboard');
        setDeviceStatus(res.data?.data?.deviceStatus);
      } catch (error) {
        console.error(error);
      } finally {
        setCheckingDevice(false);
      }
    };
    checkDevice();
  }, [location.pathname]);

  if (checkingDevice) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="animate-spin text-sky-600" size={40} />
      </div>
    );
  }

  const isMobile = isMobileDevice();
  if (isMobile && deviceStatus?.statusType === 'registered_other_device') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <ShieldAlert size={64} className="text-rose-500 mb-6" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-600 mb-8 max-w-sm">
          This mobile is not registered for this account please login with your registered device.
        </p>
        <button
          onClick={() => navigate('/device-onboarding?type=replacement')}
          className="btn-primary w-full max-w-xs mb-4"
        >
          Request Device Replacement
        </button>
        <button
          onClick={async () => { await logout(); navigate('/login'); }}
          className="btn-ghost w-full max-w-xs"
        >
          <LogOut size={18} className="inline mr-2" /> Logout
        </button>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const currentNav = navItems.find(n => n.path === location.pathname);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col relative">
      {/* ── Top Navbar (ultra-premium) ── */}
      <header className="sticky top-0 z-40 border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(248,250,255,0.86)_100%)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_44px_-16px_rgba(2,132,199,0.45),0_6px_18px_-8px_rgba(2,132,199,0.22)]">
        <div className="mx-auto flex h-[84px] max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <Link to="/dashboard" className="group flex shrink-0 items-center gap-2.5">
            <img
              src={companyLogo}
              alt="Spheronix"
              className="h-14 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.04]"
            />
            <span className="hidden shrink-0 items-center rounded-full bg-sky-600/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-sky-700 ring-1 ring-sky-200/70 sm:inline-flex">
              Employee
            </span>
          </Link>

          <span className="hidden h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-slate-300/70 to-transparent lg:block" />

          {/* Desktop Nav — text-only, single line, never wraps */}
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-3.5 -my-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  id={item.id}
                  className={`relative flex shrink-0 items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] tracking-[-0.01em] transition-all duration-200 ${
                    active
                      ? 'bg-white font-semibold text-sky-700 shadow-[0_8px_22px_-6px_rgba(2,132,199,0.55),0_3px_8px_-2px_rgba(2,132,199,0.3)] ring-1 ring-sky-200/80'
                      : 'font-medium text-slate-500 hover:bg-white/70 hover:text-sky-700 hover:shadow-[0_4px_14px_-6px_rgba(2,132,199,0.4)]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Profile chip + controls */}
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:border-l sm:border-slate-200/70 sm:pl-4">
            <Link to="/profile" className="hidden items-center gap-3 rounded-full bg-white/70 py-1.5 pl-1.5 pr-5 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.18)] ring-1 ring-white/90 backdrop-blur transition-transform hover:scale-105 active:scale-95 sm:flex">
              <div className="relative">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-10 w-10 rounded-full object-cover shadow-[0_3px_10px_-2px_rgba(2,132,199,0.5)] ring-2 ring-white"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 via-indigo-500 to-violet-500 text-[14px] font-bold text-white shadow-[0_3px_10px_-2px_rgba(2,132,199,0.5)] ring-2 ring-white">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>
              <div className="leading-tight">
                <p className="text-[14px] font-semibold text-slate-800">{user?.name}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-600">{user?.teamId?.name || 'Employee'}</p>
              </div>
            </Link>

              {/* Mobile Hamburger Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-white/80 hover:text-sky-700 hover:shadow-[0_2px_10px_-4px_rgba(2,132,199,0.3)] lg:hidden"
                aria-label="Toggle Navigation Menu"
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer ── */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex">
          <div className="bg-white border-r border-slate-200 w-72 h-full flex flex-col p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <img
                  src={companyLogo}
                  alt="Spheronix"
                  className="h-10 w-auto object-contain"
                />
                <span className="text-[10px] font-semibold text-sky-700 uppercase tracking-wider bg-sky-50 px-1.5 py-0.5 rounded-full border border-sky-200">
                  Employee
                </span>
              </div>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            {/* User Profile in Drawer */}
            <div className="flex items-center gap-3 py-4 border-b border-slate-200">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-sky-100 shadow-sm"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.teamId?.name || 'Employee'}</p>
              </div>
            </div>

            {/* Links */}
            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    id={`mobile-${item.id}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? 'bg-sky-50 text-sky-700 font-semibold border border-sky-200'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Logout in Drawer */}
            <div className="pt-3 border-t border-slate-200">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* ── Page Content ── */}
      <main className="flex-1 w-full pb-16">
        {children}
      </main>

      {/* ── Floating Bottom-Right Logout Button ── */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          id="floating-logout-btn"
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-rose-200 text-rose-600 font-semibold text-xs shadow-lg hover:bg-rose-50 hover:border-rose-300 hover:shadow-xl transition-all duration-200 group active:scale-95"
          title="Log out of your account"
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
