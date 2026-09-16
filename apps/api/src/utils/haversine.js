/**
 * Calculate distance between two GPS coordinates using Haversine formula.
 * Returns distance in meters.
 */
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const EARTH_RADIUS_METERS = 6371000;

  const toRadians = (degrees) => {
    return (degrees * Math.PI) / 180;
  };

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
};

/**
 * Accuracy-aware geofence check.
 *
 * Effective distance:
 *   actual GPS distance - capped GPS accuracy
 */
const isWithinGeofence = (
  userLat,
  userLng,
  officeLat,
  officeLng,
  radiusMeters,
  accuracyMeters = 0
) => {
  // Convert everything to numbers
  const lat = Number(userLat);
  const lng = Number(userLng);
  const officeLatitude = Number(officeLat);
  const officeLongitude = Number(officeLng);
  const radius = Number(radiusMeters);
  const accuracy = Number(accuracyMeters);

  // Validate coordinates
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(officeLatitude) ||
    !Number.isFinite(officeLongitude)
  ) {
    return {
      inside: false,
      outside: true,
      error: "Invalid GPS coordinates",
    };
  }

  // Validate radius
  if (!Number.isFinite(radius) || radius <= 0) {
    return {
      inside: false,
      outside: true,
      error: "Invalid geofence radius",
    };
  }

  // Validate GPS accuracy
  if (
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > 500
  ) {
    return {
      inside: false,
      outside: true,
      error: "Invalid GPS accuracy",
    };
  }

  // Calculate actual GPS distance
  const distanceMeters = haversineDistance(
    lat,
    lng,
    officeLatitude,
    officeLongitude
  );

  /*
   * Accuracy-aware calculation with CAP.
   * Cap usable accuracy to max 50 meters so terrible GPS 
   * doesn't expand the geofence indefinitely.
   */
  const usableAccuracy = Math.min(accuracy, 50);

  const effectiveDistance = Math.max(
    0,
    distanceMeters - usableAccuracy
  );

  /*
   * User is accepted when the closest plausible position
   * is within the configured geofence.
   */
  const inside = effectiveDistance <= radius;

  return {
    inside,
    outside: !inside,
    distanceMeters: Math.round(distanceMeters),
    accuracyMeters: Math.round(accuracy),
    usableAccuracyMeters: Math.round(usableAccuracy),
    effectiveDistanceMeters: Math.round(effectiveDistance),
    radiusMeters: Math.round(radius),
  };
};

module.exports = {
  haversineDistance,
  isWithinGeofence,
};
