import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateHaversineDistance } from './DistanceCalculator';
import api from '../lib/api';

const CHECKOUT_STATE_KEY = '@geofence_checkout_state';

class StrictGeofenceEngine {
  constructor() {
    this.mobileState = 'ACTIVE'; // ACTIVE | CHECKOUT_PENDING | CHECKED_OUT
    this.syncState = 'SYNCED';   // SYNCED | SYNCING | RETRYING
    this.configuredRadius = 50;
    this.officeCoordinate = null;
    this.sessionId = null;
    this.listeners = new Set();
  }

  setOfficeConfiguration(radius, lat, lng, sessionId) {
    if (radius !== undefined && radius !== null) this.configuredRadius = radius;
    if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
      this.officeCoordinate = { lat, lng };
    }
    this.sessionId = sessionId;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(data) {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  generateCheckoutEventId() {
    // Basic unique ID generator since we might not have uuid installed
    const randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padEnd(6, '0');
    return `geo-exit-${Date.now()}-${randomHex}`;
  }

  async processValidLocation(lat, lng) {
    if (this.mobileState !== 'ACTIVE') {
      return; // Stop processing once checkout sequence has started
    }

    if (!this.officeCoordinate) {
      return;
    }

    const rawDistance = calculateHaversineDistance(
      lat,
      lng,
      this.officeCoordinate.lat,
      this.officeCoordinate.lng
    );

    // Notify UI of live distance
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
    // 1. Set mobile state to block further location processing
    this.mobileState = 'CHECKOUT_PENDING';
    this.syncState = 'SYNCING';

    const checkoutEventId = this.generateCheckoutEventId();
    const payload = {
      checkoutEventId,
      sessionId: this.sessionId,
      distance,
      lat,
      lng,
      timestamp: new Date().toISOString(),
      reason: 'GEOFENCE_EXIT',
    };

    // 2. Persist locally first
    try {
      await AsyncStorage.setItem(CHECKOUT_STATE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('[GeofenceEngine] Failed to persist checkout state:', e);
    }

    this.notifyListeners({
      mobileState: this.mobileState,
      syncState: this.syncState,
      rawDistance: distance,
      configuredRadius: this.configuredRadius,
    });

    // 3. Attempt Server Synchronization
    this.attemptSync(payload);
  }

  async attemptSync(payload) {
    try {
      const res = await api.post('/employee/attendance/geofence/auto-checkout', payload);
      
      // Client-Side Idempotency Check:
      // Even if autoCheckedOut is false (because a previous retry succeeded), 
      // a 200 OK means the server handled it safely.
      if (res.status === 200) {
        this.markSynced();
      } else {
        throw new Error('API returned non-200 status');
      }
    } catch (error) {
      console.error('[GeofenceEngine] Sync failed, queueing retry:', error.message);
      this.syncState = 'RETRYING';
      this.notifyListeners({
        mobileState: this.mobileState,
        syncState: this.syncState,
      });

      // Simple retry mechanism (in a real production app, this would use an OS background job)
      setTimeout(() => {
        if (this.syncState === 'RETRYING') {
          this.attemptSync(payload);
        }
      }, 10000); // Retry every 10 seconds
    }
  }

  async markSynced() {
    this.mobileState = 'CHECKED_OUT';
    this.syncState = 'SYNCED';
    try {
      await AsyncStorage.removeItem(CHECKOUT_STATE_KEY);
    } catch (e) {
      // Ignore
    }

    this.notifyListeners({
      mobileState: this.mobileState,
      syncState: this.syncState,
    });
  }

  // Called when the app starts up to recover any pending checkouts
  async recoverPendingCheckout() {
    try {
      const data = await AsyncStorage.getItem(CHECKOUT_STATE_KEY);
      if (data) {
        const payload = JSON.parse(data);
        this.mobileState = 'CHECKOUT_PENDING';
        this.syncState = 'RETRYING';
        this.notifyListeners({
          mobileState: this.mobileState,
          syncState: this.syncState,
        });
        this.attemptSync(payload);
      }
    } catch (e) {
      console.error('[GeofenceEngine] Failed to recover pending checkout:', e);
    }
  }
}

export const geofenceEngine = new StrictGeofenceEngine();
