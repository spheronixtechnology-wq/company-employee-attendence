import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Bell, CheckCircle, Clock, Calendar } from 'lucide-react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await api.get('/employee/notifications');
        setNotifications(res.data.data.notifications || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
  }, []);

  const getIcon = (type) => {
    if (type?.includes('approved')) return <CheckCircle size={16} className="text-success-400" />;
    if (type?.includes('rejected')) return <CheckCircle size={16} className="text-danger-400" />;
    if (type?.includes('leave')) return <Calendar size={16} className="text-primary-400" />;
    return <Bell size={16} className="text-warning-400" />;
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Bell size={22} className="text-sky-600" /> Notifications
        </h1>

        {loading ? (
          <div className="card text-center text-slate-500 py-8 shadow-sm">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="card text-center py-12 shadow-sm">
            <Bell size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div key={n._id} className="card shadow-sm flex items-start gap-3">
                <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl flex-shrink-0">
                  {getIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{n.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5 font-medium">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Clock size={11} />
                    {new Date(n.createdAt).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
