import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import api from '../lib/api';

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
    if (latest && latest.coords) {
      await sendPresencePing(latest.coords);
    }
  }
});

let foregroundInterval = null;

/**
 * Start Foreground Service with persistent sticky ongoing notification
 */
export async function startPresenceTracking() {
  if (!isAndroidExpoGo) {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(PRESENCE_TASK_NAME).catch(() => false);
    if (!hasStarted) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          await Location.startLocationUpdatesAsync(PRESENCE_TASK_NAME, {
            accuracy: Location.Accuracy.High,
            timeInterval: 30000, // 30 seconds
            distanceInterval: 10, // 10 meters
            deferredUpdatesInterval: 30000,
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

  // Also maintain an active in-app 30s timer while app is alive in foreground
  if (!foregroundInterval) {
    foregroundInterval = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (loc?.coords) {
          await sendPresencePing(loc.coords);
        }
      } catch (err) {
        // Location acquire failure
      }
    }, 30000);
  }
}

/**
 * Stop Foreground Service and clear ping timer upon checkout
 */
export async function stopPresenceTracking() {
  if (foregroundInterval) {
    clearInterval(foregroundInterval);
    foregroundInterval = null;
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
