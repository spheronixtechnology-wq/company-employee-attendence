/**
 * Local implementation of the Haversine formula to compute
 * the exact mathematical distance between two coordinates.
 */
export function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
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
}
