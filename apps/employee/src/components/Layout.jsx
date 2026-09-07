import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, FileText, Calendar, Bell, Smartphone,
  ClipboardList, User, LogOut, Menu, X, ChevronRight, Loader2, ShieldAlert
} from 'lucide-react';
import api from '../lib/api';

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'nav-dashboard' },
  { path: '/daily-log', label: 'Daily Log', icon: FileText, id: 'nav-daily-log' },
  { path: '/leave', label: 'Leave', icon: Calendar, id: 'nav-leave' },
  { path: '/notifications', label: 'Notifications', icon: Bell, id: 'nav-notifications' },
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
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <Loader2 className="animate-spin text-primary-400" size={40} />
      </div>
    );
  }

  const isMobile = isMobileDevice();
  if (isMobile && deviceStatus?.statusType === 'registered_other_device') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-6 text-center">
        <ShieldAlert size={64} className="text-red-500 mb-6" />
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-slate-400 mb-8 max-w-sm">
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
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Sidebar — Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-800 border-r border-slate-700 flex-shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Spheronix</p>
              <p className="text-slate-500 text-xs">Employee Portal</p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-600 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-slate-400 text-xs truncate">{user?.teamId?.name || 'No Team'}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                id={item.id}
                className={active ? 'nav-item-active' : 'nav-item'}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-slate-700">
          <button
            id="logout-btn"
            onClick={handleLogout}
            className="nav-item w-full text-danger-400 hover:bg-danger-500/10 hover:text-danger-300"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="text-white font-semibold text-sm">{currentNav?.label || 'Portal'}</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-400 hover:text-white"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm">
            <div className="bg-slate-800 w-72 h-full flex flex-col">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <p className="text-white font-semibold">Menu</p>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400">
                  <X size={20} />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      id={`mobile-${item.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className={active ? 'nav-item-active' : 'nav-item'}
                    >
                      <item.icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="p-3 border-t border-slate-700">
                <button onClick={handleLogout} className="nav-item w-full text-danger-400">
                  <LogOut size={18} /> Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden flex items-center justify-around bg-slate-800 border-t border-slate-700 px-2 py-2 flex-shrink-0">
          {navItems.slice(0, 5).map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                id={`bottom-${item.id}`}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${active ? 'text-primary-400' : 'text-slate-500'}`}
              >
                <item.icon size={20} />
                <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
