import { Vibration } from 'react-native';

let soundInstance = null;
let AudioModule = null;
let isAudioAvailable = null;

/**
 * Safely resolves the expo-av Audio module without crashing if ExponentAV native module is missing (e.g. in Expo Go)
 */
function isNativeModuleAvailable(name) {
  try {
    const { requireOptionalNativeModule } = require('expo-modules-core');
    if (typeof requireOptionalNativeModule === 'function') {
      return Boolean(requireOptionalNativeModule(name));
    }
  } catch {
    // fallback
  }
  return false;
}

/**
 * Safely resolves the expo-av Audio module without crashing if ExponentAV native module is missing (e.g. in Expo Go)
 */
function getAudioModule() {
  if (isAudioAvailable === false) return null;
  if (AudioModule) return AudioModule;

  try {
    // Verify ExponentAV is present in the native binary before requiring expo-av
    // This prevents require('expo-av') from calling requireNativeModule('ExponentAV') and crashing
    if (!isNativeModuleAvailable('ExponentAV')) {
      isAudioAvailable = false;
      return null;
    }

    const expoAv = require('expo-av');
    if (expoAv && expoAv.Audio) {
      AudioModule = expoAv.Audio;
      isAudioAvailable = true;
      return AudioModule;
    }
  } catch (err) {
    console.warn('[sound] Native ExponentAV module not present in this runtime; using native vibration fallback.');
    isAudioAvailable = false;
  }
  return null;
}

/**
 * Triggers native vibration and audio alert based on geofence alert level
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

    // 2. Safely attempt audio playback if native audio module is available in runtime
    const Audio = getAudioModule();
    if (!Audio) return;

    // Set audio mode for loud playback
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});

    // Unload previous sound if playing
    if (soundInstance) {
      await soundInstance.unloadAsync().catch(() => {});
      soundInstance = null;
    }

    // Load and play chime/beep tone from bundled assets
    let source;
    try {
      source = require('../../assets/alert_tune.mp3');
    } catch {
      source = { uri: 'https://cdn.freesound.org/previews/250/250629_4486188-lq.mp3' };
    }

    const { sound } = await Audio.Sound.createAsync(
      source,
      { shouldPlay: true, volume: level >= 4 ? 1.0 : 0.6 }
    );
    soundInstance = sound;
  } catch (err) {
    // If audio playback fails, vibration still executed
    console.warn('[playGeofenceAlert] audio playback error:', err.message);
  }
}

export function stopGeofenceAlert() {
  try {
    if (soundInstance) {
      soundInstance.stopAsync().catch(() => {});
      soundInstance.unloadAsync().catch(() => {});
      soundInstance = null;
    }
  } catch {
    soundInstance = null;
  }
  Vibration.cancel();
}
