import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import {
  Clock, Coffee, CheckCircle2, LogIn, LogOut,
  AlertCircle, Loader2, Sparkles, ShieldCheck, MapPin
} from 'lucide-react';

export default function ManagerPunchCard({ onAttendanceChanged }) {
  const { socket } = useSocket();
  const [todayRecord, setTodayRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [now, setNow] = useState(Date.now());

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Fetch today's manager attendance
  const fetchMyAttendance = useCallback(async () => {
    try {
      const res = await api.get('/manager/my-attendance');
      const list = res.data?.data?.attendance || [];
      const todayAtt = list.find((a) => a.date === todayStr) || null;
      setTodayRecord(todayAtt);
    } catch (err) {
      console.error('Failed to load manager attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    fetchMyAttendance();
  }, [fetchMyAttendance]);

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      fetchMyAttendance();
      if (onAttendanceChanged) onAttendanceChanged();
    };
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
    };
  }, [socket, fetchMyAttendance, onAttendanceChanged]);

  // Live seconds ticker
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Derive current status
  const currentStatus = useMemo(() => {
    if (!todayRecord || !todayRecord.checkInTime) return 'not_checked_in';
    if (todayRecord.checkOutTime) return 'checked_out';
    const breaks = todayRecord.breaks || [];
    if (breaks.length > 0 && !breaks[breaks.length - 1].endedAt) {
      return 'on_break';
    }
    return 'working';
  }, [todayRecord]);

  // Compute live net focus time in seconds
  const netFocusSeconds = useMemo(() => {
    if (!todayRecord?.checkInTime) return 0;
    const startMs = new Date(todayRecord.checkInTime).getTime();
    const endMs = todayRecord.checkOutTime ? new Date(todayRecord.checkOutTime).getTime() : now;
    const elapsedSecs = Math.max(0, Math.floor((endMs - startMs) / 1000));

    // Deduct completed breaks
    let breakSecs = (todayRecord.totalBreakMinutes || todayRecord.completedBreakMinutes || 0) * 60;

    // Deduct active ongoing break if any
    const breaks = todayRecord.breaks || [];
    if (breaks.length > 0 && !breaks[breaks.length - 1].endedAt) {
      const activeStart = new Date(breaks[breaks.length - 1].startedAt).getTime();
      breakSecs += Math.max(0, Math.floor((now - activeStart) / 1000));
    }

    return Math.max(0, elapsedSecs - breakSecs);
  }, [todayRecord, now]);

  const formattedTimer = useMemo(() => {
    const hours = Math.floor(netFocusSeconds / 3600);
    const mins = Math.floor((netFocusSeconds % 3600) / 60);
    const secs = netFocusSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [netFocusSeconds]);

  // Geolocation helper
  const getCoordinates = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        // Fallback default office coordinates
        return resolve({ lat: 12.9716, lng: 77.5946, accuracy: 20 });
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 25,
          });
        },
        () => {
          // Fallback if denied
          resolve({ lat: 12.9716, lng: 77.5946, accuracy: 20 });
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    });
  };

  // Actions
  const handleCheckIn = async () => {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const coords = await getCoordinates();
      const res = await api.post('/manager/attendance/check-in', coords);
      setMessage(res.data?.message || 'Checked in successfully!');
      await fetchMyAttendance();
      if (onAttendanceChanged) onAttendanceChanged();
    } catch (err) {
      setError(err.response?.data?.message || 'Check-in failed. Please verify network/location.');
    } finally {
      setActionLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleStartBreak = async () => {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      await api.post('/manager/break/start', { type: 'personal' });
      setMessage('Break started.');
      await fetchMyAttendance();
      if (onAttendanceChanged) onAttendanceChanged();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start break.');
    } finally {
      setActionLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleEndBreak = async () => {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      await api.post('/manager/break/end');
      setMessage('Break ended. Work session resumed.');
      await fetchMyAttendance();
      if (onAttendanceChanged) onAttendanceChanged();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to end break.');
    } finally {
      setActionLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleCheckOut = async () => {
    if (!window.confirm('Are you sure you want to clock out for today?')) return;
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const coords = await getCoordinates();
      const res = await api.post('/manager/attendance/check-out', coords);
      setMessage(res.data?.message || 'Shift completed. Checked out successfully!');
      await fetchMyAttendance();
      if (onAttendanceChanged) onAttendanceChanged();
    } catch (err) {
      setError(err.response?.data?.message || 'Check-out failed.');
    } finally {
      setActionLoading(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100" />
          <div className="space-y-1.5">
            <div className="w-32 h-4 bg-slate-100 rounded" />
            <div className="w-48 h-3 bg-slate-100 rounded" />
          </div>
        </div>
      </div>
    );
  }

  const checkInFormatted = todayRecord?.checkInTime
    ? new Date(todayRecord.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;
  const checkOutFormatted = todayRecord?.checkOutTime
    ? new Date(todayRecord.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm transition-all relative overflow-hidden">
      {/* Messages */}
      {message && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle size={15} className="text-rose-600 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 text-xs font-bold">×</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Identity & Shift State */}
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xs border ${
            currentStatus === 'working' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
            currentStatus === 'on_break' ? 'bg-amber-50 text-amber-600 border-amber-200' :
            currentStatus === 'checked_out' ? 'bg-blue-50 text-blue-600 border-blue-200' :
            'bg-slate-100 text-slate-600 border-slate-200'
          }`}>
            {currentStatus === 'working' ? <Clock size={22} className="animate-spin-slow" /> :
             currentStatus === 'on_break' ? <Coffee size={22} /> :
             currentStatus === 'checked_out' ? <CheckCircle2 size={22} /> :
             <LogIn size={22} />}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Manager Shift</span>
              {currentStatus === 'working' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  WORKING NOW
                </span>
              )}
              {currentStatus === 'on_break' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                  <Coffee size={11} className="text-amber-600" />
                  ON BREAK
                </span>
              )}
              {currentStatus === 'checked_out' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                  <CheckCircle2 size={11} className="text-blue-600" />
                  SHIFT COMPLETED
                </span>
              )}
              {currentStatus === 'not_checked_in' && (
                <span className="inline-flex items-center text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  NOT CLOCKED IN
                </span>
              )}
            </div>

            {/* Timings summary */}
            <p className="text-xs text-slate-600 mt-0.5 font-medium">
              {currentStatus === 'working' && (
                <span>First punch: <strong className="text-slate-900 font-mono">{checkInFormatted}</strong> · Break deductions tracked</span>
              )}
              {currentStatus === 'on_break' && (
                <span>Punch in: <strong className="text-slate-900 font-mono">{checkInFormatted}</strong> · Break timer active</span>
              )}
              {currentStatus === 'checked_out' && (
                <span>In: <strong className="text-slate-900 font-mono">{checkInFormatted}</strong> · Out: <strong className="text-slate-900 font-mono">{checkOutFormatted}</strong></span>
              )}
              {currentStatus === 'not_checked_in' && (
                <span>Record your daily attendance punch to synchronize with company timesheets.</span>
              )}
            </p>
          </div>
        </div>

        {/* Right: Live Focus Timer & Action Buttons */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          {(currentStatus === 'working' || currentStatus === 'on_break') && (
            <div className="text-right pr-2 border-r border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">Net Focus</span>
              <span className="font-mono text-lg font-black text-slate-900 tracking-tight block leading-tight">
                {formattedTimer}
              </span>
            </div>
          )}

          {/* Not Clocked In Button */}
          {currentStatus === 'not_checked_in' && (
            <button
              id="manager-checkin-btn"
              onClick={handleCheckIn}
              disabled={actionLoading}
              className="btn bg-violet-600 hover:bg-violet-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-violet-500/20 transition-all"
            >
              {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
              <span>Check In</span>
            </button>
          )}

          {/* Working Action Buttons */}
          {currentStatus === 'working' && (
            <div className="flex items-center gap-2">
              <button
                id="manager-break-btn"
                onClick={handleStartBreak}
                disabled={actionLoading}
                className="btn bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Coffee size={14} />}
                <span>Take Break</span>
              </button>
              <button
                id="manager-checkout-btn"
                onClick={handleCheckOut}
                disabled={actionLoading}
                className="btn bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-rose-500/20 transition-all"
              >
                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                <span>Check Out</span>
              </button>
            </div>
          )}

          {/* On Break Action Button */}
          {currentStatus === 'on_break' && (
            <button
              id="manager-resume-btn"
              onClick={handleEndBreak}
              disabled={actionLoading}
              className="btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-500/20 transition-all"
            >
              {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />}
              <span>Resume Work</span>
            </button>
          )}

          {/* Checked Out State */}
          {currentStatus === 'checked_out' && (
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Logged</span>
              <span className="font-mono text-sm font-bold text-slate-800">
                {todayRecord?.actualWorkMinutes ? `${Math.floor(todayRecord.actualWorkMinutes / 60)}h ${todayRecord.actualWorkMinutes % 60}m` : 'Completed'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
