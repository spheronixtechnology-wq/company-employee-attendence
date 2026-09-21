import * as Location from 'expo-location';

/**
 * High-Accuracy GPS Multi-Sample Stabilization
 * Gathers up to 3 location fixes or returns early if accuracy <= 35m.
 * Prevents momentary GPS jitter from rejecting legitimate in-office check-ins.
 */
export async function getStabilizedLocation(maxSamples = 3, targetAccuracyMeters = 35) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location Access Required — please allow location access to verify your work location.');
  }

  const isLocationEnabled = await Location.hasServicesEnabledAsync();
  if (!isLocationEnabled) {
    throw new Error('Location Services Disabled — please turn on GPS on your device.');
  }

  let bestLocation = null;

  for (let i = 0; i < maxSamples; i++) {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      if (!bestLocation || loc.coords.accuracy < bestLocation.coords.accuracy) {
        bestLocation = loc;
      }

      // If accuracy is already very sharp, return immediately
      if (loc.coords.accuracy <= targetAccuracyMeters) {
        break;
      }
    } catch (err) {
      if (!bestLocation) {
        // Fallback to last known position if immediate fix fails
        bestLocation = await Location.getLastKnownPositionAsync();
      }
      break;
    }
  }

  if (!bestLocation || !bestLocation.coords) {
    throw new Error('Unable to acquire GPS coordinates. Please move to an open area and try again.');
  }

  return {
    lat: bestLocation.coords.latitude,
    lng: bestLocation.coords.longitude,
    accuracy: bestLocation.coords.accuracy,
    timestamp: bestLocation.timestamp || Date.now(),
  };
}
