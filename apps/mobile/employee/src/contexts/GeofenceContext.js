import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import api from '../lib/api';
import {
  startPresenceTracking,
  stopPresenceTracking,
  subscribePresenceUpdates,
} from '../services/presenceTracking';
import { playGeofenceAlert } from '../lib/sound';

const GeofenceContext = createContext(null);

export function GeofenceProvider({
  children,
  isCheckedIn,
  isCheckedOut,
  hasActiveBreak = false,
  heartbeatMonitoringEnabled = true,
  initialOfficeRadius = 100,
  onAttendanceClosed,
}) {
  const [session, setSession] = useState(null);
  const [alertLevel, setAlertLevel] = useState(0);
  const [geofenceStatus, setGeofenceStatus] = useState('INSIDE');
  const [distance, setDistance] = useState(null);
  const [officeRadius, setOfficeRadius] = useState(initialOfficeRadius || 100);
  const [lastPingAt, setLastPingAt] = useState(null);
  const [insideConfirmCount, setInsideConfirmCount] = useState(0);
  const [graceSeconds, setGraceSeconds] = useState(0);
  const [warningModalOpen, setWarningModalOpen] = useState(false);

  useEffect(() => {
    if (initialOfficeRadius && Number(initialOfficeRadius) > 0) {
      setOfficeRadius(Number(initialOfficeRadius));
    }
  }, [initialOfficeRadius]);

  const prevAlertLevelRef = useRef(0);
  const sessionIdRef = useRef(null);

  /**
   * Restore Active Session from Authoritative Backend
   */
  const restoreSession = useCallback(async () => {
    if (!isCheckedIn || isCheckedOut) return;

    try {
      const res = await api.get('/employee/attendance/geofence/session');
      const data = res.data?.data;

      if (data?.hasActiveSession) {
        setSession(data);
        sessionIdRef.current = data.sessionId;
        const level = data.currentAlertLevel ?? 0;
        setAlertLevel(level);

        const r = data.radius ?? data.officeRadius;
        if (r !== undefined && r !== null && Number(r) > 0) {
          setOfficeRadius(Number(r));
        }

        if (data.distance !== undefined && data.distance !== null) {
          setDistance(Math.round(data.distance));
        }

        if (level > 0) {
          setWarningModalOpen(true);
        }

        if (level === 5 && data.gracePeriodRemainingSeconds !== undefined) {
          setGraceSeconds(data.gracePeriodRemainingSeconds);
        }
      } else {
        setSession(null);
        setAlertLevel(0);
        setGraceSeconds(0);
        setWarningModalOpen(false);
      }
    } catch (err) {
      console.log('[GeofenceContext] restoreSession notice:', err.message);
    }
  }, [isCheckedIn, isCheckedOut]);

  // Handle incoming presence ping results
  const handlePingResult = useCallback((result) => {
    if (!result) return;

    const newLevel = result.currentAlertLevel ?? 0;
    const newStatus = result.geofenceStatus ?? 'INSIDE';

    setSession((prev) => ({ ...prev, ...result }));
    sessionIdRef.current = result.sessionId || sessionIdRef.current;
    setGeofenceStatus(newStatus);
    setInsideConfirmCount(result.insideConfirmationCount ?? 0);

    if (result.distanceFromOfficeMeters !== undefined) {
      setDistance(Math.round(result.distanceFromOfficeMeters));
    } else if (result.distance !== undefined) {
      setDistance(Math.round(result.distance));
    }

    const r = result.radius ?? result.officeRadius;
    if (r !== undefined && r !== null && Number(r) > 0) {
      setOfficeRadius(Number(r));
    }

    setLastPingAt(Date.now());

    // Audio chime on level escalation
    if (newLevel > prevAlertLevelRef.current) {
      playGeofenceAlert(newLevel);
      setWarningModalOpen(true);
    }

    prevAlertLevelRef.current = newLevel;
    setAlertLevel(newLevel);

    if (newLevel === 5 && result.gracePeriodRemainingSeconds !== undefined) {
      setGraceSeconds(result.gracePeriodRemainingSeconds);
    }

    // If session was resolved by backend (3 returning confirmations)
    if (result.sessionResolved || newLevel === 0) {
      setWarningModalOpen(false);
      setGraceSeconds(0);
    }
  }, []);

  // Subscribe to live background/foreground ping updates
  useEffect(() => {
    const unsubscribe = subscribePresenceUpdates(handlePingResult);
    return () => unsubscribe();
  }, [handlePingResult]);

  // Manage Tracking Lifecycle based on shift status, break status, and heartbeat settings
  useEffect(() => {
    const isLunchHour = new Date().getHours() === 13;
    const shouldTrack = isCheckedIn && !isCheckedOut && !hasActiveBreak && !isLunchHour && heartbeatMonitoringEnabled;

    if (shouldTrack) {
      startPresenceTracking();
      restoreSession();
    } else {
      stopPresenceTracking();
      if (!heartbeatMonitoringEnabled || hasActiveBreak || isLunchHour) {
        setAlertLevel(0);
        setGraceSeconds(0);
        setWarningModalOpen(false);
      }
      if (!isCheckedIn || isCheckedOut) {
        setSession(null);
        setAlertLevel(0);
        setGraceSeconds(0);
        setWarningModalOpen(false);
      }
    }

    return () => {
      stopPresenceTracking();
    };
  }, [isCheckedIn, isCheckedOut, hasActiveBreak, heartbeatMonitoringEnabled, restoreSession]);

  // Listen for AppState transition to active to restore session
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isCheckedIn && !isCheckedOut) {
        restoreSession();
      }
    });

    return () => sub.remove();
  }, [isCheckedIn, isCheckedOut, restoreSession]);

  // Server-Authoritative Grace Period Countdown (1s local tick for smooth UI)
  useEffect(() => {
    if (alertLevel !== 5 || graceSeconds <= 0) return;

    const timer = setInterval(() => {
      setGraceSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Timer reached 00:00 -> trigger backend validation auto-checkout
          handleAutoCheckout(sessionIdRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [alertLevel, graceSeconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Auto-Checkout Revalidation with Backend
   */
  const handleAutoCheckout = async (sessionId) => {
    if (!sessionId) return;
    try {
      const res = await api.post('/employee/attendance/geofence/auto-checkout', { sessionId });
      if (res.data?.data?.autoCheckedOut) {
        setWarningModalOpen(false);
        setAlertLevel(0);
        setGraceSeconds(0);
        stopPresenceTracking();
        onAttendanceClosed?.();
      } else {
        restoreSession();
      }
    } catch (err) {
      console.log('[handleAutoCheckout] notice:', err.response?.data?.message || err.message);
      restoreSession();
    }
  };

  /**
   * Submit Out-of-Bounds Reason
   */
  const submitReason = async (reason) => {
    const res = await api.post('/employee/presence/reason', { reason });
    setWarningModalOpen(false);
    restoreSession();
    return res.data;
  };

  return (
    <GeofenceContext.Provider
      value={{
        session,
        alertLevel,
        geofenceStatus,
        distance,
        officeRadius,
        lastPingAt,
        insideConfirmCount,
        graceSeconds,
        warningModalOpen,
        setWarningModalOpen,
        restoreSession,
        submitReason,
        handleAutoCheckout,
      }}
    >
      {children}
    </GeofenceContext.Provider>
  );
}

export function useGeofence() {
  return useContext(GeofenceContext);
}
