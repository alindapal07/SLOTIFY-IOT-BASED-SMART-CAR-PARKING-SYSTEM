const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { deviceAuth } = require('../middleware/deviceAuth');
const IoTDevice = require('../models/IoTDevice');
const DeviceLog = require('../models/DeviceLog');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingZone = require('../models/ParkingZone');
const Booking = require('../models/Booking');
const AuditLog = require('../models/AuditLog');
const notificationService = require('../services/notificationService');
const walletService = require('../services/walletService');
const { processQueueAllocation } = require('../services/queueService');


// ═══════════════════════════════════════════════════════════════════
// ESP32 DEVICE API ROUTES
// All routes use deviceAuth middleware (deviceId + deviceToken)
// NO JWT required — designed for hardware devices
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/esp/heartbeat
 * ESP32 sends a heartbeat every 30 seconds to confirm it is online.
 * Updates device status to Online, records lastHeartbeat timestamp,
 * and broadcasts to Provider + Admin dashboards via WebSocket.
 */
router.post('/heartbeat', deviceAuth, async (req, res) => {
  try {
    const device = req.device;
    const ipAddress = req.ipAddress;
    const { battery, signalStrength, firmwareVersion, freeHeap, uptime } = req.body;

    // Update device telemetry
    device.status = 'Online';
    device.lastHeartbeat = new Date();
    device.lastIp = ipAddress;
    if (battery !== undefined) device.battery = battery;
    if (signalStrength !== undefined) device.signalStrength = signalStrength;
    if (firmwareVersion !== undefined) device.firmwareVersion = firmwareVersion;
    await device.save();

    // Populate for broadcasting
    const populatedDevice = await IoTDevice.findById(device._id)
      .populate('zoneId', 'name location')
      .populate('slotId', 'slotIdentifier floor isOccupied');

    // Broadcast to dashboards
    const io = req.app.get('io');
    if (io) {
      io.to(`provider:${device.providerId}`).emit('PROVIDER_DEVICE_UPDATED', populatedDevice);
      io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', populatedDevice);
      // Emit heartbeat event for any driver watching this zone
      if (device.zoneId) {
        io.to(`zone:${device.zoneId._id || device.zoneId}`).emit('DEVICE_HEARTBEAT', {
          deviceId: device.deviceId,
          status: 'Online',
          lastHeartbeat: device.lastHeartbeat,
          battery,
          signalStrength
        });
      }
    }

    // Log heartbeat
    await DeviceLog.create({
      deviceId: device.deviceId,
      type: 'heartbeat',
      payload: { battery, signalStrength, firmwareVersion, freeHeap, uptime },
      status: 'SUCCESS',
      ipAddress
    });

    res.json({
      success: true,
      status: 'Online',
      lastHeartbeat: device.lastHeartbeat,
      serverTime: new Date()
    });
  } catch (err) {
    console.error('[ESP /heartbeat] Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * POST /api/v1/esp/update-slot
 * ESP32 reports slot occupancy status (vehicle detected / vehicle absent).
 * Updates slot, zone capacity, booking vehicle status, and broadcasts
 * real-time events to all dashboards.
 */
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

/**
 * POST /api/v1/esp/update-slot
 * ESP32 reports slot occupancy status (vehicle detected / vehicle absent).
 * Updates slot, zone capacity, booking vehicle status, and broadcasts
 * real-time events to all dashboards.
 */
router.post('/update-slot', deviceAuth, async (req, res) => {
  try {
    const device = req.device;
    const ipAddress = req.ipAddress;
    const { status, battery, signalStrength, sensorHealth, slotId: bodySlotId } = req.body;
    const io = req.app.get('io');
    const now = new Date();

    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required (occupied/vacant/vehicle_present/vehicle_absent)' });
    }

    // Determine target slot
    const targetSlotId = bodySlotId || device.slotId;
    if (!targetSlotId) {
      return res.status(400).json({ success: false, message: 'No slot mapped to this device' });
    }

    const slot = await ParkingSlot.findById(targetSlotId);
    if (!slot) {
      return res.status(404).json({ success: false, message: 'Parking slot not found' });
    }

    const statusLower = status.toLowerCase();
    const isOccupied = ['occupied', 'vehicle_present', 'vehicle detected', 'vehicle_detected', '1', 'true'].includes(statusLower);

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

    // Broadcast WebSocket updates to provider & admin dashboards
    if (io) {
      io.to(`provider:${device.providerId}`).emit('PROVIDER_DEVICE_UPDATED', populatedDevice);
      io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', populatedDevice);
    }

    // Log success
    await DeviceLog.create({
      deviceId: device.deviceId,
      type: 'slot_update',
      payload: req.body,
      status: 'SUCCESS',
      ipAddress
    });

    // Audit log
    await AuditLog.create({
      userId: device.providerId,
      action: 'IOT_SLOT_UPDATE',
      details: `Device ${device.deviceId} reported slot ${slot.slotIdentifier} as ${isOccupied ? 'OCCUPIED' : 'VACANT'}`
    });

    res.json({
      success: true,
      message: 'Slot status updated successfully',
      isOccupied: slot.isOccupied,
      slotIdentifier: slot.slotIdentifier,
      serverTime: now
    });
  } catch (err) {
    console.error('[ESP /update-slot] Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * POST /api/v1/esp/device-status
 * ESP32 reports its own status (battery, signal, firmware, free heap, etc.)
 * Used for device health monitoring and analytics.
 */
router.post('/device-status', deviceAuth, async (req, res) => {
  try {
    const device = req.device;
    const ipAddress = req.ipAddress;
    const { battery, signalStrength, firmwareVersion, freeHeap, uptime, sensorHealth } = req.body;

    device.status = 'Online';
    device.lastHeartbeat = new Date();
    device.lastIp = ipAddress;
    if (battery !== undefined) device.battery = battery;
    if (signalStrength !== undefined) device.signalStrength = signalStrength;
    if (firmwareVersion !== undefined) device.firmwareVersion = firmwareVersion;
    if (sensorHealth) device.healthStatus = sensorHealth === 'OK' ? 'Healthy' : sensorHealth;
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
      deviceId: device.deviceId,
      type: 'heartbeat',
      payload: { battery, signalStrength, firmwareVersion, freeHeap, uptime, sensorHealth },
      status: 'SUCCESS',
      ipAddress
    });

    res.json({
      success: true,
      status: 'Online',
      deviceId: device.deviceId,
      serverTime: new Date()
    });
  } catch (err) {
    console.error('[ESP /device-status] Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * POST /api/v1/esp/sensor-update
 * ESP32 sends raw IR sensor data for synchronization.
 * Records the reading and broadcasts to all dashboards.
 */
router.post('/sensor-update', deviceAuth, async (req, res) => {
  try {
    const device = req.device;
    const ipAddress = req.ipAddress;
    const { sensorType, rawValue, processedStatus, battery, signalStrength } = req.body;
    const now = new Date();

    if (!sensorType || processedStatus === undefined) {
      return res.status(400).json({
        success: false,
        message: 'sensorType and processedStatus are required'
      });
    }

    // Update device health
    device.status = 'Online';
    device.lastHeartbeat = now;
    device.lastIp = ipAddress;
    if (sensorType) device.sensorType = sensorType;
    if (battery !== undefined) device.battery = battery;
    if (signalStrength !== undefined) device.signalStrength = signalStrength;
    await device.save();

    // If the sensor reports a slot status, propagate it
    const targetSlotId = device.slotId;
    if (targetSlotId) {
      const slot = await ParkingSlot.findById(targetSlotId);
      if (slot) {
        const statusLower = String(processedStatus).toLowerCase();
        const isOccupied = ['occupied', 'vehicle_present', 'vehicle_detected', '1', 'true', 'blocked'].includes(statusLower);

        // Call the shared occupancy state helper
        await handleSlotOccupancyState({
          req,
          device,
          slot,
          isOccupied,
          battery,
          signalStrength,
          sensorHealth: processedStatus,
          ipAddress,
          now,
          io: req.app.get('io')
        });
      }
    }

    // Broadcast sensor data
    const io = req.app.get('io');
    if (io) {
      io.to(`provider:${device.providerId}`).emit('SENSOR_DATA', {
        deviceId: device.deviceId,
        sensorType,
        rawValue,
        processedStatus,
        timestamp: now
      });
      io.to('admin_dashboard').emit('SENSOR_DATA', {
        deviceId: device.deviceId,
        sensorType,
        rawValue,
        processedStatus,
        timestamp: now
      });
    }

    // Log sensor update
    await DeviceLog.create({
      deviceId: device.deviceId,
      type: 'slot_update',
      payload: { sensorType, rawValue, processedStatus, battery, signalStrength },
      status: 'SUCCESS',
      ipAddress
    });

    // Audit log
    await AuditLog.create({
      userId: device.providerId,
      action: 'IOT_SENSOR_UPDATE',
      details: `Device ${device.deviceId} sensor (${sensorType}) reported: ${processedStatus} (raw: ${rawValue})`
    });

    res.json({
      success: true,
      message: 'Sensor data received',
      deviceId: device.deviceId,
      serverTime: now
    });
  } catch (err) {
    console.error('[ESP /sensor-update] Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * POST /api/v1/esp/reconnect
 * ESP32 calls this when it re-establishes Wi-Fi after a disconnect.
 * Re-authenticates the device, marks it Online, and notifies dashboards.
 */
router.post('/reconnect', deviceAuth, async (req, res) => {
  try {
    const device = req.device;
    const ipAddress = req.ipAddress;
    const now = new Date();

    device.status = 'Online';
    device.lastHeartbeat = now;
    device.lastIp = ipAddress;
    await device.save();

    const populatedDevice = await IoTDevice.findById(device._id)
      .populate('zoneId', 'name location')
      .populate('slotId', 'slotIdentifier floor isOccupied');

    const io = req.app.get('io');
    if (io) {
      io.to(`provider:${device.providerId}`).emit('PROVIDER_DEVICE_UPDATED', populatedDevice);
      io.to(`provider:${device.providerId}`).emit('DEVICE_RECONNECTED', {
        deviceId: device.deviceId,
        name: device.name,
        timestamp: now
      });
      io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', populatedDevice);
      io.to('admin_dashboard').emit('DEVICE_RECONNECTED', {
        deviceId: device.deviceId,
        name: device.name,
        timestamp: now
      });
    }

    await DeviceLog.create({
      deviceId: device.deviceId,
      type: 'connection',
      payload: { event: 'HTTP_RECONNECT', ip: ipAddress },
      status: 'SUCCESS',
      ipAddress
    });

    await AuditLog.create({
      userId: device.providerId,
      action: 'IOT_DEVICE_RECONNECT',
      details: `Device ${device.deviceId} (${device.name}) reconnected from ${ipAddress}`
    });

    res.json({
      success: true,
      message: 'Device reconnected successfully',
      deviceId: device.deviceId,
      status: 'Online',
      serverTime: now
    });
  } catch (err) {
    console.error('[ESP /reconnect] Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * GET /api/v1/esp/config
 * ESP32 fetches its runtime configuration from the server.
 * Uses query params: ?deviceId=DEV-XXX&deviceToken=YYY
 */
router.get('/config', deviceAuth, async (req, res) => {
  try {
    const device = req.device;
    const { getLocalIpAddress } = require('../utils/network');
    const lanIp = process.env.SERVER_URL || `http://${getLocalIpAddress()}:${process.env.PORT || 5000}`;

    res.json({
      success: true,
      deviceId: device.deviceId,
      name: device.name,
      isActive: device.isActive,
      sensorType: device.sensorType,
      slotId: device.slotId?._id || device.slotId,
      slotIdentifier: device.slotId?.slotIdentifier || null,
      zoneId: device.zoneId?._id || device.zoneId,
      zoneName: device.zoneId?.name || null,
      endpoints: {
        heartbeat: `${lanIp}/api/v1/esp/heartbeat`,
        updateSlot: `${lanIp}/api/v1/esp/update-slot`,
        deviceStatus: `${lanIp}/api/v1/esp/device-status`,
        sensorUpdate: `${lanIp}/api/v1/esp/sensor-update`,
        reconnect: `${lanIp}/api/v1/esp/reconnect`
      },
      heartbeatIntervalMs: 30000,
      serverTime: new Date()
    });
  } catch (err) {
    console.error('[ESP /config] Error:', err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

module.exports = router;
