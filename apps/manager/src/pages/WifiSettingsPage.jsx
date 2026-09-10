import { useState, useEffect, useCallback } from 'react';
import {
  Wifi,
  MapPin,
  Shield,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Save,
  Loader2,
  ExternalLink,
  RefreshCw,
  Sliders,
  Check,
  Zap,
  Globe,
  Network,
} from 'lucide-react';
import api from '../lib/api';

// Helper Haversine distance calculator for on-page simulation
const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

export default function WifiSettingsPage() {
  const [locations, setLocations] = useState([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Active attendance method state
  const [activeMethod, setActiveMethod] = useState('');
  const [switchingMethod, setSwitchingMethod] = useState(false);

  // Detected admin network info (dual LAN & WAN)
  const [networkInfo, setNetworkInfo] = useState({
    ip: null,
    publicIp: null,
    publicIpv4: null,
    publicIpv6: null,
    ipv6Subnet: null,
    localWifi: null,
    connectionIp: null,
    wifiSsid: null,
    requiredIps: [],
  });
  const [detectingIp, setDetectingIp] = useState(false);

  // Form state
  const [form, setForm] = useState({
    officeName: '',
    latitude: '',
    longitude: '',
    radiusMeters: 200,
    wifiSsid: '',
    allowedIps: [],
  });
  const [newIpInput, setNewIpInput] = useState('');

  const currentIp = networkInfo.connectionIp || networkInfo.clientIp || networkInfo.publicIpv4 || networkInfo.ip;
  const publicIpv4 = networkInfo.publicIpv4 || networkInfo.publicIp;
  const publicIpv6 = networkInfo.publicIpv6;
  const ipv6Subnet = networkInfo.ipv6Subnet;
  const localWifi = networkInfo.localWifi;

  const isPublicIpv4InAllowedList = publicIpv4 ? (form.allowedIps || []).includes(publicIpv4) : false;
  const isIpv6SubnetInAllowedList = ipv6Subnet ? (form.allowedIps || []).includes(ipv6Subnet) : false;
  const isLocalSubnetInAllowedList = localWifi?.subnet ? (form.allowedIps || []).includes(localWifi.subnet) : false;
  const isLocalIpInAllowedList = localWifi?.ip ? (form.allowedIps || []).includes(localWifi.ip) : false;

  // GPS capture state
  const [detectingGps, setDetectingGps] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  // Live Simulator state
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);

  const showNotification = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  };

  // ── 1. Fetch Locations & System Settings ─────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [locRes, methodRes, ipRes] = await Promise.allSettled([
        api.get('/manager/office-locations'),
        api.get('/manager/attendance-method/active'),
        api.get('/manager/current-ip'),
      ]);

      let loadedLocations = [];
      if (locRes.status === 'fulfilled') {
        loadedLocations = locRes.value.data?.data?.locations || [];
        setLocations(loadedLocations);
      }

      if (methodRes.status === 'fulfilled') {
        setActiveMethod(methodRes.value.data?.data?.activeMethod || '');
      }

      let networkData = null;
      if (ipRes.status === 'fulfilled') {
        networkData = ipRes.value.data?.data;
        if (networkData) {
          setNetworkInfo({
            ip: networkData.ip || null,
            publicIp: networkData.publicIp || null,
            publicIpv4: networkData.publicIpv4 || networkData.publicIp || null,
            publicIpv6: networkData.publicIpv6 || null,
            ipv6Subnet: networkData.ipv6Subnet || null,
            localWifi: networkData.localWifi || null,
            connectionIp: networkData.connectionIp || null,
            wifiSsid: networkData.wifiSsid || null,
            requiredIps: networkData.requiredIps || [],
          });
        }
      }

      // Populate selected office
      if (loadedLocations.length > 0) {
        const first = loadedLocations[0];
        setSelectedOfficeId(first._id);
        const officeAllowed =
          Array.isArray(first.allowedIps) && first.allowedIps.length > 0
            ? first.allowedIps
            : networkData?.requiredIps || [];
        const officeSsid = first.wifiSsid || networkData?.wifiSsid || '';
        setForm({
          officeName: first.officeName || '',
          latitude: first.latitude ?? '',
          longitude: first.longitude ?? '',
          radiusMeters: first.radiusMeters || 200,
          wifiSsid: officeSsid,
          allowedIps: officeAllowed,
        });
      }
    } catch (err) {
      console.error('Fetch error:', err);
      showNotification('error', 'Failed to load settings from server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When selected office changes
  const handleOfficeSelect = (e) => {
    const id = e.target.value;
    setSelectedOfficeId(id);
    setSimResult(null);
    const loc = locations.find((l) => l._id === id);
    if (loc) {
      setForm({
        officeName: loc.officeName || '',
        latitude: loc.latitude ?? '',
        longitude: loc.longitude ?? '',
        radiusMeters: loc.radiusMeters || 200,
        wifiSsid: loc.wifiSsid || '',
        allowedIps: Array.isArray(loc.allowedIps) ? loc.allowedIps : [],
      });
    } else {
      // New office form
      setForm({
        officeName: '',
        latitude: '',
        longitude: '',
        radiusMeters: 200,
        wifiSsid: '',
        allowedIps: currentIp ? [currentIp] : [],
      });
    }
  };

  // ── 2. Refresh Network Information (LAN & WAN Dual-Stack) ───────────────────
  const fetchCurrentIp = async () => {
    setDetectingIp(true);
    try {
      const res = await api.get('/manager/current-ip');
      const data = res.data?.data;
      if (data) {
        setNetworkInfo({
          ip: data.ip || null,
          publicIp: data.publicIp || null,
          publicIpv4: data.publicIpv4 || data.publicIp || null,
          publicIpv6: data.publicIpv6 || null,
          ipv6Subnet: data.ipv6Subnet || null,
          localWifi: data.localWifi || null,
          connectionIp: data.connectionIp || null,
          wifiSsid: data.wifiSsid || null,
          requiredIps: data.requiredIps || [],
        });
        showNotification(
          'success',
          `Scanned: SSID "${data.wifiSsid || 'N/A'}" | IPv4 ${data.publicIpv4 || data.publicIp || 'N/A'} | IPv6 ${data.ipv6Subnet || 'None'} | LAN ${data.localWifi?.ip || 'N/A'}`
        );
      }
    } catch {
      showNotification('error', 'Failed to detect current network IP addresses.');
    } finally {
      setDetectingIp(false);
    }
  };

  const handleAutoConfigureAll = () => {
    const required = networkInfo.requiredIps || [];
    const newAllowed = Array.from(new Set([...form.allowedIps, ...required]));
    const newSsid = form.wifiSsid || networkInfo.wifiSsid || '';

    setForm((prev) => ({
      ...prev,
      wifiSsid: newSsid,
      allowedIps: newAllowed,
    }));

    showNotification(
      'success',
      `⚡ Auto-configured: SSID "${newSsid}" and ${required.length} required network IPs added!`
    );
  };

  const handleAddPublicIpv4ToWhitelist = () => {
    const ipv4 = networkInfo.publicIpv4 || networkInfo.publicIp;
    if (!ipv4) return;
    if (form.allowedIps.includes(ipv4)) {
      showNotification('info', `IPv4 ${ipv4} is already in the whitelist.`);
      return;
    }
    setForm((prev) => ({
      ...prev,
      allowedIps: [...prev.allowedIps, ipv4],
    }));
    showNotification('success', `Added IPv4 ${ipv4} to Allowed IPs.`);
  };

  const handleAddIpv6SubnetToWhitelist = () => {
    const v6Subnet = networkInfo.ipv6Subnet;
    if (!v6Subnet) return;
    if (form.allowedIps.includes(v6Subnet)) {
      showNotification('info', `IPv6 Subnet ${v6Subnet} is already in the whitelist.`);
      return;
    }
    setForm((prev) => ({
      ...prev,
      allowedIps: [...prev.allowedIps, v6Subnet],
    }));
    showNotification('success', `Added IPv6 Subnet ${v6Subnet} to Allowed IPs.`);
  };

  const handleAddBothInternetIpsToWhitelist = () => {
    const ipv4 = networkInfo.publicIpv4 || networkInfo.publicIp;
    const v6Subnet = networkInfo.ipv6Subnet;
    const toAdd = [];
    if (ipv4 && !form.allowedIps.includes(ipv4)) {
      toAdd.push(ipv4);
    }
    if (v6Subnet && !form.allowedIps.includes(v6Subnet)) {
      toAdd.push(v6Subnet);
    }
    if (toAdd.length === 0) {
      showNotification('info', 'Office IPv4 and IPv6 subnet are already whitelisted.');
      return;
    }
    setForm((prev) => ({
      ...prev,
      allowedIps: [...prev.allowedIps, ...toAdd],
    }));
    showNotification('success', `Whitelisted office internet: ${toAdd.join(', ')}.`);
  };

  const handleAddLocalSubnetToWhitelist = () => {
    const subnet = networkInfo.localWifi?.subnet;
    if (!subnet) return;
    if (form.allowedIps.includes(subnet)) {
      showNotification('info', `Subnet ${subnet} is already in the whitelist.`);
      return;
    }
    setForm((prev) => ({
      ...prev,
      allowedIps: [...prev.allowedIps, subnet],
    }));
    showNotification('success', `Added Wi-Fi Subnet ${subnet} to Allowed IPs.`);
  };

  const handleAddLocalIpToWhitelist = () => {
    const localIp = networkInfo.localWifi?.ip;
    if (!localIp) return;
    if (form.allowedIps.includes(localIp)) {
      showNotification('info', `Local IP ${localIp} is already in the whitelist.`);
      return;
    }
    setForm((prev) => ({
      ...prev,
      allowedIps: [...prev.allowedIps, localIp],
    }));
    showNotification('success', `Added Local IP ${localIp} to Allowed IPs.`);
  };

  // ── 3. Add Custom IP or CIDR ────────────────────────────────────────────────
  const handleAddIp = () => {
    const trimmed = newIpInput.trim();
    if (!trimmed) return;
    if (form.allowedIps.includes(trimmed)) {
      showNotification('info', 'This IP/CIDR is already in the list.');
      return;
    }
    setForm((prev) => ({
      ...prev,
      allowedIps: [...prev.allowedIps, trimmed],
    }));
    setNewIpInput('');
  };

  const handleRemoveIp = (ipToRemove) => {
    setForm((prev) => ({
      ...prev,
      allowedIps: prev.allowedIps.filter((ip) => ip !== ipToRemove),
    }));
  };

  // ── 4. Live GPS Location Capture ────────────────────────────────────────────
  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      return alert('Geolocation is not supported by your browser.');
    }
    setDetectingGps(true);
    setGpsAccuracy(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setForm((prev) => ({
          ...prev,
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
        }));
        setGpsAccuracy(accuracy);
        setDetectingGps(false);
        showNotification('success', `📍 GPS coordinates captured (Accuracy: ±${Math.round(accuracy)}m).`);
      },
      (err) => {
        setDetectingGps(false);
        alert(err.message || 'Failed to detect location. Please ensure location permissions are granted.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // ── 5. Save Office Location & Network Settings ──────────────────────────────
  const handleSave = async () => {
    if (!form.officeName || form.latitude === '' || form.longitude === '' || !form.radiusMeters) {
      return alert('Please fill in Office Name, Latitude, Longitude, and Radius.');
    }

    setSaving(true);
    try {
      const payload = {
        officeName: form.officeName,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radiusMeters: Number(form.radiusMeters),
        wifiSsid: form.wifiSsid.trim() || null,
        allowedIps: form.allowedIps,
      };

      if (selectedOfficeId && selectedOfficeId !== 'new') {
        await api.patch(`/manager/office-locations/${selectedOfficeId}`, payload);
        showNotification('success', '✅ Office location & network settings updated successfully!');
      } else {
        const res = await api.post('/manager/office-locations', payload);
        const created = res.data?.data?.location;
        showNotification('success', '✅ New office location created successfully!');
        if (created?._id) setSelectedOfficeId(created._id);
      }

      fetchData();
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  // ── 6. Switch Active Attendance Method ──────────────────────────────────────
  const handleSwitchToWifi = async () => {
    setSwitchingMethod(true);
    try {
      await api.patch('/manager/attendance-method/switch', {
        method: 'wifi_ip',
        activeMethod: 'wifi_ip',
        reason: 'Activated via WiFi / IP Settings page',
      });
      setActiveMethod('wifi_ip');
      showNotification('success', '🎉 WiFi / IP Attendance is now the active company-wide attendance method!');
    } catch (err) {
      showNotification('error', err.response?.data?.message || 'Failed to switch attendance method.');
    } finally {
      setSwitchingMethod(false);
    }
  };

  // ── 7. Live Check-In Simulator ──────────────────────────────────────────────
  const handleRunSimulation = async () => {
    if (!navigator.geolocation) {
      return alert('Geolocation is not supported in this browser.');
    }

    setSimulating(true);
    setSimResult(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const targetLat = Number(form.latitude);
        const targetLng = Number(form.longitude);
        const allowedRadius = Number(form.radiusMeters);

        const distanceMeters = calculateDistanceMeters(latitude, longitude, targetLat, targetLng);
        const isGpsInside = distanceMeters <= allowedRadius;

        // Check current IP against form's allowed IPs
        const isIpAuthorized =
          (publicIpv4 && form.allowedIps.includes(publicIpv4)) ||
          (publicIpv6 && form.allowedIps.includes(publicIpv6)) ||
          (ipv6Subnet && form.allowedIps.includes(ipv6Subnet)) ||
          (localWifi?.subnet && form.allowedIps.includes(localWifi.subnet)) ||
          (localWifi?.ip && form.allowedIps.includes(localWifi.ip)) ||
          (networkInfo.connectionIp && form.allowedIps.includes(networkInfo.connectionIp));

        const passedAll = Boolean(isIpAuthorized && isGpsInside);

        setSimResult({
          currentIp: publicIpv4 || ipv6Subnet || localWifi?.ip || networkInfo.connectionIp,
          isIpAuthorized,
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
          gpsAccuracy: Math.round(accuracy),
          distanceMeters,
          allowedRadius,
          isGpsInside,
          passedAll,
        });
        setSimulating(false);
      },
      (err) => {
        setSimulating(false);
        alert('Simulation failed: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* ── Notification Banner ── */}
      {message && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-sm shadow-lg animate-in fade-in ${
            message.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
              : message.type === 'error'
              ? 'bg-red-500/15 border border-red-500/40 text-red-300'
              : 'bg-primary-500/15 border border-primary-500/40 text-primary-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {message.type === 'success' ? (
              <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Page Header & Method Status ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500/20 to-blue-600/20 border border-primary-500/30 flex items-center justify-center text-primary-400 shadow-inner">
            <Wifi size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">WiFi / IP Settings</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure authorized office internet gateways, display SSIDs, and live geofence perimeters.
            </p>
          </div>
        </div>

        {/* Method Status Toggle */}
        <div className="flex items-center gap-3 bg-slate-800/80 p-2 rounded-2xl border border-slate-700/60">
          <div className="px-3 py-1.5">
            <span className="text-[11px] text-slate-400 block">Attendance Method</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeMethod === 'wifi_ip' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span className="text-xs font-semibold text-white">
                {activeMethod === 'wifi_ip' ? 'WiFi / IP (Active)' : `Active: ${activeMethod || 'Other'}`}
              </span>
            </div>
          </div>

          {activeMethod !== 'wifi_ip' && (
            <button
              onClick={handleSwitchToWifi}
              disabled={switchingMethod}
              className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5 shadow-md shadow-primary-500/20 whitespace-nowrap"
            >
              {switchingMethod ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              Switch to WiFi / IP
            </button>
          )}
        </div>
      </div>

      {/* ── Section 1: Live Network Inspector (Dual LAN & WAN Detection) ── */}
      <div className="card p-6 bg-gradient-to-r from-slate-900/95 via-slate-850 to-slate-900/95 border border-slate-700/70 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Network size={16} className="text-primary-400" />
              Live Network Inspector (Office Wi-Fi & Internet Gateway)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Exact network addresses detected from your computer and office internet router.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={handleAutoConfigureAll}
              className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5 shadow-md shadow-primary-500/20 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500"
              title="Auto-Detect & Whitelist All Required Office IPs"
            >
              <Zap size={13} />
              Auto-Detect & Whitelist All
            </button>
            <button
              type="button"
              onClick={fetchCurrentIp}
              disabled={detectingIp}
              className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 self-start sm:self-auto hover:bg-slate-800"
              title="Scan Network Now"
            >
              <RefreshCw size={13} className={detectingIp ? 'animate-spin text-primary-400' : ''} />
              {detectingIp ? 'Scanning...' : 'Refresh IP'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card A: Office Wi-Fi Network (LAN) */}
          <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Wifi size={14} className="text-emerald-400" />
                  Office Wi-Fi Network (LAN)
                </span>
                {isLocalSubnetInAllowedList || isLocalIpInAllowedList ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    <CheckCircle size={11} /> Whitelisted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                    <AlertCircle size={11} /> Not in Whitelist
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Device IP (ipconfig):</span>
                  <span className="font-mono text-xs font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700/60">
                    {localWifi?.ip || 'Detecting...'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Wi-Fi Subnet:</span>
                  <span className="font-mono text-xs font-bold text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700/60">
                    {localWifi?.subnet || 'Detecting...'}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                Allows any employee connected to your office Wi-Fi router to check in when using a local office server.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/60">
              {localWifi?.subnet && !isLocalSubnetInAllowedList && (
                <button
                  type="button"
                  onClick={handleAddLocalSubnetToWhitelist}
                  className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border-emerald-500/30"
                >
                  <Plus size={13} /> Add Wi-Fi Subnet ({localWifi.subnet})
                </button>
              )}
              {localWifi?.ip && !isLocalIpInAllowedList && (
                <button
                  type="button"
                  onClick={handleAddLocalIpToWhitelist}
                  className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1 border border-slate-700 hover:border-slate-600"
                >
                  <Plus size={13} /> Add Exact IP ({localWifi.ip})
                </button>
              )}
            </div>
          </div>

          {/* Card B: Office Internet Gateway (Public WAN Dual-Stack) */}
          <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Globe size={14} className="text-sky-400" />
                  Office Internet Gateway (Public WAN Dual-Stack)
                </span>
                {isPublicIpv4InAllowedList && isIpv6SubnetInAllowedList ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    <CheckCircle size={11} /> IPv4 & IPv6 Whitelisted
                  </span>
                ) : isPublicIpv4InAllowedList || isIpv6SubnetInAllowedList ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 bg-sky-500/15 px-2 py-0.5 rounded-full border border-sky-500/30">
                    <CheckCircle size={11} /> Partially Whitelisted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                    <AlertCircle size={11} /> Not in Whitelist
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Public IPv4:</span>
                  <span className="font-mono text-xs font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700/60">
                    {publicIpv4 || 'Detecting...'}
                  </span>
                  {isPublicIpv4InAllowedList && (
                    <span className="text-[10px] text-emerald-400 font-semibold">✓</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Office IPv6 Subnet:</span>
                  <span className="font-mono text-xs font-bold text-sky-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-700/60">
                    {ipv6Subnet || (publicIpv6 ? `${publicIpv6.slice(0, 19)}...` : 'No IPv6 Route')}
                  </span>
                  {isIpv6SubnetInAllowedList && (
                    <span className="text-[10px] text-emerald-400 font-semibold">✓</span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                {ipv6Subnet
                  ? <>Your network supports IPv6. Whitelisting the <strong className="text-slate-300">/64 subnet</strong> matches all office devices even when mobile OS privacy addresses rotate.</>
                  : <>Your office network uses IPv4 (<span className="text-amber-400 font-medium">No IPv6 Route</span>). Simply whitelist the <strong className="text-slate-300">Public IPv4</strong> address below to allow all employees on this Wi-Fi to check in.</>}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/60">
              {(!isPublicIpv4InAllowedList || !isIpv6SubnetInAllowedList) && (publicIpv4 || ipv6Subnet) && (
                <button
                  type="button"
                  onClick={handleAddBothInternetIpsToWhitelist}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-md shadow-primary-500/20"
                >
                  <Plus size={13} /> Whitelist Complete Office Internet (IPv4 & IPv6)
                </button>
              )}
              {publicIpv4 && !isPublicIpv4InAllowedList && (
                <button
                  type="button"
                  onClick={handleAddPublicIpv4ToWhitelist}
                  className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1 border border-slate-700 hover:border-slate-600"
                >
                  <Plus size={13} /> Add IPv4 ({publicIpv4})
                </button>
              )}
              {ipv6Subnet && !isIpv6SubnetInAllowedList && (
                <button
                  type="button"
                  onClick={handleAddIpv6SubnetToWhitelist}
                  className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1 border border-slate-700 hover:border-slate-600"
                >
                  <Plus size={13} /> Add IPv6 ({ipv6Subnet})
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Office Selector & Main Configuration ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Office Selector & Network Settings (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Office Selection */}
          <div className="card p-5 border border-slate-700/60 rounded-3xl bg-slate-900/60">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Office Location to Configure
              </label>
              <span className="text-[11px] text-slate-500">{locations.length} configured location(s)</span>
            </div>

            <div className="flex gap-3">
              <select
                className="select flex-1 font-medium text-sm"
                value={selectedOfficeId}
                onChange={handleOfficeSelect}
              >
                {locations.map((loc) => (
                  <option key={loc._id} value={loc._id}>
                    {loc.officeName} {loc.wifiSsid ? `(${loc.wifiSsid})` : ''}
                  </option>
                ))}
                <option value="new">+ Add New Office Location</option>
              </select>
            </div>
          </div>

          {/* Network Configuration Card */}
          <div className="card p-6 border border-slate-700/60 rounded-3xl bg-slate-900/60 space-y-5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
              <Wifi size={18} className="text-primary-400" />
              <h2 className="text-base font-bold text-white">1. Authorized Office Network (IP Whitelist)</h2>
            </div>

            {/* Office Name & SSID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Office Name</label>
                <input
                  type="text"
                  placeholder="e.g. Main Headquarters"
                  className="input text-sm"
                  value={form.officeName}
                  onChange={(e) => setForm({ ...form, officeName: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Office WiFi Name (SSID)</label>
                <input
                  type="text"
                  placeholder="e.g. Spheronix-Office-5G"
                  className="input text-sm"
                  value={form.wifiSsid}
                  onChange={(e) => setForm({ ...form, wifiSsid: e.target.value })}
                />
                <p className="text-[11px] text-slate-400 mt-1">Display label telling employees which network to join.</p>
              </div>
            </div>

            {/* Allowed Public IPs */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label">Allowed Public IP(s) & CIDR Subnets</label>
                <span className="text-[11px] text-slate-400">{form.allowedIps.length} IP(s) whitelisted</span>
              </div>

              {/* IP Input & Add Button */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Enter Public IP or CIDR (e.g. 103.5.135.77 or 2401:4900:9002:3383::/64)"
                  className="input flex-1 font-mono text-xs"
                  value={newIpInput}
                  onChange={(e) => setNewIpInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddIp())}
                />
                <button
                  type="button"
                  onClick={handleAddIp}
                  className="btn-secondary text-xs px-4 flex items-center gap-1"
                >
                  <Plus size={14} /> Add
                </button>
              </div>

              {/* IP Chips List */}
              <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800 min-h-[85px] flex flex-wrap gap-2 items-start">
                {form.allowedIps.length === 0 ? (
                  <span className="text-xs text-slate-500 italic p-1">
                    No IPs configured. Attendance will be blocked until at least one public IP is added.
                  </span>
                ) : (
                  form.allowedIps.map((ip) => {
                    const isMyIp =
                      ip === currentIp ||
                      ip === publicIpv4 ||
                      ip === ipv6Subnet ||
                      ip === localWifi?.ip ||
                      ip === localWifi?.subnet;
                    return (
                      <span
                        key={ip}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs border ${
                          isMyIp
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-800/80 border-slate-700 text-slate-200'
                        }`}
                      >
                        <span>{ip}</span>
                        {isMyIp && (
                          <span className="text-[9px] uppercase font-bold text-emerald-400 bg-emerald-500/20 px-1 rounded">
                            You
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveIp(ip)}
                          className="text-slate-400 hover:text-red-400 ml-1 transition-colors"
                          title="Remove IP"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-[11px] text-amber-300 flex items-start gap-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-400" />
                <span>
                  <strong>Important:</strong> Enter the public static IP of your office internet router. If configuring while connected to the office WiFi, click <strong>"Add My IP to Whitelist"</strong> above.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Location (GPS Geofence) & Simulator (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Geofence Configuration Card */}
          <div className="card p-6 border border-slate-700/60 rounded-3xl bg-slate-900/60 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <MapPin size={18} className="text-primary-400" />
                <h2 className="text-base font-bold text-white">2. Live Location Access (Geofence)</h2>
              </div>
              {form.latitude && form.longitude && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${form.latitude}&mlon=${form.longitude}#map=18/${form.latitude}/${form.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                >
                  Map <ExternalLink size={12} />
                </a>
              )}
            </div>

            {/* GPS Detection Action Card */}
            <div className="p-4 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Device GPS Capture</span>
                {gpsAccuracy !== null && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      gpsAccuracy <= 25
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    ±{Math.round(gpsAccuracy)}m accuracy
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-400">
                Stand at the office and click below to auto-capture high-accuracy GPS coordinates.
              </p>

              <button
                type="button"
                onClick={handleDetectGps}
                disabled={detectingGps}
                className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-md shadow-primary-500/20"
              >
                {detectingGps ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                {detectingGps ? 'Querying Satellite GPS…' : '📍 Capture Current GPS Location'}
              </button>
            </div>

            {/* Lat / Lng Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Latitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 17.4325"
                  className="input text-xs font-mono"
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Longitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 78.3872"
                  className="input text-xs font-mono"
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                />
              </div>
            </div>

            {/* Radius Input & Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Allowed Geofence Radius</label>
                <span className="text-xs font-bold text-primary-300">{form.radiusMeters} meters</span>
              </div>

              <input
                type="range"
                min="20"
                max="1000"
                step="10"
                value={form.radiusMeters}
                onChange={(e) => setForm({ ...form, radiusMeters: Number(e.target.value) })}
                className="w-full accent-primary-500 cursor-pointer mb-2"
              />

              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Tight (20m)</span>
                <span>Standard (200m)</span>
                <span>Campus (1000m)</span>
              </div>
            </div>
          </div>

          {/* Live Check-In Simulator */}
          <div className="card p-5 border border-slate-700/60 rounded-3xl bg-slate-900/60 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-primary-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Attendance Rule Simulator</h3>
              </div>
              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={simulating || !form.latitude || !form.longitude}
                className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1 text-primary-400 hover:text-primary-300"
              >
                {simulating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Test My Status
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Tests whether your current network IP and physical GPS coordinates pass the rules configured above.
            </p>

            {simResult && (
              <div
                className={`p-3.5 rounded-2xl border space-y-2 text-xs animate-in fade-in ${
                  simResult.passedAll
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-slate-300">Simulation Verdict:</span>
                  <span className={simResult.passedAll ? 'text-emerald-400' : 'text-red-400'}>
                    {simResult.passedAll ? '✅ Attendance Accepted' : '❌ Attendance Rejected'}
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                  <div className="flex justify-between">
                    <span>1. Office Network IP:</span>
                    <span className={simResult.isIpAuthorized ? 'text-emerald-400 font-medium' : 'text-red-400'}>
                      {simResult.isIpAuthorized ? 'PASS' : 'FAIL (Unauthorized IP)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>2. Geofence Distance:</span>
                    <span className={simResult.isGpsInside ? 'text-emerald-400 font-medium' : 'text-red-400'}>
                      {simResult.distanceMeters}m from office ({simResult.isGpsInside ? 'PASS' : `FAIL > ${simResult.allowedRadius}m`})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Save Settings Bar ── */}
      <div className="sticky bottom-6 z-20 bg-slate-900/90 backdrop-blur-md p-4 rounded-3xl border border-slate-700/80 shadow-2xl flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-white">Save Location & Network Configuration</p>
          <p className="text-[11px] text-slate-400">Updates will apply immediately to employee check-in validation.</p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="btn-primary py-3 px-6 text-sm font-semibold flex items-center gap-2 shadow-lg shadow-primary-500/30"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving Changes…' : 'Save WiFi / IP Settings'}
        </button>
      </div>
    </div>
  );
}
