const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const BiometricCredential = require('../models/BiometricCredential');
const RegisteredDevice = require('../models/RegisteredDevice');
const { writeAuditLog } = require('./audit.service');

// In-memory challenge store: Map<userIdStr, { challenge: string, type: 'registration'|'authentication', expiresAt: number }>
const challengeStore = new Map();

// In-memory consumed token JTI store: Map<jtiString, expiresAtNumber>
const consumedJtis = new Map();

// Periodic cleanup every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of challengeStore.entries()) {
    if (val.expiresAt < now) challengeStore.delete(key);
  }
  for (const [jti, exp] of consumedJtis.entries()) {
    if (exp < now) consumedJtis.delete(jti);
  }
}, 60000);

const getRpId = (req) => {
  if (process.env.RP_ID) return process.env.RP_ID;
  const originHeader = req.headers['origin'] || req.headers['referer'];
  if (originHeader) {
    try {
      const url = new URL(originHeader);
      return url.hostname;
    } catch {}
  }
  const forwardedHost = req.headers['x-forwarded-host'];
  if (forwardedHost) {
    return forwardedHost.split(':')[0];
  }
  const host = req.hostname || 'localhost';
  return host.split(':')[0];
};

const getOrigin = (req) => {
  const originHeader = req.headers['origin'] || req.headers['referer'];
  if (originHeader) {
    try {
      const url = new URL(originHeader);
      return `${url.protocol}//${url.host}`;
    } catch {}
  }
  return process.env.EXPECTED_ORIGIN || 'https://localhost:3002';
};

/**
 * Generate Registration / Enrollment Options
 */
const generateEnrollmentOptionsForUser = async (user, registeredDevice, req) => {
  const userIdStr = user._id.toString();
  const rpID = getRpId(req);
  const expectedOrigin = getOrigin(req);

  // Exclude existing credentials for this user
  const existingCreds = await BiometricCredential.find({ userId: user._id, isActive: true });
  const excludeCredentials = existingCreds.map((cred) => ({
    id: cred.credentialID,
    transports: cred.transports || ['internal'],
  }));

  const options = await generateRegistrationOptions({
    rpName: process.env.RP_NAME || 'Spheronix Attendance System',
    rpID,
    userID: Buffer.from(userIdStr),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials,
    timeout: 300000,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
  });

  // WebAuthn L3 hint to prioritize local platform authenticator
  options.hints = ['client-device'];

  challengeStore.set(userIdStr, {
    challenge: options.challenge,
    type: 'registration',
    rpID,
    expectedOrigin,
    registeredDeviceId: registeredDevice._id,
    expiresAt: Date.now() + 300000,
  });

  return options;
};

/**
 * Verify Registration / Enrollment Response
 */
const verifyEnrollmentResponseForUser = async (user, response, req) => {
  const userIdStr = user._id.toString();
  const stored = challengeStore.get(userIdStr);

  if (!stored || stored.type !== 'registration' || Date.now() > stored.expiresAt) {
    challengeStore.delete(userIdStr);
    throw new Error('Enrollment challenge expired or not found. Please try again.');
  }

  challengeStore.delete(userIdStr);

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: stored.expectedOrigin,
    expectedRPID: stored.rpID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Biometric registration verification failed.');
  }

  const regInfo = verification.registrationInfo;
  const credentialID = regInfo.credentialID || regInfo.credential?.id;
  const credentialPublicKey = regInfo.credentialPublicKey || regInfo.credential?.publicKey;
  const counter = regInfo.counter ?? regInfo.credential?.counter ?? 0;

  if (!credentialID || !credentialPublicKey) {
    throw new Error('No credential returned by platform authenticator.');
  }

  // Deactivate any old credentials for this specific registeredDevice if re-enrolling
  await BiometricCredential.updateMany(
    { registeredDeviceId: stored.registeredDeviceId },
    { isActive: false }
  );

  const newCredential = new BiometricCredential({
    userId: user._id,
    registeredDeviceId: stored.registeredDeviceId,
    credentialID,
    credentialPublicKey: Buffer.from(credentialPublicKey),
    counter,
    rpID: stored.rpID,
    expectedOrigin: stored.expectedOrigin,
    transports: response.response?.transports || ['internal'],
    isActive: true,
    lastUsedAt: new Date(),
  });

  await newCredential.save();

  await writeAuditLog({
    action: 'BIOMETRIC_ENROLLED',
    performedBy: user,
    targetCollection: 'BiometricCredential',
    targetId: newCredential._id,
    metadata: {
      credentialID,
      rpID: stored.rpID,
      registeredDeviceId: stored.registeredDeviceId,
    },
    ipAddress: req.ip,
  });

  return newCredential;
};

