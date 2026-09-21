/**
 * Structural QR Validator for Spheronix Attendance System
 * 100% parity with web isValidOfficeQr and isValidCheckoutQr in DashboardPage.jsx
 */

export const isValidOfficeQr = (text) => {
  if (!text || typeof text !== 'string') return false;
  try {
    const parsed = JSON.parse(text);
    return Boolean(
      parsed &&
      parsed.type === 'OFFICE_QR' &&
      typeof parsed.officeId === 'string' &&
      typeof parsed.sig === 'string' &&
      parsed.sig.length === 64 &&
      typeof parsed.expiresAt === 'number' &&
      Number.isFinite(parsed.expiresAt) &&
      parsed.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
};

export const isValidCheckoutQr = (text) => {
  if (!text || typeof text !== 'string') return false;
  try {
    const parsed = JSON.parse(text);
    return Boolean(parsed && parsed.type === 'CHECKOUT_QR' && typeof parsed.token === 'string');
  } catch {
    return /^[a-f0-9]{32}$/i.test(text.trim());
  }
};

export default {
  isValidOfficeQr,
  isValidCheckoutQr,
};
