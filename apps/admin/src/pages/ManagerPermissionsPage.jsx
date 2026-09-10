import { useState, useEffect } from 'react';
import { Loader2, ShieldCheck, UserCheck, Activity, CheckSquare } from 'lucide-react';
import api from '../lib/api';

const ManagerPermissionsPage = () => {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchManagers = async () => {
    try {
      const res = await api.get('/admin/manager-permissions');
      setManagers(res.data?.data?.managers || []);
    } catch (err) {
      console.error('Failed to fetch manager permissions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagers();
  }, []);

  const togglePermission = async (managerId, permKey) => {
    const target = managers.find(m => m._id === managerId);
    if (!target) return;

    const updatedPerms = {
      ...target.permissions,
      [permKey]: !target.permissions[permKey]
    };

    // Optimistic update
    setManagers(prev => prev.map(m => {
      if (m._id === managerId) {
        return { ...m, permissions: updatedPerms };
      }
      return m;
    }));
    
    try {
      await api.patch(`/admin/manager-permissions/${managerId}`, { permissions: updatedPerms });
    } catch (err) {
      // Revert on failure
      fetchManagers();
      alert(err.response?.data?.message || 'Failed to update permission');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="animate-spin text-primary-400" size={40} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-emerald-400 drop-shadow-sm mb-2">Manager Permissions</h1>
        <p className="text-slate-400">Configure what your team managers are allowed to do.</p>
      </div>

      <div className="grid gap-6">
        {managers.length === 0 ? (
          <div className="card text-center p-8 border border-slate-700/50 bg-slate-800/20 backdrop-blur-md">
            <p className="text-slate-500">No managers found in the system.</p>
          </div>
        ) : (
          managers.map(manager => (
            <div key={manager._id} className="card p-6 border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 shadow-xl shadow-slate-900/50 backdrop-blur-sm transition-all duration-300 hover:border-primary-500/30 group">
              
              <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-700/50">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary-600 to-emerald-500 flex items-center justify-center shadow-lg text-white font-bold text-lg border-2 border-slate-800">
                  {manager.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white group-hover:text-primary-300 transition-colors">{manager.name}</h2>
                  <p className="text-sm text-slate-400">{manager.email}</p>
                </div>
                <div className="ml-auto">
                  <span className="px-3 py-1 rounded-full bg-primary-500/10 text-primary-400 text-xs font-medium border border-primary-500/20">
                    Manager
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <PermissionToggle 
                  label="Approve Leaves" 
                  icon={<CheckSquare size={18} />}
                  isActive={manager.permissions.canApproveLeaves} 
                  onToggle={() => togglePermission(manager._id, 'canApproveLeaves')} 
                />
                <PermissionToggle 
                  label="Edit Attendance" 
                  icon={<Activity size={18} />}
                  isActive={manager.permissions.canEditAttendance} 
                  onToggle={() => togglePermission(manager._id, 'canEditAttendance')} 
                />
                <PermissionToggle 
                  label="Performance Notes" 
                  icon={<UserCheck size={18} />}
                  isActive={manager.permissions.canAddPerformanceNotes} 
                  onToggle={() => togglePermission(manager._id, 'canAddPerformanceNotes')} 
                />
                <PermissionToggle 
                  label="View Team Reports" 
                  icon={<ShieldCheck size={18} />}
                  isActive={manager.permissions.canViewTeamReports} 
                  onToggle={() => togglePermission(manager._id, 'canViewTeamReports')} 
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const PermissionToggle = ({ label, icon, isActive, onToggle }) => (
  <div 
    onClick={onToggle}
    className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all duration-300 border ${
      isActive 
        ? 'bg-primary-500/10 border-primary-500/40 shadow-[0_0_15px_rgba(56,189,248,0.1)]' 
        : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50'
    }`}
  >
    <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-primary-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
      {icon}
    </div>
    <div className="flex-1">
      <p className={`font-medium text-sm transition-colors ${isActive ? 'text-white' : 'text-slate-400'}`}>{label}</p>
    </div>
    <div className={`w-10 h-6 rounded-full p-1 transition-colors duration-300 ${isActive ? 'bg-primary-500' : 'bg-slate-700'}`}>
      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
  </div>
);

export default ManagerPermissionsPage;
