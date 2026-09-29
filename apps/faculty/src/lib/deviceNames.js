export const resolveCommercialModel = (rawModel) => {
  if (!rawModel) return null;
  return rawModel.trim();
};

export const isGenericOrMaskedModel = (modelStr) => {
  if (!modelStr || !modelStr.trim()) return true;
  const m = modelStr.trim().toLowerCase();
  return (
    m === 'k' ||
    m === 'generic' ||
    m === 'unknown' ||
    m === 'unknown device' ||
    m === 'android' ||
    m === 'android device'
  );
};

export const getGpuRenderer = () => {
  try {
    if (typeof document === 'undefined') return '';
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return '';
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
    const match = renderer.match(/(Adreno\s*(?:\(TM\))?\s*[0-9]+|Mali-[A-Za-z0-9-]+|Apple\s*GPU|PowerVR[^\s,]+|GeForce[^\s,]+)/i);
    return match ? match[1].replace(/\(TM\)/i, '').replace(/\s+/g, ' ').trim() : '';
  } catch {
    return '';
  }
};

export const getDeviceInfo = async () => {
  let detectedModel = '';
  let detectedOs = '';
  let isMobile = false;

  // 1. Try High Entropy Client Hints (returns exact raw model code e.g. "V2502")
  try {
    if (typeof navigator !== 'undefined' && navigator.userAgentData?.getHighEntropyValues) {
      const hints = await navigator.userAgentData.getHighEntropyValues([
        'model',
        'platform',
        'platformVersion'
      ]);

      const rawModel = hints.model || '';
      if (rawModel && !isGenericOrMaskedModel(rawModel)) {
        detectedModel = rawModel.trim();
      }

      const platform = hints.platform || '';
      const version = hints.platformVersion || '';
      if (platform) {
        detectedOs = version ? `${platform} ${version}` : platform;
      }
    }
  } catch {}

  // 2. Fallback to classic userAgent string if model or OS not found
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);

    if (!detectedOs) {
      if (/iPhone/i.test(ua)) {
        const m = ua.match(/OS ([0-9_]+)/);
        detectedOs = `iOS ${m ? m[1].replace(/_/g, '.') : ''}`.trim();
      } else if (/iPad/i.test(ua)) {
        detectedOs = 'iPadOS';
      } else if (/Android/i.test(ua)) {
        const m = ua.match(/Android ([0-9.]+)/);
        detectedOs = `Android ${m ? m[1] : ''}`.trim();
      } else if (/Windows/i.test(ua)) {
        detectedOs = 'Windows';
      } else if (/Mac/i.test(ua)) {
        detectedOs = 'macOS';
      } else {
        detectedOs = 'Desktop / Mobile';
      }
    }

    if (!detectedModel) {
      if (/iPhone/i.test(ua)) {
        detectedModel = 'iPhone';
      } else if (/iPad/i.test(ua)) {
        detectedModel = 'iPad';
      } else if (/Android/i.test(ua)) {
        const match = ua.match(/Android[^;]+;\s*([^;)]+)\)/i);
        if (match && match[1]) {
          const candidate = match[1].trim();
          if (!isGenericOrMaskedModel(candidate)) {
            detectedModel = candidate;
          }
        }
      }
    }
  }

  // 3. If model still not found, try hardware GPU signature
  if (!detectedModel) {
    const gpu = getGpuRenderer();
    if (gpu) {
      detectedModel = isMobile ? `Mobile (${gpu})` : `Device (${gpu})`;
    } else {
      detectedModel = isMobile ? 'Mobile Phone' : 'Personal Computer';
    }
  }

  // Combine into single raw device label e.g. "V2502 · Android 16.0.0"
  const fullLabel = detectedOs 
    ? `${detectedModel} · ${detectedOs}` 
    : detectedModel;

  return {
    model: detectedModel,
    os: detectedOs || 'Android',
    fullLabel: fullLabel.slice(0, 80),
    isMobile,
  };
};
