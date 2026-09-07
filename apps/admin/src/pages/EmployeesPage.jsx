import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Users, Plus, Search, Loader2, UserCheck, UserX, Pencil, X } from 'lucide-react';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee', teamId: '', designation: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchData = async () => {
    try {
      const [empRes, teamRes] = await Promise.all([
        api.get(`/admin/employees?search=${search}`),
        api.get('/admin/teams'),
      ]);
      setEmployees(empRes.data.data.employees || []);
      setTeams(teamRes.data.data.teams || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      if (editUser) {
        await api.patch(`/admin/users/${editUser._id}`, form);
        setMessage({ type: 'success', text: 'User updated successfully.' });
      } else {
        await api.post('/admin/users', form);
        setMessage({ type: 'success', text: 'User created successfully.' });
      }
      setShowForm(false);
      setEditUser(null);
      setForm({ name: '', email: '', password: '', role: 'employee', teamId: '', designation: '' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Operation failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.patch(`/admin/users/${user._id}`, { isActive: !user.isActive });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update user status.' });
    }
  };

  const openEdit = (user) => {
    setEditUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      teamId: user.teamId?._id || '',
      designation: user.designation || '',
    });
    setShowForm(true);
  };

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users size={22} className="text-primary-400" /> Employees
          </h1>
          <p className="text-slate-400 text-sm">Manage all employee accounts</p>
        </div>
        <button id="add-user-btn" onClick={() => { setShowForm(true); setEditUser(null); }} className="btn-primary">
          <Plus size={16} /> Add User
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${message.type === 'success' ? 'bg-success-500/10 border-success-500/30 text-success-400' : 'bg-danger-500/10 border-danger-500/30 text-danger-400'}`}>
          {message.text}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name or email..."
          className="input pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">{editUser ? 'Edit User' : 'Create User'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white p-1"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Full Name *</label>
                <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="label">{editUser ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <input type="password" className="input" required={!editUser} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role *</label>
                  <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="label">Team</label>
                  <select className="input" value={form.teamId} onChange={e => setForm({ ...form, teamId: e.target.value })}>
                    <option value="">No Team</option>
                    {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Designation</label>
                <input className="input" placeholder="Software Engineer, etc." value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" id="save-user-btn" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                  {submitting ? 'Saving...' : editUser ? 'Update User' : 'Create User'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employees Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary-400" size={32} /></div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-700/30">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Team</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp._id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gradient-to-br from-primary-600 to-purple-600 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {emp.name[0]?.toUpperCase()}
                        </div>
                        <span className="text-white font-medium">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{emp.email}</td>
                    <td className="px-4 py-3">
                      <span className={emp.role === 'manager' ? 'badge-info' : 'badge-gray'}>{emp.role}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{emp.teamId?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={emp.isActive ? 'badge-success' : 'badge-danger'}>{emp.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          id={`edit-user-${emp._id}`}
                          onClick={() => openEdit(emp)}
                          className="p-1.5 text-slate-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          id={`toggle-user-${emp._id}`}
                          onClick={() => toggleActive(emp)}
                          className={`p-1.5 rounded-lg transition-colors ${emp.isActive ? 'text-slate-400 hover:text-danger-400 hover:bg-danger-500/10' : 'text-slate-400 hover:text-success-400 hover:bg-success-500/10'}`}
                        >
                          {emp.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-slate-500 py-8">No employees found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
