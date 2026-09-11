import { useState, useEffect } from 'react';
import api from '../lib/api';
import { GitBranch, Users, UserCheck, Plus, Edit2, Loader2, Shield, X, Mail } from 'lucide-react';

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', leadUserId: '' });

  const fetchData = async () => {
    try {
      const [teamsRes, mgrRes] = await Promise.all([
        api.get('/admin/teams'),
        api.get('/admin/employees?role=manager'),
      ]);
      setTeams(teamsRes.data?.data?.teams || []);
      setManagers(mgrRes.data?.data?.employees || []);
    } catch (err) {
      console.error('Failed to fetch teams:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingTeam(null);
    setForm({ name: '', description: '', leadUserId: '' });
    setShowModal(true);
  };

  const openEditModal = (team) => {
    setEditingTeam(team);
    setForm({
      name: team.name || '',
      description: team.description || '',
      leadUserId: team.leadUserId?._id || team.leadUserId || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Team name is required');

    setSubmitting(true);
    try {
      if (editingTeam) {
        await api.patch(`/admin/teams/${editingTeam._id}`, form);
        alert('Team updated successfully');
      } else {
        await api.post('/admin/teams', form);
        alert('Team created successfully');
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save team');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary-400" size={36} />
      </div>
    );
  }

  return (
    <div className="page-container space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <span className="p-2 rounded-xl bg-primary-50 text-primary-600 border border-primary-200 shadow-sm">
              <GitBranch size={24} />
            </span>
            Team Management
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Active teams, departmental structures, and manager assignments at Spheronix.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn-primary flex items-center gap-2 shadow-sm"
        >
          <Plus size={18} /> Create New Team
        </button>
      </div>

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <div className="card text-center py-12 space-y-3 border-slate-200 shadow-sm">
          <GitBranch size={40} className="text-slate-400 mx-auto" />
          <h3 className="text-slate-900 font-bold">No Teams Found</h3>
          <p className="text-slate-600 text-sm max-w-md mx-auto">
            Get started by creating your company's departments and assigning managers.
          </p>
          <button onClick={openCreateModal} className="btn-primary text-xs mt-2">
            Create First Team
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teams.map((team) => (
            <div
              key={team._id}
              className="card bg-white border-slate-200 hover:border-slate-300 transition-all duration-200 p-5 flex flex-col justify-between shadow-sm"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                      {team.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{team.name}</h3>
                      <span className="text-xs text-slate-600">
                        {team.membersCount ?? (team.members?.length || 0)} Member{(team.membersCount === 1 || team.members?.length === 1) ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                </div>

                {team.description && (
                  <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 line-clamp-2">
                    {team.description}
                  </p>
                )}

                {/* Team Lead */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield size={12} className="text-primary-600" /> Team Lead / Manager
                  </span>
                  {team.leadUserId ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm font-bold text-slate-900">{team.leadUserId.name}</span>
                      <span className="text-xs text-slate-600">{team.leadUserId.email}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 font-medium italic pt-1">No manager assigned</p>
                  )}
                </div>

                {/* Team Members */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Users size={14} className="text-slate-500" /> Assigned Members:
                  </span>
                  {team.members && team.members.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                      {team.members.map((m) => (
                        <div
                          key={m._id}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-800 shadow-sm"
                        >
                          <span className={`w-2 h-2 rounded-full ${m.role === 'manager' ? 'bg-primary-500' : 'bg-emerald-500'}`} />
                          <span className="font-semibold">{m.name}</span>
                          {m.designation && <span className="text-[10px] text-slate-500 font-normal">({m.designation})</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No employees assigned yet.</p>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 mt-4 flex justify-end">
                <button
                  onClick={() => openEditModal(team)}
                  className="btn bg-white hover:bg-slate-50 text-slate-700 text-xs flex items-center gap-1.5 px-3 py-1.5 font-semibold border border-slate-200 shadow-sm transition-colors"
                >
                  <Edit2 size={13} /> Edit Team
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Team Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-md p-6 bg-white border-slate-200 shadow-2xl relative space-y-5">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <GitBranch size={20} className="text-primary-600" />
              {editingTeam ? 'Edit Team' : 'Create New Team'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label text-slate-700 font-semibold">Team / Department Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Engineering, Sales, Human Resources"
                  className="input border-slate-200 bg-white text-slate-900"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="label text-slate-700 font-semibold">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Brief description of the team's responsibilities"
                  className="input resize-none border-slate-200 bg-white text-slate-900"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div>
                <label className="label text-slate-700 font-semibold">Assign Team Lead / Manager</label>
                <select
                  className="input border-slate-200 bg-white text-slate-900"
                  value={form.leadUserId}
                  onChange={(e) => setForm({ ...form, leadUserId: e.target.value })}
                >
                  <option value="">-- No Manager Assigned --</option>
                  {managers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-600 mt-1">
                  The selected manager will have dashboard and approval permissions for this team.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary text-xs px-5 py-2 shadow-sm"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
                  {editingTeam ? 'Update Team' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
