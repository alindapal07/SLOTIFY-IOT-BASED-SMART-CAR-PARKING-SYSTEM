const crypto = require('crypto');

// Derive a 32-byte key from JWT_SECRET or fallback
const SECRET = process.env.JWT_SECRET || 'fallback_secret_key_32_chars_long!';
const ALGORITHM = 'aes-256-cbc';
const KEY = crypto.createHash('sha256').update(SECRET).digest();

/**
 * Encrypt booking payload into an opaque secure string
 */
function encryptPayload(payload) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Combine IV and encrypted content for storage/transmission
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt secure QR string back into JSON payload
 */
function decryptPayload(qrText) {
  try {
    const parts = qrText.split(':');
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return null;
  }
}

module.exports = {
  encryptPayload,
  decryptPayload
};
