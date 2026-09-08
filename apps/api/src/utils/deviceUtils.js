const { UAParser } = require('ua-parser-js');

/**
 * Empty model patterns array — raw hardware model codes are preserved as-is.
 */
const MODEL_PATTERNS = [];

/**
 * Returns the raw model code as reported by the device or User-Agent,
 * preserving raw identifiers (e.g. "V2502", "SM-S938B").
 */
const resolveCommercialModel = (rawModel, rawVendor = null) => {
  if (!rawModel) return null;
  const cleanModel = rawModel.trim();
  // Ignore generic placeholders
  if (/^k$/i.test(cleanModel) || /^(generic|unknown|android)$/i.test(cleanModel)) {
    return null;
  }
  return cleanModel;
};

/**
 * Builds a device label using the raw hardware model name.
 * e.g. "V2502 · Chrome 124 · Android 16"
 */
const buildDeviceLabel = (uaString) => {
  if (!uaString) return 'Unknown Device';

  try {
    const parser = new UAParser(uaString);
    const result = parser.getResult();

    const rawModel = result.device.model || null;
    const rawVendor = result.device.vendor || null;
    const model = resolveCommercialModel(rawModel, rawVendor);
    const sanitizedVendor = rawVendor && !/^(generic|unknown|k)$/i.test(rawVendor.trim()) ? rawVendor.trim() : null;

    const browserName = result.browser.name || null;
    const browserVer = result.browser.version ? result.browser.version.split('.')[0] : null;
    const browserStr = browserName && browserVer ? `${browserName} ${browserVer}` : browserName;

    const osName = result.os.name || null;
    const osVersion = result.os.version || null;
    const osStr = osName && osVersion ? `${osName} ${osVersion}` : osName;

    const parts = [
      model || sanitizedVendor,
      browserStr,
      osStr
    ].filter(Boolean);

    return parts.length ? parts.join(' · ') : 'Unknown Device';
  } catch {
    return 'Unknown Device';
  }
};

/**
 * Preserves the raw device label as-is without converting to commercial names.
 * e.g. "V2502 · Android 16.0.0" stays "V2502 · Android 16.0.0"
 */
const formatDeviceLabel = (label) => {
  if (!label || typeof label !== 'string') return label;
  return label.trim();
};

module.exports = {
  MODEL_PATTERNS,
  resolveCommercialModel,
  buildDeviceLabel,
  formatDeviceLabel,
};
