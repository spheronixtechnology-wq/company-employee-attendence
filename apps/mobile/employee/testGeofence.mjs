import { strict as assert } from 'assert';

// --- MOCKS ---
const AsyncStorage = {
  data: {},
  setItem: async (k, v) => { AsyncStorage.data[k] = v; },
  getItem: async (k) => AsyncStorage.data[k] || null,
  removeItem: async (k) => { delete AsyncStorage.data[k]; }
};

let apiCalls = 0;
const api = {
  post: async (url, data) => {
    apiCalls++;
    console.log(`[API MOCK] Called ${url} with distance ${data.distance}`);
    // Simulate successful auto-checkout but returning autoCheckedOut: false (client idempotency test)
    return { status: 200, data: { success: true, autoCheckedOut: false } };
  }
};

// --- SOURCE COPIED ---
function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  const EARTH_RADIUS_METERS = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

class StrictGeofenceEngine {
  constructor() {
    this.mobileState = 'ACTIVE';
    this.syncState = 'SYNCED';
    this.configuredRadius = 50;
    this.officeCoordinate = null;
    this.sessionId = null;
    this.listeners = new Set();
  }

  setOfficeConfiguration(radius, lat, lng, sessionId) {
    if (radius !== undefined && radius !== null) this.configuredRadius = radius;
    if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) this.officeCoordinate = { lat, lng };
    this.sessionId = sessionId;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(data) {
    for (const listener of this.listeners) listener(data);
  }

  generateCheckoutEventId() {
    const randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padEnd(6, '0');
    return `geo-exit-${Date.now()}-${randomHex}`;
  }

  async processValidLocation(lat, lng) {
    if (this.mobileState !== 'ACTIVE') return;
    if (!this.officeCoordinate) return;

    const rawDistance = calculateHaversineDistance(
      lat, lng, this.officeCoordinate.lat, this.officeCoordinate.lng
    );

    this.notifyListeners({
      mobileState: this.mobileState,
      syncState: this.syncState,
      rawDistance,
      configuredRadius: this.configuredRadius,
    });

    if (rawDistance > this.configuredRadius) {
      await this.triggerCheckout(rawDistance, lat, lng);
    }
  }

  async triggerCheckout(distance, lat, lng) {
    this.mobileState = 'CHECKOUT_PENDING';
    this.syncState = 'SYNCING';

    const checkoutEventId = this.generateCheckoutEventId();
    const payload = {
      checkoutEventId,
      sessionId: this.sessionId,
      distance,
      lat, lng,
      timestamp: new Date().toISOString(),
      reason: 'GEOFENCE_EXIT',
    };

    await AsyncStorage.setItem('@geofence_checkout_state', JSON.stringify(payload));
    
    this.notifyListeners({
      mobileState: this.mobileState,
      syncState: this.syncState,
      rawDistance: distance,
      configuredRadius: this.configuredRadius,
    });

    await this.attemptSync(payload);
  }

  async attemptSync(payload) {
    try {
      const res = await api.post('/employee/attendance/geofence/auto-checkout', payload);
      if (res.status === 200) {
        await this.markSynced();
      } else {
        throw new Error('API returned non-200 status');
      }
    } catch (error) {
      this.syncState = 'RETRYING';
      this.notifyListeners({ mobileState: this.mobileState, syncState: this.syncState });
    }
  }

  async markSynced() {
    this.mobileState = 'CHECKED_OUT';
    this.syncState = 'SYNCED';
    await AsyncStorage.removeItem('@geofence_checkout_state');
    this.notifyListeners({ mobileState: this.mobileState, syncState: this.syncState });
  }
}

// --- TEST RUNNER ---
async function runTests() {
  console.log("=== Starting Geofence Simulation ===");
  const engine = new StrictGeofenceEngine();
  
  // Fake office coordinate (roughly 0,0)
  engine.setOfficeConfiguration(50, 0, 0, "test-session-123");

  let latestUiState = {};
  engine.subscribe((state) => {
    latestUiState = { ...latestUiState, ...state };
    if (state.rawDistance) {
      console.log(`[UI UPDATE] Distance: ${state.rawDistance.toFixed(2)}m | State: ${state.mobileState} | Sync: ${state.syncState}`);
    }
  });

  // Step 1: Walk around inside (1 degree latitude is ~111km, so 0.0001 is ~11.1m)
  console.log("\\n-- Employee is at 11m (Inside) --");
  await engine.processValidLocation(0.0001, 0);
  assert.equal(engine.mobileState, 'ACTIVE');

  console.log("\\n-- Employee is at 44m (Inside) --");
  await engine.processValidLocation(0.0004, 0);
  assert.equal(engine.mobileState, 'ACTIVE');

  // Step 2: Employee crosses the boundary to 55m
  console.log("\\n-- Employee moves to 55m (Crosses strict 50m radius) --");
  await engine.processValidLocation(0.0005, 0);
  
  // At this point, they should be checked out locally
  assert.equal(engine.mobileState, 'CHECKED_OUT'); // Because API mock returns 200 OK instantly
  assert.equal(apiCalls, 1);
  
  console.log("\\n-- Employee moves further to 66m --");
  await engine.processValidLocation(0.0006, 0);
  
  // State should NOT change, API should NOT be called again (duplicate prevention)
  assert.equal(engine.mobileState, 'CHECKED_OUT');
  assert.equal(apiCalls, 1); // Remains 1
  
  console.log("\\n=== All Tests Passed! Duplicate Checkout Prevented. ===");
}

runTests().catch(console.error);
