const crypto = require('crypto');
const IoTDevice = require('../models/IoTDevice');
const DeviceLog = require('../models/DeviceLog');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingZone = require('../models/ParkingZone');
const Booking = require('../models/Booking');

// Helper to hash tokens
const hashSHA256 = (str) => crypto.createHash('sha256').update(str).digest('hex');

/**
 * Setup Socket.io Event Handling
 * Manages authenticated user rooms, live zone streams, and secure IoT device channels.
 */
module.exports = function setupSocketIo(io) {
  io.on('connection', (socket) => {
    console.log(`New WebSocket Connection: ${socket.id}`);

    // Join Private User Room (for notifications, billing updates)
    socket.on('JOIN_USER_ROOM', (userId) => {
      socket.join(`user:${userId}`);
      console.log(`User ${userId} joined their private room.`);
    });

    // Join Parking Zone Room (for live map updates)
    socket.on('JOIN_ZONE_ROOM', (zoneId) => {
      socket.join(`zone:${zoneId}`);
      console.log(`Socket ${socket.id} joined zone:${zoneId}`);
    });

    // Leave Parking Zone Room
    socket.on('LEAVE_ZONE_ROOM', (zoneId) => {
      socket.leave(`zone:${zoneId}`);
      console.log(`Socket ${socket.id} left zone:${zoneId}`);
    });

    // Join Admin Room (for real-time dashboard events)
    socket.on('JOIN_ADMIN_ROOM', () => {
      socket.join('admin_dashboard');
      console.log(`Socket ${socket.id} joined admin_dashboard room.`);
    });

    // Join Provider Room (for real-time device updates)
    socket.on('JOIN_PROVIDER_ROOM', (providerId) => {
      if (providerId) {
        socket.join(`provider:${providerId}`);
        console.log(`Socket ${socket.id} joined provider:${providerId} room.`);
      }
    });

    // ═══════════════════════════════════════
    // SECURE REAL-TIME IoT PORTAL
    // ═══════════════════════════════════════

    socket.on('IOT_DEVICE_CONNECT', async (data) => {
      try {
        const { deviceId, deviceToken } = data;
        const ipAddress = socket.handshake.address || '127.0.0.1';

        if (!deviceId || !deviceToken) {
          socket.emit('IOT_DEVICE_ERR', { message: 'deviceId and deviceToken are required' });
          return;
        }

        const deviceTokenHash = hashSHA256(deviceToken);
        const device = await IoTDevice.findOne({ deviceId, deviceTokenHash });

        if (!device) {
          await DeviceLog.create({
            deviceId,
            type: 'auth_failure',
            payload: { event: 'WS_CONNECT', socketId: socket.id },
            status: 'FAILED',
            error: 'WebSocket authentication failed: Invalid token',
            ipAddress
          });
          socket.emit('IOT_DEVICE_ERR', { message: 'Authentication failed' });
          return;
        }

        if (!device.isActive) {
          socket.emit('IOT_DEVICE_ERR', { message: 'Device is disabled' });
          return;
        }

        // Join specific device room and standard iot listeners
        socket.join(`device:${deviceId}`);
        if (device.zoneId) {
          socket.join(`zone:${device.zoneId}`);
          socket.join(`iot:${device.zoneId}`);
        }

        // Update status and last details
        device.status = 'Online';
        device.lastHeartbeat = new Date();
        device.lastIp = ipAddress;
        await device.save();

        await DeviceLog.create({
          deviceId,
          type: 'connection',
          payload: { event: 'WS_CONNECT', socketId: socket.id },
          status: 'SUCCESS',
          ipAddress
        });

        console.log(`IoT Device ${deviceId} authenticated successfully via WS.`);
        socket.emit('IOT_DEVICE_ACK', { status: 'Connected successfully', deviceId });
        io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', device);

        // HEARTBEAT over WebSockets
        socket.on('HEARTBEAT', async (telemetry = {}) => {
          try {
            const dev = await IoTDevice.findOne({ deviceId });
            if (!dev) return;
            if (!dev.isActive) {
              socket.emit('IOT_DEVICE_ERR', { message: 'Device is disabled' });
              return;
            }

            dev.status = 'Online';
            dev.lastHeartbeat = new Date();
            dev.lastIp = ipAddress;
            if (telemetry.battery !== undefined) dev.battery = telemetry.battery;
            if (telemetry.signalStrength !== undefined) dev.signalStrength = telemetry.signalStrength;
            if (telemetry.firmwareVersion !== undefined) dev.firmwareVersion = telemetry.firmwareVersion;
            await dev.save();

            await DeviceLog.create({
              deviceId,
              type: 'heartbeat',
              payload: telemetry,
              status: 'SUCCESS',
              ipAddress
            });

            socket.emit('HEARTBEAT_ACK', { time: dev.lastHeartbeat });
            io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', dev);
          } catch (err) {
            console.error(`WS heartbeat error [${deviceId}]:`, err.message);
          }
        });

        // SLOT STATUS UPDATE over WebSockets
        socket.on('SLOT_UPDATE', async (payload = {}) => {
          try {
            const { status, battery, signalStrength } = payload;
            const dev = await IoTDevice.findOne({ deviceId });
            if (!dev) return;
            if (!dev.isActive) {
              socket.emit('IOT_DEVICE_ERR', { message: 'Device is disabled' });
              return;
            }

            const targetSlotId = dev.slotId;
            if (!targetSlotId) {
              socket.emit('IOT_DEVICE_ERR', { message: 'No slot mapped to this device' });
              return;
            }

            const slot = await ParkingSlot.findById(targetSlotId);
            if (!slot) {
              socket.emit('IOT_DEVICE_ERR', { message: 'Mapped slot not found' });
              return;
            }

            const statusLower = status?.toLowerCase();
            const isOccupied = statusLower === 'occupied' || statusLower === 'vehicle_present' || statusLower === 'vehicle detected';

            slot.isOccupied = isOccupied;
            if (!isOccupied && slot.currentBookingId) {
              const booking = await Booking.findById(slot.currentBookingId);
              if (booking && booking.status === 'Active') {
                booking.status = 'Completed';
                booking.actualEndTime = new Date();
                await booking.save();
              }
              slot.currentBookingId = null;
            }
            await slot.save();

            // Adjust zone capacity
            const zone = await ParkingZone.findById(slot.zoneId);
            if (zone) {
              const occupiedCount = await ParkingSlot.countDocuments({ zoneId: zone._id, isOccupied: true });
              zone.availableSlots = Math.max(0, zone.totalSlots - occupiedCount);
              await zone.save();
            }

            // Update device telemetries
            dev.status = 'Online';
            dev.lastHeartbeat = new Date();
            dev.lastIp = ipAddress;
            if (battery !== undefined) dev.battery = battery;
            if (signalStrength !== undefined) dev.signalStrength = signalStrength;
            await dev.save();

            // Broadcast updates
            io.to(`zone:${slot.zoneId}`).emit(isOccupied ? 'SLOT_OCCUPIED' : 'SLOT_FREED', {
              zoneId: slot.zoneId,
              slotId: slot._id,
              slot: slot.slotIdentifier
            });
            if (zone) {
              io.emit('ZONE_UPDATED', zone);
            }

            await DeviceLog.create({
              deviceId,
              type: 'slot_update',
              payload,
              status: 'SUCCESS',
              ipAddress
            });

            socket.emit('SLOT_UPDATE_ACK', { success: true, isOccupied });
            io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', dev);
          } catch (err) {
            console.error(`WS slot update error [${deviceId}]:`, err.message);
          }
        });

        // DISCONNECT event handling
        socket.on('disconnect', async () => {
          try {
            const dev = await IoTDevice.findOne({ deviceId });
            if (dev) {
              if (dev.status === 'Online') {
                dev.status = 'Offline';
                await dev.save();
              }
              await DeviceLog.create({
                deviceId,
                type: 'disconnection',
                payload: { event: 'WS_DISCONNECT' },
                status: 'SUCCESS',
                ipAddress
              });
              console.log(`WS connection closed for device: ${deviceId}`);
              io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', dev);
            }
          } catch (err) {
            console.error('WS disconnection log failed:', err.message);
          }
        });

      } catch (err) {
        console.error('WebSocket IoT portal connection failed:', err.message);
      }
    });

    // ═══════════════════════════════════════
    // LEGACY SIMULATION CHANNELS (BACKWARDS COMPATIBILITY)
    // ═══════════════════════════════════════
    socket.on('START_DUMMY_DATA', (data) => {
      console.log(`Starting mock IoT data for Zone: ${data.zoneId}`);
      const interval = setInterval(async () => {
        const fakeSlotId = `slot_dummy_${Math.floor(Math.random() * 50)}`;
        const isOccupied = Math.random() > 0.5;
        const payload = {
          zoneId: data.zoneId,
          slotId: fakeSlotId,
          isOccupied: isOccupied,
          timestamp: new Date()
        };
        io.to(`zone:${data.zoneId}`).emit(isOccupied ? 'SLOT_OCCUPIED' : 'SLOT_FREED', payload);
      }, 10000);

      socket.on('disconnect', () => {
        clearInterval(interval);
      });
    });

    socket.on('disconnect', () => {
      console.log(`WebSocket Disconnected: ${socket.id}`);
    });
  });
};

/**
 * Heartbeat Watchdog
 * BUG 9 FIX: Marks devices Offline if no heartbeat received in 2+ minutes.
 * Call this from server.js after io is set up.
 */
module.exports.startHeartbeatWatchdog = function startHeartbeatWatchdog(io) {
  const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
      const staleDevices = await IoTDevice.find({
        status: 'Online',
        lastHeartbeat: { $lt: cutoff }
      });

      for (const dev of staleDevices) {
        dev.status = 'Offline';
        await dev.save();

        // Notify provider and admin dashboards
        io.to(`provider:${dev.providerId}`).emit('PROVIDER_DEVICE_UPDATED', dev);
        io.to('admin_dashboard').emit('ADMIN_DEVICE_UPDATED', dev);

        console.log(`[Watchdog] Marked device ${dev.deviceId} Offline (stale heartbeat).`);
      }
    } catch (err) {
      console.error('[Watchdog] Heartbeat check failed:', err.message);
    }
  }, 60 * 1000); // Run every 60 seconds
};