/**
 * Generate Authentication Options
 */
const generateAuthOptionsForUser = async (user, activeDeviceId, req) => {
  const userIdStr = user._id.toString();

  // Defense-in-depth: only consider credentials matching user's currently ACTIVE RegisteredDevice
  const activeCreds = await BiometricCredential.find({
    userId: user._id,
    registeredDeviceId: activeDeviceId,
    isActive: true,
  });

  if (activeCreds.length === 0) {
    throw new Error('No active biometric credentials enrolled on this device.');
  }

  const allowCredentials = activeCreds.map((cred) => ({
    id: cred.credentialID,
    transports: cred.transports || ['internal'],
  }));

  // Use the stored rpID from the user's active credential
  const rpID = activeCreds[0].rpID || getRpId(req);

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'required',
    timeout: 300000,
  });

  // WebAuthn L3 hint to prioritize local platform authenticator
  options.hints = ['client-device'];

  challengeStore.set(userIdStr, {
    challenge: options.challenge,
    type: 'authentication',
    activeDeviceId,
    expiresAt: Date.now() + 300000,
  });

  return options;
};

/**
 * Verify Authentication Response & Issue 120s biometricToken
 */
const verifyAuthResponseForUser = async (user, response, activeDeviceId, req) => {
  const userIdStr = user._id.toString();
  const stored = challengeStore.get(userIdStr);

  if (!stored || stored.type !== 'authentication' || Date.now() > stored.expiresAt) {
    challengeStore.delete(userIdStr);
    throw new Error('Authentication challenge expired or not found. Please try again.');
  }

  challengeStore.delete(userIdStr);

  // Defense-in-depth: find credential for user on this ACTIVE device
  const credential = await BiometricCredential.findOne({
    userId: user._id,
    credentialID: response.id,
    registeredDeviceId: activeDeviceId,
    isActive: true,
  });

  if (!credential) {
    throw new Error('Biometric credential not authorized for this active device.');
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: credential.expectedOrigin,
    expectedRPID: credential.rpID,
    authenticator: {
      credentialID: credential.credentialID,
      credentialPublicKey: credential.credentialPublicKey,
      counter: credential.counter,
      transports: credential.transports,
    },
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error('Biometric authentication failed.');
  }

  const { newCounter } = verification.authenticationInfo;

  // Counter regression check (Authenticator Clone Detection)
  if (newCounter <= credential.counter && credential.counter > 0) {
    throw new Error('Authenticator counter regression detected. Potential clone attempt.');
  }

  // Update counter and lastUsedAt
  credential.counter = newCounter;
  credential.lastUsedAt = new Date();
  await credential.save();

  // Generate short-lived single-use biometricToken (120 seconds)
  const jti = crypto.randomUUID();
  const expiresAtMs = Date.now() + 120 * 1000;

  const biometricToken = jwt.sign(
    {
      userId: userIdStr,
      credentialId: credential.credentialID,
      purpose: 'attendance_biometric',
      jti,
    },
    process.env.JWT_SECRET,
    { expiresIn: '120s' }
  );

  await writeAuditLog({
    action: 'BIOMETRIC_AUTH_SUCCESS',
    performedBy: user,
    targetCollection: 'BiometricCredential',
    targetId: credential._id,
    metadata: {
      credentialID: credential.credentialID,
      newCounter,
    },
    ipAddress: req.ip,
  });

  return {
    biometricToken,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
};

/**
 * Verify & Consume Biometric Token at check-in (Single-use replay protection)
 */
const verifyAndConsumeBiometricToken = (token, expectedUserId) => {
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.purpose !== 'attendance_biometric') return null;
    if (decoded.userId !== expectedUserId.toString()) return null;

    // Check single-use replay protection
    if (consumedJtis.has(decoded.jti)) {
      console.warn(`[Replay Attack Blocked] biometricToken jti ${decoded.jti} already consumed!`);
      return null;
    }

    // Mark as consumed until its expiry
    const expMs = (decoded.exp || Math.floor(Date.now() / 1000) + 120) * 1000;
    consumedJtis.set(decoded.jti, expMs);

    return decoded;
  } catch (err) {
    console.error('verifyAndConsumeBiometricToken error:', err.message);
    return null;
  }
};

module.exports = {
  generateEnrollmentOptionsForUser,
  verifyEnrollmentResponseForUser,
  generateAuthOptionsForUser,
  verifyAuthResponseForUser,
  verifyAndConsumeBiometricToken,
};
