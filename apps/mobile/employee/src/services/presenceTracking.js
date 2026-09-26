import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import api from '../lib/api';
import { isLocationValid } from '../location/LocationValidator';
import { geofenceEngine } from '../geofence/GeofenceEngine';
export const PRESENCE_TASK_NAME = 'SPHERONIX_PRESENCE_PING_TASK';

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const isAndroidExpoGo = Platform.OS === 'android' && isExpoGo;

// In-memory subscribers for location ping updates
const listeners = new Set();

export function subscribePresenceUpdates(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifySubscribers(result) {
  for (const fn of listeners) {
    try {
      fn(result);
    } catch (e) {
      console.error('[notifySubscribers] listener error:', e);
    }
  }
}

/**
 * Execute single presence ping to authoritative backend
 */
export async function sendPresencePing(coords) {
  try {
    const payload = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy || 0,
    };

    const res = await api.post('/employee/presence/ping', payload);
    if (res.data?.success) {
      const result = res.data.data;
      notifySubscribers(result);
      return result;
    }
    return null;
  } catch (err) {
    // Network fluctuations or temporary disconnections are non-fatal in background tracking;
    // log cleanly without triggering React Native LogBox popups on device.
    console.log('[sendPresencePing] ping notice:', err.response?.data?.message || err.message);
    return null;
  }
}

/**
 * Register Background Task for Foreground Service location pings
 */
TaskManager.defineTask(PRESENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(`[${PRESENCE_TASK_NAME}] Task error:`, error.message);
    return;
  }

  if (data && data.locations && data.locations.length > 0) {
    const latest = data.locations[data.locations.length - 1];
    if (isLocationValid(latest)) {
      // 1. Process Strict Local Geofence
      await geofenceEngine.processValidLocation(latest.coords.latitude, latest.coords.longitude);
      
      // 2. Send generic presence ping to backend (for path logging)
      await sendPresencePing(latest.coords);
    }
  }
});

let foregroundSubscription = null;

/**
 * Start Foreground Service with persistent sticky ongoing notification
 */
export async function startPresenceTracking() {
  if (!isAndroidExpoGo) {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(PRESENCE_TASK_NAME).catch(() => false);
    if (!hasStarted) {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        // Try to request background permissions, but don't strictly require it to start the foreground service.
        // Android foreground services with a sticky notification can continue tracking without 'Allow all the time'.
        await Location.requestBackgroundPermissionsAsync().catch(() => {});
        
        try {
          await Location.startLocationUpdatesAsync(PRESENCE_TASK_NAME, {
            accuracy: Location.Accuracy.Highest,
            timeInterval: 3000, // Target 3 seconds
            distanceInterval: 0, 
            deferredUpdatesInterval: 3000,
            foregroundService: {
              notificationTitle: 'Spheronix Active Shift Tracking',
              notificationBody: 'Attendance geofence monitoring is active.',
              notificationColor: '#6366f1',
            },
          });
          console.log('✅ Android Foreground Service location updates started.');
        } catch (e) {
          console.log('Location.startLocationUpdatesAsync notice:', e.message);
        }
      }
    }
  } else {
    // In Expo Go, ensure foreground permission is requested without invoking background location APIs
    await Location.requestForegroundPermissionsAsync().catch(() => {});
  }

  // Use watchPositionAsync for highly reliable foreground tracking (works perfectly in Expo Go)
  if (!foregroundSubscription) {
    try {
      foregroundSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 3000, // Target 3 seconds
          distanceInterval: 0, // Removed distance interval so it emits every 15s even when stationary
        },
        async (loc) => {
          if (isLocationValid(loc)) {
            console.log('[watchPositionAsync] Got fresh coords:', loc.coords.latitude, loc.coords.longitude);
            await geofenceEngine.processValidLocation(loc.coords.latitude, loc.coords.longitude);
            await sendPresencePing(loc.coords);
          }
        }
      );
      console.log('✅ Foreground watchPositionAsync started.');
    } catch (err) {
      console.error('[watchPositionAsync] failed to start:', err.message);
    }
  }
}

/**
 * Stop Foreground Service and clear ping timer upon checkout
 */
export async function stopPresenceTracking() {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
    console.log('🛑 Foreground watchPositionAsync stopped.');
  }

  if (!isAndroidExpoGo) {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(PRESENCE_TASK_NAME).catch(() => false);
    if (hasStarted) {
      try {
        await Location.stopLocationUpdatesAsync(PRESENCE_TASK_NAME);
        console.log('🛑 Android Foreground Service stopped.');
      } catch (e) {
        console.log('Location.stopLocationUpdatesAsync notice:', e.message);
      }
    }
  }
}
