/**
 * Validates the quality of an OS-delivered location coordinate.
 */

const MAX_ACCEPTABLE_ACCURACY_METERS = 30;

export function isLocationValid(locationData) {
  if (!locationData || !locationData.coords) {
    return false;
  }

  const { latitude, longitude, accuracy } = locationData.coords;

  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !isFinite(latitude) ||
    !isFinite(longitude)
  ) {
    return false;
  }

  // Reject readings with poor accuracy (> 30m)
  if (typeof accuracy === 'number' && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
    console.log(`[LocationValidator] Dropped reading due to poor accuracy: ${accuracy}m (Limit: ${MAX_ACCEPTABLE_ACCURACY_METERS}m)`);
    return false;
  }

  return true;
}
