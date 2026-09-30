require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const ioEvents = require('./sockets/ioEvents');
const { getLocalIpAddress } = require('./utils/network');
const LAN_IP = getLocalIpAddress();

// Initialize Express App
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all for development, restrict in production
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Setup global Socket.io variable to be used in controllers
app.set('io', io);

// Connect to MongoDB
connectDB();

// Simple custom cookie parser
const cookieParser = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  const list = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  req.cookies = list;
  next();
};

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://${LAN_IP}:5173`,
  `http://${LAN_IP}:5000`
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith(`http://${LAN_IP}:`);
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(cookieParser);
app.use(express.json());

// Basic Route for testing
app.get('/', (req, res) => {
  res.send('AI Smart Parking Backend is Running');
});

// Inngest
const { serve } = require("inngest/express");
const { inngest, functions } = require("./inngest/client");
app.use("/api/inngest", serve({ client: inngest, functions }));

// Import Routes
app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/parking', require('./routes/parkingRoutes'));
app.use('/api/v1/iot', require('./routes/iotRoutes')); // Handles IoT Connections (Human/Dashboard)
app.use('/api/v1/esp', require('./routes/espRoutes')); // ESP32 Device API (deviceAuth, no JWT)
app.use('/api/v1/bookings', require('./routes/bookingRoutes'));
app.use('/api/v1/wallet', require('./routes/walletRoutes'));
app.use('/api/v1/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/v1/admin', require('./routes/adminRoutes'));
app.use('/api/v1/ai', require('./routes/aiRoutes'));
app.use('/api/v1/feedback', require('./routes/feedbackRoutes'));
app.use('/api/v1/notifications', require('./routes/notificationRoutes'));
app.use('/api/v1/queue', require('./routes/queueRoutes'));
app.use('/api/v1/pdf',   require('./routes/pdfRoutes'));   // Phase 25A — PDF Engine

// Setup socket events
ioEvents(io);

// Start IoT heartbeat watchdog (marks stale Online devices as Offline every 60s)
if (typeof ioEvents.startHeartbeatWatchdog === 'function') {
  ioEvents.startHeartbeatWatchdog(io);
  console.log('IoT Heartbeat Watchdog started.');
}

