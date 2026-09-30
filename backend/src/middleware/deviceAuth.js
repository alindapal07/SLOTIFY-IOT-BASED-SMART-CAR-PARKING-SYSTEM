const crypto = require('crypto');
const IoTDevice = require('../models/IoTDevice');
const DeviceLog = require('../models/DeviceLog');

const hashSHA256 = (str) => crypto.createHash('sha256').update(str).digest('hex');

/**
 * Device Authentication Middleware
 * 
 * Authenticates ESP32/IoT devices using deviceId + deviceToken.
 * Does NOT require JWT — designed for hardware devices that cannot
 * manage browser cookies or Bearer tokens.
 * 
 * Reads credentials from:
 *   - req.body.deviceId + req.body.deviceToken  (POST body)
 *   - req.query.deviceId + req.query.deviceToken (query params)
 *   - req.headers['x-device-id'] + req.headers['x-device-token'] (headers)
 * 
 * On success: attaches the full device document to req.device
 * On failure: returns 401 (invalid credentials) or 403 (device disabled)
 */
const deviceAuth = async (req, res, next) => {
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  // Extract deviceId and deviceToken from multiple sources
  const deviceId = req.body?.deviceId || req.query?.deviceId || req.headers['x-device-id'];
  const deviceToken = req.body?.deviceToken || req.query?.deviceToken || req.headers['x-device-token'];

  if (!deviceId || !deviceToken) {
    return res.status(400).json({
      success: false,
      message: 'deviceId and deviceToken are required for device authentication'
    });
  }

  try {
    // Hash the token and look up the device
    const deviceTokenHash = hashSHA256(deviceToken);
    const device = await IoTDevice.findOne({ deviceId, deviceTokenHash })
      .populate('zoneId', 'name location providerId')
      .populate('slotId', 'slotIdentifier floor isOccupied');

    if (!device) {
      // Log authentication failure
      await DeviceLog.create({
        deviceId,
        type: 'auth_failure',
        payload: { source: 'deviceAuth_middleware', ip: ipAddress },
        status: 'FAILED',
        error: 'Authentication failed: Invalid deviceId or deviceToken',
        ipAddress
      });

      return res.status(401).json({
        success: false,
        message: 'Device authentication failed: invalid credentials'
      });
    }

    // Check if device is enabled
    if (!device.isActive) {
      await DeviceLog.create({
        deviceId,
        type: 'auth_failure',
        payload: { source: 'deviceAuth_middleware', ip: ipAddress, reason: 'disabled' },
        status: 'FAILED',
        error: 'Device is disabled by provider',
        ipAddress
      });

      return res.status(403).json({
        success: false,
        message: 'Device is disabled. Contact your parking provider.'
      });
    }

    // Attach device to request object for downstream use
    req.device = device;
    req.deviceId = device.deviceId;
    req.ipAddress = ipAddress;

    next();
  } catch (err) {
    console.error('[deviceAuth] Middleware error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Device authentication error',
      error: err.message
    });
  }
};

module.exports = { deviceAuth };
