import { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, Calendar, ClipboardList, Shield,
  QrCode, Wifi, MapPin, Fingerprint, Settings, ScrollText,
  TrendingUp, LogOut, Menu, X, ChevronRight, BarChart3,
  UserCog, GitBranch, Building2, Smartphone, Monitor
} from 'lucide-react';

const navSections = [
  {
    label: 'Overview',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'nav-dashboard' },
      { path: '/audit-logs', label: 'Audit Logs', icon: ScrollText, id: 'nav-audit' },
      { path: '/reports', label: 'Reports', icon: BarChart3, id: 'nav-reports' },
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
      { path: '/device-requests', label: 'Device Requests', icon: Smartphone, id: 'nav-device-requests' },
      { path: '/location-requests', label: 'Location Requests', icon: MapPin, id: 'nav-location-requests' },
      { path: '/leave-requests', label: 'Leave Requests', icon: Calendar, id: 'nav-leaves' },
      { path: '/manual-attendance', label: 'Manual Requests', icon: ClipboardList, id: 'nav-manual' },
      { path: '/performance-notes', label: 'Performance Notes', icon: TrendingUp, id: 'nav-performance' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/attendance-method', label: 'Attendance Method', icon: Settings, id: 'nav-method' },
      { path: '/qr-code', label: 'QR Code', icon: QrCode, id: 'nav-qr' },
      { path: '/wifi-settings', label: 'WiFi / IP Settings', icon: Wifi, id: 'nav-wifi' },
      { path: '/office-locations', label: 'Office Locations', icon: Building2, id: 'nav-locations' },
      { path: '/geofence', label: 'Geofence (Legacy)', icon: MapPin, id: 'nav-geofence' },
    ],
  },
];

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Spheronix</p>
            <p className="text-slate-500 text-xs">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <span className="badge-danger text-xs">Admin</span>
          </div>
        </div>
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
                    className={active ? 'nav-item-active' : 'nav-item'}
                  >
                    <item.icon size={16} />
                    <span className="text-xs">{item.label}</span>
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
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-slate-800 border-r border-slate-700 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-slate-800 w-64 h-full">
            <div className="flex items-center justify-end p-3 border-b border-slate-700">
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-slate-400"><X size={18} /></button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
          <button id="admin-menu-btn" onClick={() => setSidebarOpen(true)} className="p-2 text-slate-400">
            <Menu size={20} />
          </button>
          <span className="text-white font-semibold text-sm">Admin Panel</span>
          <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.[0]?.toUpperCase()}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