// Start background checking loop for No Shows and Overstays
setInterval(async () => {
  try {
    const Booking = require('./models/Booking');
    const ParkingSlot = require('./models/ParkingSlot');
    const ParkingZone = require('./models/ParkingZone');
    const notificationService = require('./services/notificationService');
    const now = new Date();

    // ═══════════════════════════════════════════════════════════════
    // PHASE 23E — WAITING QUEUE TIMEOUT WATCHDOG
    // Process offered slots in the waiting queue that have expired
    // ═══════════════════════════════════════════════════════════════
    const WaitingQueue = require('./models/WaitingQueue');
    const AuditLog = require('./models/AuditLog');
    const { processQueueAllocation } = require('./services/queueService');
    const expiredOffers = await WaitingQueue.find({
      status: 'Offered',
      expiresAt: { $lt: now }
    });

    for (const entry of expiredOffers) {
      entry.status = 'Timeout';
      await entry.save();

      // Free slot
      const slot = await ParkingSlot.findById(entry.offeredSlotId);
      if (slot && slot.currentBookingId && slot.currentBookingId.toString() === entry._id.toString()) {
        slot.isOccupied = false;
        slot.currentBookingId = null;
        await slot.save();

        const zone = await ParkingZone.findById(entry.zoneId);
        if (zone) {
          const occupiedCount = await ParkingSlot.countDocuments({ zoneId: zone._id, isOccupied: true });
          zone.availableSlots = Math.max(0, zone.totalSlots - occupiedCount);
          await zone.save();
          
          const io = app.get('io');
          if (io) {
            io.emit('ZONE_UPDATED', zone);
            io.to(`zone:${zone._id}`).emit('SLOT_FREED', {
              zoneId: zone._id, slotId: slot._id, slot: slot.slotIdentifier
            });
            io.to(`zone:${entry.zoneId}`).emit('QUEUE_STATUS_UPDATED', { zoneId: entry.zoneId });
            io.to(`user:${entry.userId}`).emit('QUEUE_STATE_CHANGED', { status: 'Timeout', entry });
          }
        }

        // Notify driver
        await notificationService.sendNotification(
          app,
          entry.userId,
          'Queue Offer Expired',
          `Your offer for slot ${slot.slotIdentifier} has expired because you didn't accept it in time.`,
          'INFO'
        );

        await AuditLog.create({
          userId: entry.userId,
          action: 'QUEUE_TIMEOUT',
          details: `Queue offer expired for driver in slot ${slot.slotIdentifier}.`
        });

        // Trigger next allocation for this slot
        await processQueueAllocation(app, entry.zoneId, slot._id);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 17 — NO-SHOW ENGINE
    // Process bookings that have missed their arrivalDeadline
    // (booking is Confirmed + vehicleStatus = WAITING_FOR_ENTRY + arrivalDeadline passed)
    // ═══════════════════════════════════════════════════════════════
    const noShowBookings = await Booking.find({
      status: 'Confirmed',
      vehicleStatus: 'WAITING_FOR_ENTRY',
      arrivalDeadline: { $lt: now },
      noShowProcessed: { $ne: true }
    });

    for (const booking of noShowBookings) {
      booking.status = 'Cancelled';
      booking.noShowProcessed = true;
      await booking.save();

      // Free slot
      await ParkingSlot.findByIdAndUpdate(booking.slotId, { isOccupied: false, currentBookingId: null });

      // Update zone capacity
      const zone = await ParkingZone.findById(booking.zoneId);
      if (zone) {
        zone.availableSlots = Math.min(zone.totalSlots, zone.availableSlots + 1);
        await zone.save();

        const io = app.get('io');
        if (io) {
          io.emit('ZONE_UPDATED', zone);
          io.to(`zone:${zone._id}`).emit('SLOT_FREED', {
            zoneId: zone._id, slotId: booking.slotId, slot: ''
          });
          // Notify driver dashboard in real-time
          io.to(`user:${booking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
            bookingId: booking._id,
            vehicleStatus: 'NO_SHOW',
            lastSensorUpdate: now,
            slotIdentifier: null,
            sensorHealth: null
          });
          io.to(`user:${booking.userId}`).emit('BOOKING_CANCELLED', {
            bookingId: booking._id,
            reason: 'NO_SHOW'
          });
        }
      }

      // Refund driver (full refund for no-show if wallet payment)
      try {
        const walletService = require('./services/walletService');
        await walletService.creditBalance(
          booking.userId,
          booking.totalCost,
          'refund',
          `No-show refund: You did not arrive within the grace window for booking #${booking._id.toString().slice(-6)}`,
          booking._id
        );
      } catch (refErr) {
        console.error('[NO-SHOW] Refund failed:', refErr.message);
      }

      // Notify driver
      await notificationService.sendNotification(
        app,
        booking.userId,
        'Booking Cancelled — No Show',
        `Your reservation was cancelled because you did not arrive within 30 minutes. A full refund of ₹${booking.totalCost} has been issued.`,
        'REFUND'
      );

      // Notify provider
      if (zone) {
        await notificationService.sendNotification(
          app,
          zone.providerId,
          'No-Show — Slot Released',
          `Booking #${booking._id.toString().slice(-6)} was auto-cancelled (no-show). Slot has been released at ${zone.name}.`,
          'INFO'
        );
      }

      console.log(`[PHASE17 NO-SHOW] Booking ${booking._id} cancelled. Full refund issued.`);
    }

    // ═══════════════════════════════════════════════════════════════
    // LEGACY: Process older Confirmed bookings that have exceeded endTime
    // (fallback for bookings created before Phase 17 arrivalDeadline was added)
    // ═══════════════════════════════════════════════════════════════
    const expiredBookings = await Booking.find({
      status: 'Confirmed',
      endTime: { $lt: now },
      noShowProcessed: { $ne: true },
      arrivalDeadline: null  // only legacy bookings without arrivalDeadline
    });

    for (const booking of expiredBookings) {
      booking.status = 'Expired';
      booking.noShowProcessed = true;
      await booking.save();

      // Free slot
      await ParkingSlot.findByIdAndUpdate(booking.slotId, { isOccupied: false, currentBookingId: null });

      // Update zone capacity
      const zone = await ParkingZone.findById(booking.zoneId);
      if (zone) {
        zone.availableSlots = Math.min(zone.totalSlots, zone.availableSlots + 1);
        await zone.save();
        
        // Emit Zone Updated
        const io = app.get('io');
        if (io) {
          io.emit('ZONE_UPDATED', zone);
          io.to(`zone:${zone._id}`).emit('SLOT_FREED', {
            zoneId: zone._id,
            slotId: booking.slotId,
            slot: ''
          });
        }
      }

      // Send notifications
      await notificationService.sendNotification(
        app,
        booking.userId,
        'Reservation Expired',
        `Your reservation at ${zone ? zone.name : 'parking space'} has expired.`,
        'INFO'
      );
      if (zone) {
        await notificationService.sendNotification(
          app,
          zone.providerId,
          'Reservation Expired',
          `Reservation for slot at ${zone.name} expired (No Show).`,
          'INFO'
        );
      }
      console.log(`[BACKGROUND] Marked booking ${booking._id} as Expired (No Show)`);
    }


    // 2. Process Late Exits (Grace period check > 5 mins)
    const graceMs = 5 * 60 * 1000;
    const overstayLimit = new Date(now.getTime() - graceMs);
    const lateExitBookings = await Booking.find({
      status: 'Active',
      endTime: { $lt: overstayLimit },
      lateExitNotified: false
    });

    for (const booking of lateExitBookings) {
      booking.lateExitNotified = true;
      await booking.save();

      const zone = await ParkingZone.findById(booking.zoneId);
      const slot = await ParkingSlot.findById(booking.slotId);

      // Notify driver
      await notificationService.sendNotification(
        app,
        booking.userId,
        'Late Exit Overstay',
        `Warning: You have exceeded your booking time at ${zone ? zone.name : 'parking space'}. Fine rates apply.`,
        'PENALTY'
      );

      // Notify provider
      if (zone) {
        await notificationService.sendNotification(
          app,
          zone.providerId,
          'Late Exit Alert',
          `Vehicle ${booking.vehiclePlate} has overstayed in slot ${slot ? slot.slotIdentifier : ''} at ${zone.name}.`,
          'INFO'
        );
      }
      console.log(`[BACKGROUND] Notified late exit for booking ${booking._id}`);
    }

    // 3. Process IoT Heartbeat Expiries (> 60 seconds)
    const IoTDevice = require('./models/IoTDevice');
    const expiryLimit = new Date(now.getTime() - 60 * 1000);
    const expiredDevices = await IoTDevice.find({
      status: 'Online',
      lastHeartbeat: { $lt: expiryLimit }
    });

    for (const device of expiredDevices) {
      device.status = 'Offline';
      await device.save();

      console.log(`[BACKGROUND] IoT Device ${device.deviceId} marked Offline (Heartbeat Timeout)`);

      const io = app.get('io');
      if (io) {
        io.to(`provider:${device.providerId}`).emit('DEVICE_OFFLINE', {
          deviceId: device.deviceId,
          name: device.name
        });
      }
    }

  } catch (err) {
    console.error('[BACKGROUND ERR]', err.message);
  }
}, 30000);

// Start Server
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Local API: http://localhost:${PORT}`);
  console.log(`Network API: http://${LAN_IP}:${PORT}`);
});