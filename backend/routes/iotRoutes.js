const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const ParkingZone = require('../models/ParkingZone');
const ParkingSlot = require('../models/ParkingSlot');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const BookingAudit = require('../models/BookingAudit');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const { processQueueAllocation } = require('../services/queueService');
const { decryptPayload } = require('../utils/qrCrypto');
const { protect } = require('../middleware/authMiddleware');

const IoTConfiguration = require('../models/IoTConfiguration');
const IoTDevice = require('../models/IoTDevice');
const DeviceLog = require('../models/DeviceLog');

// Helper to hash tokens
const hashSHA256 = (str) => crypto.createHash('sha256').update(str).digest('hex');

// Helper to calculate distance in meters between two coordinates
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

// ═══════════════════════════════════════
// EXISTING BOOM BARRIER CAMERA ROUTE
// ═══════════════════════════════════════
router.post('/scan-qr', async (req, res) => {
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  let bookingIdForLog = null;
  let actionForLog = req.body.action || 'ENTRY';

  try {
    const { gateId, zoneId, qrPayload, action = 'ENTRY', driverLat, driverLng, clientDeviceFingerprint } = req.body;

    if (!qrPayload) {
      return res.status(400).json({ command: 'REJECTED', displayMessage: 'Missing QR payload' });
    }

    const decoded = decryptPayload(qrPayload);
    if (!decoded) {
      return res.status(400).json({ command: 'REJECTED', displayMessage: 'Security signature failed or QR tampered' });
    }

    const { bookingId, userId, version, signature } = decoded;
    bookingIdForLog = bookingId;

    const booking = await Booking.findById(bookingId).populate('zoneId').populate('slotId');
    if (!booking) {
      return res.status(404).json({ command: 'REJECTED', displayMessage: 'Booking not found' });
    }

    const now = new Date();
    const io = req.app.get('io');

    if (version !== booking.qrVersion) {
      booking.scanLogs.push({
        action, gateId, timestamp: now, status: 'FAILED',
        failureReason: 'QR_VERSION_SUPERSEDED', ipAddress,
        gpsCoordinates: driverLat && driverLng ? [parseFloat(driverLng), parseFloat(driverLat)] : []
      });
      await booking.save();
      return res.status(400).json({ command: 'REJECTED', displayMessage: 'QR code has been regenerated. Please load current QR.' });
    }

    const distanceLimit = 100; // meters
    if (driverLat && driverLng && booking.zoneId.location?.coordinates) {
      const zoneLng = booking.zoneId.location.coordinates[0];
      const zoneLat = booking.zoneId.location.coordinates[1];
      const distance = getDistanceMeters(parseFloat(driverLat), parseFloat(driverLng), zoneLat, zoneLng);

      if (distance > distanceLimit) {
        booking.scanLogs.push({
          action, gateId, timestamp: now, status: 'FAILED',
          failureReason: 'GPS_TOO_FAR', ipAddress,
          gpsCoordinates: [parseFloat(driverLng), parseFloat(driverLat)]
        });
        await booking.save();

        await AuditLog.create({
          userId: booking.userId,
          action: 'FRAUD_ALERT',
          details: `GPS Spoof Alert: Booking #${booking._id.toString().slice(-6)} entry attempted from ${distance.toFixed(1)}m away.`
        });

        return res.status(400).json({ command: 'REJECTED', displayMessage: 'GPS verification failed: Too far from gate.' });
      }
    }

    if (action === 'ENTRY') {
      if (booking.status !== 'Confirmed') {
        booking.scanLogs.push({
          action, gateId, timestamp: now, status: 'FAILED',
          failureReason: `INVALID_STATUS_${booking.status.toUpperCase()}`, ipAddress,
          gpsCoordinates: driverLat && driverLng ? [parseFloat(driverLng), parseFloat(driverLat)] : []
        });
        await booking.save();
        return res.status(400).json({ command: 'REJECTED', displayMessage: `Access Denied: Booking is ${booking.status}` });
      }

      const startLimit = new Date(booking.startTime.getTime() - 30 * 60 * 1000);
      const endLimit = new Date(booking.endTime.getTime() + 45 * 60 * 1000);

      if (now < startLimit) {
        return res.status(400).json({ command: 'REJECTED', displayMessage: 'Access Denied: Arrived too early for reservation.' });
      }
      if (now > endLimit) {
        booking.status = 'Expired';
        await booking.save();

        await ParkingSlot.findByIdAndUpdate(booking.slotId._id, { isOccupied: false, currentBookingId: null });
        const zone = await ParkingZone.findById(booking.zoneId._id);
        if (zone) {
          zone.availableSlots = Math.min(zone.totalSlots, zone.availableSlots + 1);
          await zone.save();
        }

        return res.status(400).json({ command: 'REJECTED', displayMessage: 'Access Denied: Reservation has expired.' });
      }

      // Check if slot is currently blocked by another booking that is active/entering/parked/exiting
      const blockBooking = await Booking.findOne({
        slotId: booking.slotId._id,
        status: { $in: ['Active', 'ENTERING', 'PARKED', 'EXITING'] }
      });

      let assignedSlotIdentifier = booking.slotId.slotIdentifier;
      let finalSlotId = booking.slotId._id;

      if (blockBooking) {
        // Upgrade to emergency slot
        const emergencySlot = await ParkingSlot.findOneAndUpdate(
          { zoneId: booking.zoneId._id, isEmergency: true, isOccupied: false, isUnderMaintenance: false, currentBookingId: null },
          { $set: { isOccupied: false, currentBookingId: booking._id } }, // remains isOccupied: false until sensor confirms
          { new: true }
        );

        if (emergencySlot) {
          const oldSlotId = booking.slotId._id;
          booking.slotId = emergencySlot._id;
          booking.isEmergencyUpgraded = true;
          booking.originalSlotId = oldSlotId;

          assignedSlotIdentifier = emergencySlot.slotIdentifier;
          finalSlotId = emergencySlot._id;

          blockBooking.causedReassignment = true;
          blockBooking.reassignedBookingId = booking._id;
          await blockBooking.save();

          await notificationService.sendNotification(
            req.app,
            booking.userId,
            'Slot Upgraded',
            `Your slot was occupied. Please park at EMG-slot: ${emergencySlot.slotIdentifier}.`,
            'INFO'
          );
        } else {
          return res.status(400).json({ command: 'REJECTED', displayMessage: 'Reserved slot is blocked and no emergency slots are free.' });
        }
      } else {
        // Hold the original slot
        await ParkingSlot.findByIdAndUpdate(booking.slotId._id, { isOccupied: false, currentBookingId: booking._id });
      }

      // Check if slot has active IoT device mapped (presence sensor)
      const activeDevice = await IoTDevice.findOne({ slotId: finalSlotId, isActive: true });
      
      booking.qrUsed = true;
      booking.scanLogs.push({
        action, gateId, timestamp: now, status: 'SUCCESS', ipAddress,
        gpsCoordinates: driverLat && driverLng ? [parseFloat(driverLng), parseFloat(driverLat)] : []
      });

      if (activeDevice) {
        // Presence sensor enabled: Await physical parking detection before starting billing
        booking.status = 'ENTERING';
        booking.vehicleStatus = 'WAITING_FOR_ENTRY';
        booking.lastSensorUpdate = now;
        await booking.save();

        await AuditLog.create({
          userId: booking.userId,
          action: 'BARRIER_ENTRY',
          details: `Booking #${booking._id.toString().slice(-6)} entry QR verified through Gate ${gateId}. Awaiting physical parking detection.`
        });

        if (io) {
          io.to(`user:${booking.userId}`).emit('BARRIER_OPENED', { gateId, action: 'ENTRY', time: now });
          // Broadcast WAITING_FOR_ENTRY status to driver dashboard
          io.to(`user:${booking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
            bookingId: booking._id,
            vehicleStatus: 'WAITING_FOR_ENTRY',
            lastSensorUpdate: now,
            slotIdentifier: assignedSlotIdentifier,
            sensorHealth: 'OK'
          });
        }

        return res.json({
          command: 'OPEN_BARRIER',
          displayMessage: `Welcome! Please proceed to slot ${assignedSlotIdentifier}. Occupancy pending sensor confirmation.`,
          autoCloseSeconds: 10
        });

      } else {
        // No presence sensor: Start billing immediately (fallback)
        booking.status = 'PARKED';
        booking.startTime = now;
        booking.vehicleStatus = 'PARKED';
        booking.lastSensorUpdate = now;
        await booking.save();

        // Mark slot occupied immediately since there is no sensor to activate it
        await ParkingSlot.findByIdAndUpdate(finalSlotId, { isOccupied: true });

        // Update zone capacity
        const zone = await ParkingZone.findById(booking.zoneId._id);
        if (zone) {
          const occupiedCount = await ParkingSlot.countDocuments({ zoneId: zone._id, isOccupied: true });
          zone.availableSlots = Math.max(0, zone.totalSlots - occupiedCount);
          await zone.save();
        }

        await AuditLog.create({
          userId: booking.userId,
          action: 'BARRIER_ENTRY',
          details: `Booking #${booking._id.toString().slice(-6)} entered through Gate ${gateId}. Billing started.`
        });

        if (io) {
          io.to(`user:${booking.userId}`).emit('BARRIER_OPENED', { gateId, action: 'ENTRY', time: now });
          io.to(`zone:${booking.zoneId._id}`).emit('SLOT_OCCUPIED', {
            zoneId: booking.zoneId._id,
            slotId: booking.slotId._id,
            slot: assignedSlotIdentifier
          });
          io.to(`user:${booking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
            bookingId: booking._id,
            vehicleStatus: 'PARKED',
            lastSensorUpdate: now,
            slotIdentifier: assignedSlotIdentifier,
            sensorHealth: 'OK'
          });
        }

        return res.json({
          command: 'OPEN_BARRIER',
          displayMessage: `Welcome! Park in slot ${assignedSlotIdentifier}.`,
          autoCloseSeconds: 10
        });
      }

    } else if (action === 'EXIT') {
      if (!['Active', 'PARKED'].includes(booking.status)) {
        return res.status(400).json({ command: 'REJECTED', displayMessage: `Access Denied: Booking is not active/parked (${booking.status})` });
      }

      booking.actualEndTime = now;

      let fineAmount = 0;
      const graceMs = 5 * 60 * 1000;
      if (now > new Date(booking.endTime.getTime() + graceMs)) {
        const overtimeMin = Math.ceil((now - booking.endTime) / 60000);
        fineAmount = overtimeMin * 2;
      }

      if (fineAmount > 0) {
        booking.fineAmount = fineAmount;
        try {
          await walletService.deductBalance(
            booking.userId,
            fineAmount,
            'fine',
            `Overstay penalty: ${Math.ceil((now - booking.endTime) / 60000)} minutes`,
            booking._id
          );

          const zone = await ParkingZone.findById(booking.zoneId._id);
          const halfFine = Math.round(fineAmount / 2);

          if (zone) {
            await walletService.creditBalance(
              zone.providerId,
              halfFine,
              'provider_earning',
              `Provider share (50%) of overstay fine for booking #${booking._id.toString().slice(-6)}`,
              booking._id
            );
          }

          if (booking.causedReassignment && booking.reassignedBookingId) {
            const affected = await Booking.findById(booking.reassignedBookingId);
            if (affected) {
              await walletService.creditBalance(
                affected.userId,
                halfFine,
                'reward',
                `Inconvenience compensation (50% overstay fine) from blocked slot`,
                booking._id
              );
              await notificationService.sendNotification(
                req.app,
                affected.userId,
                'Compensation Credited',
                `₹${halfFine} credited to your wallet for slot block delay.`,
                'REFUND'
              );
            }
          }

          await notificationService.sendNotification(
            req.app,
            booking.userId,
            'Overtime Fee Debited',
            `₹${fineAmount} debited for overtime overstay.`,
            'PENALTY'
          );
        } catch (err) {
          console.error('Fine processing failed:', err.message);
        }
      }

      // Check if slot has active IoT device mapped (presence sensor)
      const activeDevice = await IoTDevice.findOne({ slotId: booking.slotId._id, isActive: true });

      booking.scanLogs.push({
        action, gateId, timestamp: now, status: 'SUCCESS', ipAddress,
        gpsCoordinates: driverLat && driverLng ? [parseFloat(driverLng), parseFloat(driverLat)] : []
      });

      if (activeDevice) {
        // Presence sensor enabled: Await physical vacate (vehicle absence) before completing
        booking.status = 'EXITING';
        booking.vehicleStatus = 'EXITING';
        booking.lastSensorUpdate = now;
        await booking.save();

        await AuditLog.create({
          userId: booking.userId,
          action: 'BARRIER_EXIT',
          details: `Booking #${booking._id.toString().slice(-6)} exit QR verified through Gate ${gateId}. Awaiting physical vacate detection.`
        });

        if (io) {
          io.to(`user:${booking.userId}`).emit('BARRIER_OPENED', { gateId, action: 'EXIT', time: now });
          io.to(`user:${booking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
            bookingId: booking._id,
            vehicleStatus: 'EXITING',
            lastSensorUpdate: now,
            slotIdentifier: booking.slotId.slotIdentifier,
            sensorHealth: 'OK'
          });
        }

        return res.json({
          command: 'OPEN_BARRIER',
          displayMessage: `Exit approved! ${fineAmount > 0 ? `Paid ₹${fineAmount} fine.` : ''} Please vacate slot.`,
          autoCloseSeconds: 10
        });

      } else {
        // No presence sensor: Complete immediately (fallback)
        booking.status = 'Completed';
        booking.vehicleStatus = 'EXITED';
        booking.lastSensorUpdate = now;
        await booking.save();

        // Free the slot
        await ParkingSlot.findByIdAndUpdate(booking.slotId._id, { isOccupied: false, currentBookingId: null });

        const zone = await ParkingZone.findById(booking.zoneId._id);
        if (zone) {
          zone.availableSlots = Math.min(zone.totalSlots, zone.availableSlots + 1);
          await zone.save();

          try {
            await walletService.creditBalance(
              zone.providerId,
              booking.totalCost,
              'provider_earning',
              `Standard booking payout for slot ${booking.slotId.slotIdentifier}`,
              booking._id
            );
          } catch (err) {
            console.error('Provider standard credit failed:', err.message);
          }
        }

        await AuditLog.create({
          userId: booking.userId,
          action: 'BARRIER_EXIT',
          details: `Booking #${booking._id.toString().slice(-6)} exited through Gate ${gateId}.`
        });

        if (io) {
          io.to(`user:${booking.userId}`).emit('BARRIER_OPENED', { gateId, action: 'EXIT', time: now });
          io.to(`zone:${booking.zoneId._id}`).emit('SLOT_FREED', {
            zoneId: booking.zoneId._id,
            slotId: booking.slotId._id,
            slot: booking.slotId.slotIdentifier
          });
          io.to(`user:${booking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
            bookingId: booking._id,
            vehicleStatus: 'EXITED',
            lastSensorUpdate: now,
            slotIdentifier: booking.slotId.slotIdentifier,
            sensorHealth: 'OK'
          });
        }

        // Trigger queue allocation for waiting queue
        processQueueAllocation(req.app, booking.zoneId._id, booking.slotId._id);

        return res.json({
          command: 'OPEN_BARRIER',
          displayMessage: `Exit approved! ${fineAmount > 0 ? `Paid ₹${fineAmount} fine` : 'Safe journey!'}`,
          autoCloseSeconds: 10
        });
      }
    }

    return res.status(400).json({ command: 'REJECTED', displayMessage: 'Invalid scan request.' });
  } catch (error) {
    if (bookingIdForLog) {
      try {
        const b = await Booking.findById(bookingIdForLog);
        if (b) {
          b.scanLogs.push({
            action: actionForLog, timestamp: new Date(), status: 'FAILED',
            failureReason: 'INTERNAL_SERVER_ERROR', ipAddress
          });
          await b.save();
        }
      } catch {}
    }
    res.status(500).json({ command: 'REJECTED', displayMessage: 'Access verification error.' });
  }
});

// ═══════════════════════════════════════
// NEW PROVIDER CONFIGURATION ENDPOINTS
// ═══════════════════════════════════════

// GET /api/v1/iot/config
router.get('/config', protect, async (req, res) => {
  try {
    let config = await IoTConfiguration.findOne({ providerId: req.user._id });
    if (!config) {
      config = await IoTConfiguration.create({ providerId: req.user._id });
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/v1/iot/config
router.post('/config', protect, async (req, res) => {
  try {
    const { iotMode, communicationType, mqttSettings } = req.body;
    let config = await IoTConfiguration.findOne({ providerId: req.user._id });
    if (!config) {
      config = new IoTConfiguration({ providerId: req.user._id });
    }
    config.iotMode = iotMode !== undefined ? iotMode : config.iotMode;
    config.communicationType = communicationType || config.communicationType;
    if (mqttSettings) {
      config.mqttSettings = { ...config.mqttSettings, ...mqttSettings };
    }
    await config.save();
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/v1/iot/provider-devices
router.get('/provider-devices', protect, async (req, res) => {
  try {
    const devices = await IoTDevice.find({ providerId: req.user._id })
      .populate('zoneId', 'name location')
      .populate('slotId', 'slotIdentifier floor');
    res.json(devices);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/v1/iot/register-device
router.post('/register-device', protect, async (req, res) => {
  try {
    const { name, zoneId, slotId, firmwareVersion } = req.body;

    const deviceId = `DEV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const deviceToken = crypto.randomBytes(24).toString('hex');
    const apiKey = crypto.randomBytes(16).toString('hex');

    const deviceTokenHash = hashSHA256(deviceToken);
    const apiKeyHash = hashSHA256(apiKey);

    const device = await IoTDevice.create({
      deviceId,
      deviceTokenHash,
      apiKeyHash,
      name: name || `Device-${deviceId}`,
      providerId: req.user._id,
      zoneId: zoneId || null,
      slotId: slotId || null,
      firmwareVersion: firmwareVersion || '1.0.0'
    });

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      action: 'IOT_DEVICE_REGISTERED',
      details: `Device ${device.deviceId} (${device.name}) registered by provider ${req.user._id}`
    });

    // Build ESP endpoint URLs
    const { getLocalIpAddress } = require('../utils/network');
    const serverBase = process.env.SERVER_URL || `http://${getLocalIpAddress()}:${process.env.PORT || 5000}`;

    res.status(201).json({
      message: 'Device registered successfully',
      deviceId: device.deviceId,
      deviceToken, // raw token - displayed only once
      apiKey,      // raw API key
      name: device.name,
      espEndpoints: {
        heartbeat: `${serverBase}/api/v1/esp/heartbeat`,
        updateSlot: `${serverBase}/api/v1/esp/update-slot`,
        deviceStatus: `${serverBase}/api/v1/esp/device-status`,
        sensorUpdate: `${serverBase}/api/v1/esp/sensor-update`,
        reconnect: `${serverBase}/api/v1/esp/reconnect`,
        config: `${serverBase}/api/v1/esp/config?deviceId=${device.deviceId}&deviceToken=REPLACE_WITH_TOKEN`
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/v1/iot/device
router.put('/device', protect, async (req, res) => {
  try {
    const { deviceId, name, zoneId, slotId, firmwareVersion, isActive } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

    const device = await IoTDevice.findOne({ deviceId, providerId: req.user._id });
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const prevIsActive = device.isActive;

    device.name = name !== undefined ? name : device.name;
    device.zoneId = zoneId !== undefined ? zoneId : device.zoneId;
    device.slotId = slotId !== undefined ? slotId : device.slotId;
    device.firmwareVersion = firmwareVersion !== undefined ? firmwareVersion : device.firmwareVersion;

    // BUG 5 FIX: Sync status when isActive changes
    if (isActive !== undefined && isActive !== prevIsActive) {
      device.isActive = isActive;
      if (!isActive) {
        device.status = 'Disabled';
      } else if (device.status === 'Disabled') {
        device.status = 'Offline';
      }

      // BUG 12 FIX: Log enable/disable events
      await DeviceLog.create({
        deviceId: device.deviceId,
        type: isActive ? 'enable' : 'disable',
        payload: { action: 'TOGGLED_BY_PROVIDER', isActive },
        status: 'SUCCESS',
        ipAddress
      });
    } else if (isActive !== undefined) {
      device.isActive = isActive;
    }

    await device.save();

    // BUG 8 FIX: Populate before responding to avoid frontend TypeError
    const populated = await IoTDevice.findOne({ deviceId })
      .populate('zoneId', 'name location')
      .populate('slotId', 'slotIdentifier floor isOccupied');

    // BUG 2 FIX: Broadcast to provider room and admin dashboard
    const io = req.app.get('io');
    if (io) {
      io.to(`provider:${req.user._id}`).emit('PROVIDER_DEVICE_UPDATED', populated);
      io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', populated);
      // Notify the device itself
      io.to(`device:${deviceId}`).emit('CONFIG_UPDATE', { 
        isActive: device.isActive,
        name: device.name,
        zoneId: device.zoneId,
        slotId: device.slotId
      });
    }

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/v1/iot/device
router.delete('/device', protect, async (req, res) => {
  try {
    const { deviceId } = req.query;
    const device = await IoTDevice.findOneAndDelete({ deviceId, providerId: req.user._id });
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    await AuditLog.create({
      userId: req.user._id,
      action: 'IOT_DEVICE_DELETED',
      details: `Device ${deviceId} (${device.name}) deleted by provider ${req.user._id}`
    });

    res.json({ message: 'Device deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/v1/iot/test-connection
router.post('/test-connection', protect, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const mongooseState = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    
    if (deviceId) {
      const device = await IoTDevice.findOne({ deviceId, providerId: req.user._id });
      if (!device) {
        return res.json({ success: false, database: mongooseState, deviceExists: false });
      }
      return res.json({ success: true, database: mongooseState, deviceExists: true, apiReachable: true });
    }

    res.json({ success: true, database: mongooseState, apiReachable: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/iot/download-config
// BUG 6 FIX: Always resolve to LAN IP — never send localhost to ESP32
router.get('/download-config', async (req, res) => {
  try {
    const { deviceId, deviceToken } = req.query;
    if (!deviceId) return res.status(400).json({ message: 'deviceId is required' });

    const { getLocalIpAddress } = require('../utils/network');
    const serverBase = process.env.SERVER_URL || `http://${getLocalIpAddress()}:${process.env.PORT || 5000}`;

    const configJson = {
      deviceId,
      deviceToken: deviceToken || 'REPLACE_WITH_YOUR_DEVICE_TOKEN',
      apiEndpoint: `${serverBase}/api/v1/esp/update-slot`,
      heartbeatEndpoint: `${serverBase}/api/v1/esp/heartbeat`,
      deviceStatusEndpoint: `${serverBase}/api/v1/esp/device-status`,
      sensorUpdateEndpoint: `${serverBase}/api/v1/esp/sensor-update`,
      reconnectEndpoint: `${serverBase}/api/v1/esp/reconnect`,
      configEndpoint: `${serverBase}/api/v1/esp/config`,
      heartbeatIntervalSeconds: 30,
      protocol: 'HTTP',
      serverBase
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=config-${deviceId}.json`);
    res.send(JSON.stringify(configJson, null, 4));
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ═══════════════════════════════════════
// HARDWARE / SIMULATED DEVICE ENDPOINTS
// ═══════════════════════════════════════

// POST /api/v1/iot/simulate-update
router.post('/simulate-update', async (req, res) => {
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  try {
    const { zoneId, slotId, isOccupied } = req.body;
    if (!zoneId || !slotId) {
      return res.status(400).json({ message: 'zoneId and slotId are required' });
    }

    const slot = await ParkingSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    // Check if the slot is mapped to an IoT device
    const device = await IoTDevice.findOne({ slotId: slot._id });
    if (device && !device.isActive) {
      return res.status(403).json({ message: 'Device is disabled' });
    }

    slot.isOccupied = isOccupied;
    // If slot is freed, remove active booking association
    if (!isOccupied) {
      if (slot.currentBookingId) {
        const booking = await Booking.findById(slot.currentBookingId);
        if (booking && booking.status === 'Active') {
          booking.status = 'Completed';
          booking.actualEndTime = new Date();
          await booking.save();
        }
        slot.currentBookingId = null;
      }
    }
    await slot.save();

    // Adjust zone capacity
    const zone = await ParkingZone.findById(slot.zoneId);
    if (zone) {
      const occupiedCount = await ParkingSlot.countDocuments({ zoneId: zone._id, isOccupied: true });
      zone.availableSlots = Math.max(0, zone.totalSlots - occupiedCount);
      await zone.save();
    }

    // Broadcast WebSocket updates
    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${slot.zoneId}`).emit(isOccupied ? 'SLOT_OCCUPIED' : 'SLOT_FREED', {
        zoneId: slot.zoneId,
        slotId: slot._id,
        slot: slot.slotIdentifier
      });
      if (zone) {
        io.emit('ZONE_UPDATED', zone);
      }
    }

    if (device) {
      device.status = 'Online';
      device.lastHeartbeat = new Date();
      device.lastIp = ipAddress;
      await device.save();

      await DeviceLog.create({
        deviceId: device.deviceId,
        type: 'slot_update',
        payload: req.body,
        status: 'SUCCESS',
        ipAddress
      });
    }

    res.json({ success: true, message: 'Simulated slot update successful', isOccupied });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Helper function to handle slot occupancy state logic (Phase 23D & Waiting Queue integrations)
async function handleSlotOccupancyState({
  req,
  device,
  slot,
  isOccupied,
  battery,
  signalStrength,
  sensorHealth,
  ipAddress,
  now,
  io
}) {
  // Find booking related to this slot with status ENTERING, PARKED, or EXITING
  const relevantBooking = await Booking.findOne({
    slotId: slot._id,
    status: { $in: ['ENTERING', 'PARKED', 'EXITING'] }
  });

  if (relevantBooking) {
    const prevVehicleStatus = relevantBooking.vehicleStatus;

    if (isOccupied) {
      // ── Vehicle Present ──────────────────────────────────────────
      if (relevantBooking.status === 'ENTERING') {
        relevantBooking.status = 'PARKED';
        relevantBooking.vehicleStatus = 'PARKED';
        relevantBooking.startTime = now; // Billing starts when presence is detected!
        relevantBooking.lastSensorUpdate = now;
        if (sensorHealth) relevantBooking.sensorHealth = sensorHealth;
        await relevantBooking.save();

        slot.isOccupied = true;
        await slot.save();

        if (io) {
          io.to(`user:${relevantBooking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
            bookingId: relevantBooking._id,
            vehicleStatus: 'PARKED',
            lastSensorUpdate: now,
            slotIdentifier: slot.slotIdentifier,
            sensorHealth: sensorHealth || 'OK'
          });
          io.to(`zone:${slot.zoneId}`).emit('SLOT_OCCUPIED', {
            zoneId: slot.zoneId,
            slotId: slot._id,
            slot: slot.slotIdentifier
          });
        }
      } else if (relevantBooking.status === 'PARKED') {
        // Already parked. If was MISSING, reset theft alert
        relevantBooking.vehicleStatus = 'PARKED';
        relevantBooking.lastSensorUpdate = now;
        if (sensorHealth) relevantBooking.sensorHealth = sensorHealth;

        if (prevVehicleStatus === 'MISSING') {
          relevantBooking.theftAlertSent = false;
          await notificationService.sendNotification(
            req.app,
            relevantBooking.userId,
            'Vehicle Returned',
            `Your vehicle has returned to slot ${slot.slotIdentifier}. Theft alert cancelled.`,
            'INFO'
          );
        }
        await relevantBooking.save();
        slot.isOccupied = true;
        await slot.save();
      } else if (relevantBooking.status === 'EXITING') {
        // Still present, didn't leave slot yet
        relevantBooking.lastSensorUpdate = now;
        if (sensorHealth) relevantBooking.sensorHealth = sensorHealth;
        await relevantBooking.save();
        slot.isOccupied = true;
        await slot.save();
      }
    } else {
      // ── Vehicle Absent ────────────────────────────────────────────
      if (relevantBooking.status === 'EXITING') {
        // Normal Exit Flow
        relevantBooking.status = 'Completed';
        relevantBooking.vehicleStatus = 'EXITED';
        relevantBooking.actualEndTime = now;
        await relevantBooking.save();

        slot.isOccupied = false;
        slot.currentBookingId = null;
        await slot.save();

        // Update zone capacity
        const zone = await ParkingZone.findById(slot.zoneId);
        if (zone) {
          zone.availableSlots = Math.min(zone.totalSlots, zone.availableSlots + 1);
          await zone.save();

          try {
            await walletService.creditBalance(
              zone.providerId,
              relevantBooking.totalCost,
              'provider_earning',
              `Standard booking payout for slot ${slot.slotIdentifier}`,
              relevantBooking._id
            );
          } catch (err) {
            console.error('Provider standard credit failed:', err.message);
          }
          if (io) io.emit('ZONE_UPDATED', zone);
        }

        if (io) {
          io.to(`zone:${slot.zoneId}`).emit('SLOT_FREED', {
            zoneId: slot.zoneId,
            slotId: slot._id,
            slot: slot.slotIdentifier
          });
          io.to(`user:${relevantBooking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
            bookingId: relevantBooking._id,
            vehicleStatus: 'EXITED',
            lastSensorUpdate: now,
            slotIdentifier: slot.slotIdentifier,
            sensorHealth: sensorHealth || 'OK'
          });
        }

        // Trigger queue allocation for waiting queue
        processQueueAllocation(req.app, slot.zoneId, slot._id);

      } else if (relevantBooking.status === 'PARKED') {
        // Theft Case!
        relevantBooking.vehicleStatus = 'MISSING';
        relevantBooking.lastSensorUpdate = now;
        if (sensorHealth) relevantBooking.sensorHealth = sensorHealth;

        if (!relevantBooking.theftAlertSent) {
          relevantBooking.theftAlertSent = true;
          await relevantBooking.save();

          await notificationService.sendNotification(
            req.app,
            relevantBooking.userId,
            '⚠️ Theft Alert: Vehicle Missing!',
            `Your vehicle is no longer detected at slot ${slot.slotIdentifier}. Please verify immediately.`,
            'ALERT'
          );

          const bookingZone = await ParkingZone.findById(relevantBooking.zoneId);
          if (bookingZone) {
            await notificationService.sendNotification(
              req.app,
              bookingZone.providerId,
              '⚠️ Theft Alert Triggered',
              `Vehicle missing from slot ${slot.slotIdentifier} at ${bookingZone.name}.`,
              'ALERT'
            );
          }
        } else {
          await relevantBooking.save();
        }

        // Keep slot isOccupied as true during theft case
        slot.isOccupied = true;
        await slot.save();

        if (io) {
          io.to(`user:${relevantBooking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
            bookingId: relevantBooking._id,
            vehicleStatus: 'MISSING',
            lastSensorUpdate: now,
            slotIdentifier: slot.slotIdentifier,
            sensorHealth: sensorHealth || 'OK'
          });
        }
      } else if (relevantBooking.status === 'ENTERING') {
        // Scanned entry but not parked yet. Keep slot free, update telemetry.
        relevantBooking.lastSensorUpdate = now;
        if (sensorHealth) relevantBooking.sensorHealth = sensorHealth;
        await relevantBooking.save();

        slot.isOccupied = false;
        await slot.save();

        if (io) {
          io.to(`user:${relevantBooking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
            bookingId: relevantBooking._id,
            vehicleStatus: 'WAITING_FOR_ENTRY',
            lastSensorUpdate: now,
            slotIdentifier: slot.slotIdentifier,
            sensorHealth: sensorHealth || 'OK'
          });
        }
      }
    }
  } else {
    // ── No Booking In progress ────────────────────────────────────
    if (isOccupied) {
      // Random IR detection -> IGNORE! Keep slot free.
      slot.isOccupied = false;
      await slot.save();
    } else {
      // Free and vacant -> Ensure free.
      slot.isOccupied = false;
      slot.currentBookingId = null;
      await slot.save();

      // Trigger queue allocation just in case
      processQueueAllocation(req.app, slot.zoneId, slot._id);
    }
  }

  // Ensure zone capacity is correct
  const zone = await ParkingZone.findById(slot.zoneId);
  if (zone) {
    const occupiedCount = await ParkingSlot.countDocuments({ zoneId: zone._id, isOccupied: true });
    zone.availableSlots = Math.max(0, zone.totalSlots - occupiedCount);
    await zone.save();
    if (io) io.emit('ZONE_UPDATED', zone);
  }

  // Update device status and telemetries
  device.status = 'Online';
  device.lastHeartbeat = now;
  device.lastIp = ipAddress;
  if (battery !== undefined) device.battery = battery;
  if (signalStrength !== undefined) device.signalStrength = signalStrength;
  await device.save();
}

// POST /api/v1/iot/update-slot
router.post('/update-slot', async (req, res) => {
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  try {
    const { deviceToken, deviceId, slotId, status, battery, signalStrength, sensorHealth } = req.body;

    if (!deviceId || !deviceToken || !status) {
      return res.status(400).json({ message: 'deviceId, deviceToken, and status are required' });
    }

    // Authenticate the device
    const deviceTokenHash = hashSHA256(deviceToken);
    const device = await IoTDevice.findOne({ deviceId, deviceTokenHash });

    if (!device) {
      await DeviceLog.create({
        deviceId,
        type: 'auth_failure',
        payload: req.body,
        status: 'FAILED',
        error: 'Authentication failed: Invalid token',
        ipAddress
      });
      return res.status(401).json({ message: 'Unauthorized device' });
    }

    if (!device.isActive) {
      await DeviceLog.create({
        deviceId,
        type: 'http_error',
        payload: req.body,
        status: 'FAILED',
        error: 'Forbidden: Device is disabled',
        ipAddress
      });
      return res.status(403).json({ message: 'Device is disabled' });
    }

    // Determine target slot
    const targetSlotId = slotId || device.slotId;
    if (!targetSlotId) {
      return res.status(400).json({ message: 'No slot mapped to this device' });
    }

    const slot = await ParkingSlot.findById(targetSlotId);
    if (!slot) {
      return res.status(404).json({ message: 'Parking slot not found' });
    }

    const statusLower = status.toLowerCase();
    const isOccupied = ['occupied', 'vehicle_present', 'vehicle detected', 'vehicle_detected', '1', 'true'].includes(statusLower);

    const io = req.app.get('io');
    const now = new Date();

    // Call the shared occupancy state helper
    await handleSlotOccupancyState({
      req,
      device,
      slot,
      isOccupied,
      battery,
      signalStrength,
      sensorHealth,
      ipAddress,
      now,
      io
    });

    const populatedDevice = await IoTDevice.findById(device._id)
      .populate('zoneId', 'name location')
      .populate('slotId', 'slotIdentifier floor isOccupied');

    // Broadcast WebSocket updates
    if (io) {
      io.to(`provider:${device.providerId}`).emit('PROVIDER_DEVICE_UPDATED', populatedDevice);
      io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', populatedDevice);
    }

    // Log success
    await DeviceLog.create({
      deviceId,
      type: 'slot_update',
      payload: req.body,
      status: 'SUCCESS',
      ipAddress
    });

    res.json({ message: 'Slot status updated successfully', isOccupied: slot.isOccupied });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// POST /api/v1/iot/heartbeat

router.post('/heartbeat', async (req, res) => {
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  try {
    const { deviceToken, deviceId, battery, signalStrength, firmwareVersion } = req.body;

    if (!deviceId || !deviceToken) {
      return res.status(400).json({ message: 'deviceId and deviceToken are required' });
    }

    const deviceTokenHash = hashSHA256(deviceToken);
    const device = await IoTDevice.findOne({ deviceId, deviceTokenHash });

    if (!device) {
      await DeviceLog.create({
        deviceId,
        type: 'auth_failure',
        payload: req.body,
        status: 'FAILED',
        error: 'Authentication failed: Invalid token',
        ipAddress
      });
      return res.status(401).json({ message: 'Unauthorized device' });
    }

    if (!device.isActive) {
      await DeviceLog.create({
        deviceId,
        type: 'http_error',
        payload: req.body,
        status: 'FAILED',
        error: 'Forbidden: Device is disabled',
        ipAddress
      });
      return res.status(403).json({ message: 'Device is disabled' });
    }

    device.status = 'Online';
    device.lastHeartbeat = new Date();
    device.lastIp = ipAddress;
    if (battery !== undefined) device.battery = battery;
    if (signalStrength !== undefined) device.signalStrength = signalStrength;
    if (firmwareVersion !== undefined) device.firmwareVersion = firmwareVersion;
    await device.save();

    const populatedDevice = await IoTDevice.findById(device._id)
      .populate('zoneId', 'name location')
      .populate('slotId', 'slotIdentifier floor isOccupied');

    const io = req.app.get('io');
    if (io) {
      io.to(`provider:${device.providerId}`).emit('PROVIDER_DEVICE_UPDATED', populatedDevice);
      io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', populatedDevice);
    }

    await DeviceLog.create({
      deviceId,
      type: 'heartbeat',
      payload: req.body,
      status: 'SUCCESS',
      ipAddress
    });

    res.json({ status: 'Online', lastHeartbeat: device.lastHeartbeat });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
