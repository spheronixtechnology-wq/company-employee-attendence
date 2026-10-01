const { haversineDistance, isWithinGeofence } = require('../../src/utils/haversine');

describe('Haversine Distance Utility', () => {
  // Office Coordinate (College HQ - Approx)
  const officeLat = 17.385044;
  const officeLng = 78.486671;

  describe('haversineDistance()', () => {
    it('should return 0 when comparing the exact same coordinates', () => {
      const distance = haversineDistance(officeLat, officeLng, officeLat, officeLng);
      expect(distance).toBe(0);
    });

    it('should correctly calculate distance for coordinates ~110m apart', () => {
      const userLat = 17.385044;
      const userLng = 78.487700; // Shifted longitude slightly
      const distance = haversineDistance(userLat, userLng, officeLat, officeLng);
      expect(Math.round(distance)).toBe(109);
    });

    it('should calculate identical distance symmetrically (A to B == B to A)', () => {
      const userLat = 17.385044;
      const userLng = 78.487700;
      const dist1 = haversineDistance(userLat, userLng, officeLat, officeLng);
      const dist2 = haversineDistance(officeLat, officeLng, userLat, userLng);
      expect(dist1).toEqual(dist2);
    });
  });

  describe('isWithinGeofence()', () => {
    const defaultRadius = 100;

    it('should accept when effective distance is well within radius', () => {
      // 109m away, but accuracy of 20m means effective distance is 89m. (89 <= 100) -> inside
      const userLat = 17.385044;
      const userLng = 78.487700; // ~109m distance
      const result = isWithinGeofence(userLat, userLng, officeLat, officeLng, defaultRadius, 20);
      
      expect(result.inside).toBe(true);
      expect(result.effectiveDistanceMeters).toBe(89); // 109 - 20
    });

    it('should reject when effective distance strictly exceeds radius', () => {
      // ~109m away, accuracy of 5m means effective distance is 104m. (104 <= 100) -> outside
      const userLat = 17.385044;
      const userLng = 78.487700; // ~109m distance
      const result = isWithinGeofence(userLat, userLng, officeLat, officeLng, defaultRadius, 5);
      
      expect(result.inside).toBe(false);
      expect(result.outside).toBe(true);
      expect(result.effectiveDistanceMeters).toBe(104);
    });

    it('should cap usable accuracy at 50m to prevent malicious geofence expansion', () => {
      // ~200m away, user fakes accuracy to 150m.
      // Capped accuracy will be 50m.
      // Effective distance = 200 - 50 = 150m.
      // Radius = 100m. 150 > 100 -> Outside.
      const distance = 200; // Mock distance by math
      const userLat = 17.386844; // ~200m north
      const userLng = 78.486671; 
      
      const result = isWithinGeofence(userLat, userLng, officeLat, officeLng, defaultRadius, 150);
      
      expect(result.usableAccuracyMeters).toBe(50);
      expect(result.inside).toBe(false);
    });

    it('should reject and return an error payload on insanely bad GPS accuracy (>500m)', () => {
      const result = isWithinGeofence(officeLat, officeLng, officeLat, officeLng, defaultRadius, 600);
      expect(result.inside).toBe(false);
      expect(result.error).toBe("Invalid GPS accuracy");
    });

    it('should reject malformed coordinate inputs', () => {
      const result = isWithinGeofence('bad', 'data', officeLat, officeLng, defaultRadius, 10);
      expect(result.inside).toBe(false);
      expect(result.error).toBe("Invalid GPS coordinates");
    });
  });
});
