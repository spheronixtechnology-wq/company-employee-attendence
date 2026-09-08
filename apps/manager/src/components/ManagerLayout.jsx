import { useState, useEffect, useCallback } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../lib/api';
import {
  LayoutDashboard, ClipboardList, Calendar, FileText,
  TrendingUp, LogOut, Menu, X, Smartphone, MapPin, Users
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, id: 'nav-dashboard' },
  { path: '/team/members', label: 'Team Members', icon: Users, id: 'nav-members' },
  { path: '/team/attendance', label: 'Team Attendance', icon: ClipboardList, id: 'nav-attendance' },
  { path: '/team/daily-logs', label: 'Daily Logs', icon: FileText, id: 'nav-logs' },
  { path: '/team/leave-requests', label: 'Leave Requests', icon: Calendar, id: 'nav-leaves' },
  { path: '/team/task-history', label: 'Task History', icon: FileText, id: 'nav-tasks' },
  { path: '/team/performance', label: 'Performance', icon: TrendingUp, id: 'nav-performance' },
  { path: '/device-requests', label: 'Device Requests', icon: Smartphone, id: 'nav-device-requests' },
  { path: '/location-requests', label: 'Location Requests', icon: MapPin, id: 'nav-location-requests' },
];

export default function ManagerLayout({ children }) {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll unread notification count (new team requests etc.) every 30s + on tab focus
  const fetchUnread = useCallback(() => {
    api.get('/manager/notifications/unread-count')
      .then(res => setUnreadCount(res.data.data.count || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUnread();
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') fetchUnread();
    }, 30000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchUnread();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchUnread, location.pathname]);

  // Real-time WebSocket listener for instant badge counter bumps and clears
  useEffect(() => {
    if (!socket) return;
    const onNewEvent = () => fetchUnread();
    socket.on('notification:new', onNewEvent);
    socket.on('device:request_created', onNewEvent);
    socket.on('device:request_resolved', onNewEvent);
    socket.on('leave:request_created', onNewEvent);
    socket.on('leave:request_resolved', onNewEvent);
    return () => {
      socket.off('notification:new', onNewEvent);
      socket.off('device:request_created', onNewEvent);
      socket.off('device:request_resolved', onNewEvent);
      socket.off('leave:request_created', onNewEvent);
      socket.off('leave:request_resolved', onNewEvent);
    };
  }, [socket, fetchUnread]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-slate-800 border-r border-slate-700 flex-shrink-0">
        <div className="p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Spheronix</p>
              <p className="text-slate-500 text-xs">Manager Portal</p>
            </div>
          </div>
        </div>
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-slate-400 text-xs truncate">{user?.teamId?.name || 'Manager'}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-thin">
          {navItems.map(item => {
            const active = location.pathname === item.path;
            const showBadge = unreadCount > 0 && item.id === 'nav-device-requests';
            return (
              <Link key={item.path} to={item.path} id={item.id} className={active ? 'nav-item-active' : 'nav-item'}>
                <span className="relative flex items-center gap-2">
                  <item.icon size={17} /> {item.label}
                  {showBadge && (
                    <span id="manager-unread-badge" className="ml-auto min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full bg-danger-500 text-white text-[10px] font-bold">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <button id="manager-logout-btn" onClick={handleLogout} className="nav-item w-full text-danger-400 hover:bg-danger-500/10">
            <LogOut size={17} /> Logout
          </button>
        </div>
      </aside>

      {/* Mobile */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-slate-800 w-64 h-full">
            <div className="flex items-center justify-end p-3 border-b border-slate-700">
              <button onClick={() => setMenuOpen(false)} className="p-1.5 text-slate-400"><X size={18} /></button>
            </div>
            <nav className="p-3 space-y-0.5">
              {navItems.map(item => {
                const showBadge = unreadCount > 0 && item.id === 'nav-device-requests';
                return (
                  <Link key={item.path} to={item.path} onClick={() => setMenuOpen(false)} className={location.pathname === item.path ? 'nav-item-active' : 'nav-item'}>
                    <span className="relative flex items-center gap-2">
                      <item.icon size={17} /> {item.label}
                      {showBadge && (
                        <span className="ml-auto min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full bg-danger-500 text-white text-[10px] font-bold">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-700">
              <button onClick={handleLogout} className="nav-item w-full text-danger-400"><LogOut size={17} /> Logout</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
          <button id="manager-menu-btn" onClick={() => setMenuOpen(true)} className="p-2 text-slate-400"><Menu size={20} /></button>
          <span className="text-white font-semibold text-sm">Manager Portal</span>
          <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">{user?.name?.[0]?.toUpperCase()}</div>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
