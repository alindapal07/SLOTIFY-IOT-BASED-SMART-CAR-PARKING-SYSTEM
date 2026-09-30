const jwt = require('jsonwebtoken');

/**
 * Generate a signed QR token containing required claims.
 * @param {Object} payload - Claims to include (bookingId, providerId, lotId, slotId, vehicleNumber).
 * @returns {string} Signed JWT.
 */
function generateQRToken(payload) {
  const secret = process.env.QR_SECRET;
  if (!secret) {
    throw new Error('QR_SECRET environment variable is not set');
  }
  const token = jwt.sign(
    {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      // Token valid for 24 hours by default; can be overridden per use case.
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    },
    secret,
    { algorithm: 'HS256' }
  );
  return token;
}

/**
 * Verify a QR token and return its decoded payload.
 * @param {string} token - JWT token.
 * @returns {Object|null} Decoded payload if valid, otherwise null.
 */
function verifyQRToken(token) {
  const secret = process.env.QR_SECRET;
  if (!secret) {
    throw new Error('QR_SECRET environment variable is not set');
  }
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return decoded;
  } catch (err) {
    return null;
  }
}

module.exports = { generateQRToken, verifyQRToken };
