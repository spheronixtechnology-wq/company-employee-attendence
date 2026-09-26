import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import api from '../lib/api';
import {
  startPresenceTracking,
  stopPresenceTracking,
} from '../services/presenceTracking';
import { geofenceEngine } from '../geofence/GeofenceEngine';

const GeofenceContext = createContext(null);

export function GeofenceProvider({
  children,
  isCheckedIn,
  isCheckedOut,
  hasActiveBreak = false,
  heartbeatMonitoringEnabled = true,
  initialOfficeRadius = 100,
  officeLocation = null, // { lat, lng }
  onAttendanceClosed,
}) {
  const [mobileState, setMobileState] = useState('ACTIVE');
  const [syncState, setSyncState] = useState('SYNCED');
  const [distance, setDistance] = useState(null);
  const [officeRadius, setOfficeRadius] = useState(initialOfficeRadius || 100);

  const sessionIdRef = useRef(null);

  // Sync initial props to geofence engine
  useEffect(() => {
    if (initialOfficeRadius && Number(initialOfficeRadius) > 0) {
      setOfficeRadius(Number(initialOfficeRadius));
    }
  }, [initialOfficeRadius]);

  const restoreSession = useCallback(async () => {
    if (!isCheckedIn || isCheckedOut) return;

    try {
      const res = await api.get('/employee/attendance/geofence/session');
      const data = res.data?.data;

      if (data?.hasActiveSession) {
        sessionIdRef.current = data.sessionId;
        
        const r = data.radius ?? data.officeRadius;
        if (r !== undefined && r !== null && Number(r) > 0) {
          setOfficeRadius(Number(r));
        }

        // Configure strict geofence engine
        if (officeLocation && officeLocation.latitude && officeLocation.longitude) {
          geofenceEngine.setOfficeConfiguration(
            r || officeRadius,
            officeLocation.latitude,
            officeLocation.longitude,
            data.sessionId
          );
        }
      } else {
        sessionIdRef.current = null;
      }
    } catch (err) {
      console.log('[GeofenceContext] restoreSession notice:', err.message);
    }
  }, [isCheckedIn, isCheckedOut, officeLocation, officeRadius]);

  // Subscribe to local Geofence Engine state
  useEffect(() => {
    const unsubscribe = geofenceEngine.subscribe((data) => {
      setMobileState(data.mobileState);
      setSyncState(data.syncState);
      
      if (data.rawDistance !== undefined) {
        setDistance(Math.round(data.rawDistance * 10) / 10); // 1 decimal place for precision UI
      }

      // If Engine transitions to CHECKED_OUT, trigger the callback
      if (data.mobileState === 'CHECKED_OUT') {
        stopPresenceTracking();
        onAttendanceClosed?.();
      }
    });

    return () => unsubscribe();
  }, [onAttendanceClosed]);

  // Attempt to recover any pending checkouts on mount
  useEffect(() => {
    geofenceEngine.recoverPendingCheckout();
  }, []);

  // Manage Tracking Lifecycle based on shift status
  useEffect(() => {
    const isLunchHour = new Date().getHours() === 13;
    const shouldTrack = isCheckedIn && !isCheckedOut && !hasActiveBreak && !isLunchHour && heartbeatMonitoringEnabled;

    if (shouldTrack) {
      // Re-configure engine before starting
      if (officeLocation && officeLocation.latitude && officeLocation.longitude) {
        geofenceEngine.setOfficeConfiguration(
          officeRadius,
          officeLocation.latitude,
          officeLocation.longitude,
          sessionIdRef.current
        );
      }
      startPresenceTracking();
      restoreSession();
    } else {
      stopPresenceTracking();
      if (!isCheckedIn || isCheckedOut) {
        // Reset state
        setMobileState('ACTIVE');
        setDistance(null);
      }
    }

    return () => stopPresenceTracking();
  }, [isCheckedIn, isCheckedOut, hasActiveBreak, heartbeatMonitoringEnabled, restoreSession, officeLocation, officeRadius]);

  return (
    <GeofenceContext.Provider
      value={{
        mobileState,
        syncState,
        distance,
        officeRadius,
      }}
    >
      {children}
    </GeofenceContext.Provider>
  );
}

export function useGeofence() {
  return useContext(GeofenceContext);
}
