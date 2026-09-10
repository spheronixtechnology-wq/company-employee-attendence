import { useState, useEffect } from 'react';
import {
  Building2,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Wifi,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import api from '../lib/api';

export default function OfficeLocationsPage() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectingIp, setDetectingIp] = useState(false);
  const [detectedIpInfo, setDetectedIpInfo] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  const [form, setForm] = useState({
    officeName: '',
    latitude: '',
    longitude: '',
    radiusMeters: 200,
    wifiSsid: '',
    allowedIps: '',
    status: 'active',
  });

  const fetchLocations = async () => {
    try {
      const res = await api.get('/manager/office-locations');
      setLocations(res.data?.data?.locations || []);
    } catch (err) {
      console.error('Failed to load office locations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const resetForm = () => {
    setForm({
      officeName: '',
      latitude: '',
      longitude: '',
      radiusMeters: 200,
      wifiSsid: '',
      allowedIps: '',
      status: 'active',
    });
    setEditingId(null);
    setShowAdd(false);
    setGpsAccuracy(null);
    setDetectedIpInfo(null);
  };

  const handleStartEdit = (loc) => {
    setEditingId(loc._id);
    setForm({
      officeName: loc.officeName || '',
      latitude: loc.latitude || '',
      longitude: loc.longitude || '',
      radiusMeters: loc.radiusMeters || 200,
      wifiSsid: loc.wifiSsid || '',
      allowedIps: Array.isArray(loc.allowedIps) ? loc.allowedIps.join(', ') : (loc.allowedIps || ''),
      status: loc.status || 'active',
    });
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    if (!form.officeName || !form.latitude || !form.longitude || !form.radiusMeters) {
      return alert('Office name, latitude, longitude, and radius are required');
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/manager/office-locations/${editingId}`, form);
        alert('Office location updated successfully');
      } else {
        await api.post('/manager/office-locations', form);
        alert('Office location added successfully');
      }
      resetForm();
      fetchLocations();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this office location?')) return;
    try {
      await api.delete(`/manager/office-locations/${id}`);
      fetchLocations();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete location');
    }
  };

  const autoDetectGps = () => {
    if (!navigator.geolocation) return alert('Geolocation is not supported by your browser.');
    setDetecting(true);
    setGpsAccuracy(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(prev => ({
          ...prev,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }));
        setGpsAccuracy(pos.coords.accuracy);
        setDetecting(false);
      },
      (err) => {
        alert('Failed to detect location. Please ensure location permissions are enabled in your browser.');
        setDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleAutoDetectIp = async () => {
    setDetectingIp(true);
    try {
      const res = await api.get('/manager/current-ip');
      const detected = res.data?.data?.ip;
      if (detected) {
        setDetectedIpInfo(detected);
        setForm((prev) => {
          const existing = prev.allowedIps
            ? prev.allowedIps.split(',').map((s) => s.trim()).filter(Boolean)
            : [];
          if (!existing.includes(detected)) {
            const updated = [...existing, detected].join(', ');
            return { ...prev, allowedIps: updated };
          }
          return prev;
        });
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to detect current IP');
    } finally {
      setDetectingIp(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-violet-400" size={36} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-violet-500/20 text-violet-400">
              <Building2 size={24} />
            </span>
            Office Locations & Geofences
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure approved company office sites, geofence perimeters, and Wi-Fi networks for attendance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (showAdd) resetForm();
              else {
                resetForm();
                setShowAdd(true);
              }
            }}
            className="btn bg-violet-600 hover:bg-violet-500 text-white flex items-center gap-2"
          >
            <Plus size={18} /> {showAdd ? 'Close Form' : 'Add Office Location'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card p-6 bg-slate-800/90 border-violet-500/40 shadow-xl shadow-slate-950/40 animate-fade-in space-y-5">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 size={20} className="text-violet-400" />
              {editingId ? 'Edit Office Location' : 'New Office Location'}
            </h3>
            <span className="text-xs text-slate-400">All fields required for geofence validation</span>
          </div>

          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-white font-medium text-sm">Auto-Capture GPS Coordinates</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Stand at the office premises to capture high-accuracy Latitude and Longitude automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={autoDetectGps}
              disabled={detecting}
              className="btn bg-slate-700 hover:bg-violet-600 hover:text-white text-slate-200 text-xs flex items-center gap-2 whitespace-nowrap"
            >
              {detecting ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />}
              {detecting ? 'Detecting Location...' : '📍 Use Current Location'}
            </button>
          </div>

          {gpsAccuracy !== null && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-3 text-xs ${
                gpsAccuracy > 50
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <strong>±{Math.round(gpsAccuracy)}m GPS Accuracy.</strong>
                {gpsAccuracy > 50 && ' Accuracy is slightly low — confirm coordinates on Google Maps if needed.'}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Office Name *</label>
              <input
                placeholder="e.g. Headquarters - Tech Park"
                className="input"
                value={form.officeName}
                onChange={(e) => setForm({ ...form, officeName: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Latitude *</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 12.9716"
                className="input"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Longitude *</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 77.5946"
                className="input"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Geofence Radius (meters) *</label>
              <input
                type="number"
                placeholder="e.g. 200"
                className="input"
                value={form.radiusMeters}
                onChange={(e) => setForm({ ...form, radiusMeters: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="border-t border-slate-700/60 pt-4 space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wifi size={16} className="text-violet-400" /> Authorized Office Network Configuration
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Office WiFi SSID</label>
                <input
                  placeholder="e.g. Spheronix-Office-5G"
                  className="input"
                  value={form.wifiSsid}
                  onChange={(e) => setForm({ ...form, wifiSsid: e.target.value })}
                />
                <p className="text-[11px] text-slate-400 mt-1">Guidance label shown to employees at check-in.</p>
              </div>

              <div>
                <label className="label">Allowed Public IPs / CIDR Subnets</label>
                <input
                  placeholder="e.g. 103.5.135.77, 103.5.135.64/28"
                  className="input font-mono text-xs"
                  value={form.allowedIps}
                  onChange={(e) => setForm({ ...form, allowedIps: e.target.value })}
                />
                <p className="text-[11px] text-slate-400 mt-1">Comma-separated office router public IPs or subnets.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-700/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Wifi size={16} className="text-violet-400" />
                  <span className="text-sm font-semibold text-white">Auto-Detect Office Public IP</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Reads your current connection's public IP and appends it to Allowed IPs.
                </p>
                {detectedIpInfo && (
                  <p className="text-xs text-emerald-400 font-medium mt-1">
                    Detected IP: <span className="font-mono text-white">{detectedIpInfo}</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleAutoDetectIp}
                disabled={detectingIp}
                className="btn bg-slate-700 hover:bg-violet-600 hover:text-white text-slate-200 text-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                {detectingIp ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                {detectingIp ? 'Detecting...' : 'Detect Current IP'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
            <button type="button" onClick={resetForm} className="btn-ghost text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn bg-violet-600 hover:bg-violet-500 text-white text-xs px-5 py-2 font-semibold"
            >
              {saving ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
              {editingId ? 'Update Location' : 'Save Location'}
            </button>
          </div>
        </div>
      )}

      {locations.length === 0 ? (
        <div className="card text-center py-12 space-y-3">
          <Building2 size={40} className="text-slate-500 mx-auto" />
          <h3 className="text-white font-semibold">No Office Locations Configured</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Add at least one office location with latitude, longitude, and radius to enable GPS geofence validation.
          </p>
          <button onClick={() => setShowAdd(true)} className="btn bg-violet-600 hover:bg-violet-500 text-white text-xs mt-2">
            Add First Location
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {locations.map((loc) => (
            <div
              key={loc._id}
              className="card bg-slate-800/80 border-slate-700 hover:border-violet-500/50 transition-all p-5 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">{loc.officeName}</h3>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold mt-1 ${
                        loc.status === 'active'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {loc.status || 'active'}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400">
                    <MapPin size={20} />
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Coordinates:</span>
                    <span className="font-mono text-white">
                      {Number(loc.latitude).toFixed(4)}, {Number(loc.longitude).toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Geofence Radius:</span>
                    <span className="font-semibold text-emerald-400">{loc.radiusMeters} meters</span>
                  </div>
                  {loc.wifiSsid && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">WiFi SSID:</span>
                      <span className="font-medium text-violet-300">{loc.wifiSsid}</span>
                    </div>
                  )}
                  {loc.allowedIps && loc.allowedIps.length > 0 && (
                    <div className="pt-1 border-t border-slate-800">
                      <span className="text-slate-400 block mb-1">Allowed Public IPs:</span>
                      <div className="flex flex-wrap gap-1">
                        {loc.allowedIps.map((ip, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px] text-slate-200">
                            {ip}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-700/60 mt-4">
                <a
                  href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 font-medium"
                >
                  <ExternalLink size={12} /> View on Map
                </a>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStartEdit(loc)}
                    className="p-1.5 rounded-lg bg-slate-700 hover:bg-violet-600 text-slate-200 hover:text-white transition-colors"
                    title="Edit Location"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(loc._id)}
                    className="p-1.5 rounded-lg bg-slate-700 hover:bg-rose-600 text-slate-200 hover:text-white transition-colors"
                    title="Delete Location"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
