/**
 * Haversine formula — calculates distance between two GPS coordinates.
 * Returns distance in meters.
 *
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lng1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lng2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in meters
 */
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const EARTH_RADIUS_METERS = 6371000; // Earth radius in meters

  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

/**
 * Check if a given point is within a geofence.
 *
 * @param {number} userLat
 * @param {number} userLng
 * @param {number} officeLat
 * @param {number} officeLng
 * @param {number} radiusMeters
 * @returns {{ inside: boolean, distanceMeters: number }}
 */
const isWithinGeofence = (userLat, userLng, officeLat, officeLng, radiusMeters, accuracyMeters = 0) => {
  const accuracy = Number(accuracyMeters);

  // Guard against malicious or completely invalid inputs
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 500) {
    return { inside: false, uncertain: false, outside: true, error: 'Invalid accuracy reading' };
  }

  const distanceMeters = haversineDistance(userLat, userLng, officeLat, officeLng);

  // The closest they could possibly be
  const minimumPossibleDistance = Math.max(0, distanceMeters - accuracy);
  
  // The furthest they could possibly be
  const maximumPossibleDistance = distanceMeters + accuracy;

  // Decision Logic
  const definitelyInside = maximumPossibleDistance <= radiusMeters;
  const definitelyOutside = minimumPossibleDistance > radiusMeters;
  const uncertain = !definitelyInside && !definitelyOutside;

  return {
    inside: definitelyInside,
    uncertain,
    outside: definitelyOutside,
    distanceMeters: Math.round(distanceMeters),
    accuracy: Math.round(accuracy)
  };
};

module.exports = { haversineDistance, isWithinGeofence };
