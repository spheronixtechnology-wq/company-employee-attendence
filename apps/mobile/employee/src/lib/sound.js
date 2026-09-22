import { Vibration } from 'react-native';

/**
 * Triggers native vibration based on geofence alert level
 */
export async function playGeofenceAlert(level = 1) {
  try {
    // 1. Native Vibration pattern: longer vibration for higher alert levels
    if (level >= 5) {
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    } else if (level >= 3) {
      Vibration.vibrate([0, 300, 150, 300]);
    } else {
      Vibration.vibrate(400);
    }
  } catch (err) {
    console.warn('[playGeofenceAlert] vibration error:', err.message);
  }
}

export function stopGeofenceAlert() {
  Vibration.cancel();
}
