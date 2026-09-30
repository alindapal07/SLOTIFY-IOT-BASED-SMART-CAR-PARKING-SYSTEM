/**
 * Background Watchdog & Periodic Jobs
 * 
 * Manages automated lifecycle tasks:
 * 1. Waiting Queue Timeout Watchdog (Phase 23E)
 * 2. Driver No-Show Auto-Cancellation & Refund Engine (Phase 17)
 * 3. Legacy Expired Bookings Fallback
 * 4. Late Exit & Overstay Warning Engine
 * 5. IoT Device Heartbeat Expiry Watchdog
 */

const Booking = require('../models/Booking');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingZone = require('../models/ParkingZone');
const WaitingQueue = require('../models/WaitingQueue');
const AuditLog = require('../models/AuditLog');
const IoTDevice = require('../models/IoTDevice');
const notificationService = require('../services/notificationService');
const walletService = require('../services/walletService');
const { processQueueAllocation } = require('../services/queueService');
const { acquireDistributedLock, releaseDistributedLock } = require('../config/redis');

let intervalId = null;

const runWatchdogCycle = async (app) => {
  const lock = await acquireDistributedLock('job:watchdog:master_cycle', 25);
  if (!lock) {
    // Another monolith instance is currently executing the watchdog cycle
    return;
  }

  try {
    const now = new Date();
    const io = app ? app.get('io') : null;

    // ═══════════════════════════════════════════════════════════════
    // PHASE 23E — WAITING QUEUE TIMEOUT WATCHDOG
    // ═══════════════════════════════════════════════════════════════
    const expiredOffers = await WaitingQueue.find({
      status: 'Offered',
      expiresAt: { $lt: now }
    }).limit(100);

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
    // ═══════════════════════════════════════════════════════════════
    const noShowBookings = await Booking.find({
      status: 'Confirmed',
      vehicleStatus: 'WAITING_FOR_ENTRY',
      arrivalDeadline: { $lt: now },
      noShowProcessed: { $ne: true }
    }).limit(100);

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

        if (io) {
          io.emit('ZONE_UPDATED', zone);
          io.to(`zone:${zone._id}`).emit('SLOT_FREED', {
            zoneId: zone._id, slotId: booking.slotId, slot: ''
          });
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

      // Refund driver (full refund for no-show)
      try {
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
    // LEGACY: Older Confirmed bookings that exceeded endTime
    // ═══════════════════════════════════════════════════════════════
    const expiredBookings = await Booking.find({
      status: 'Confirmed',
      endTime: { $lt: now },
      noShowProcessed: { $ne: true },
      arrivalDeadline: null
    }).limit(100);

    for (const booking of expiredBookings) {
      booking.status = 'Expired';
      booking.noShowProcessed = true;
      await booking.save();

      await ParkingSlot.findByIdAndUpdate(booking.slotId, { isOccupied: false, currentBookingId: null });

      const zone = await ParkingZone.findById(booking.zoneId);
      if (zone) {
        zone.availableSlots = Math.min(zone.totalSlots, zone.availableSlots + 1);
        await zone.save();

        if (io) {
          io.emit('ZONE_UPDATED', zone);
          io.to(`zone:${zone._id}`).emit('SLOT_FREED', {
            zoneId: zone._id,
            slotId: booking.slotId,
            slot: ''
          });
        }
      }

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

    // ═══════════════════════════════════════════════════════════════
    // 4. Late Exits (Grace period check > 5 mins)
    // ═══════════════════════════════════════════════════════════════
    const graceMs = 5 * 60 * 1000;
    const overstayLimit = new Date(now.getTime() - graceMs);
    const lateExitBookings = await Booking.find({
      status: 'Active',
      endTime: { $lt: overstayLimit },
      lateExitNotified: false
    }).limit(100);

    for (const booking of lateExitBookings) {
      booking.lateExitNotified = true;
      await booking.save();

      const zone = await ParkingZone.findById(booking.zoneId);
      const slot = await ParkingSlot.findById(booking.slotId);

      await notificationService.sendNotification(
        app,
        booking.userId,
        'Late Exit Overstay',
        `Warning: You have exceeded your booking time at ${zone ? zone.name : 'parking space'}. Fine rates apply.`,
        'PENALTY'
      );

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

    // ═══════════════════════════════════════════════════════════════
    // 5. IoT Heartbeat Expiries (> 60 seconds)
    // ═══════════════════════════════════════════════════════════════
    const expiryLimit = new Date(now.getTime() - 60 * 1000);
    const expiredDevices = await IoTDevice.find({
      status: 'Online',
      lastHeartbeat: { $lt: expiryLimit }
    }).limit(200);

    for (const device of expiredDevices) {
      device.status = 'Offline';
      await device.save();

      console.log(`[BACKGROUND] IoT Device ${device.deviceId} marked Offline (Heartbeat Timeout)`);

      if (io) {
        io.to(`provider:${device.providerId}`).emit('DEVICE_OFFLINE', {
          deviceId: device.deviceId,
          name: device.name
        });
      }
    }

  } catch (err) {
    console.error('[BACKGROUND ERR]', err.message);
  } finally {
    await releaseDistributedLock(lock);
  }
};

const startWatchdogJobs = (app, intervalMs = 30000) => {
  if (intervalId) {
    clearInterval(intervalId);
  }
  intervalId = setInterval(() => runWatchdogCycle(app), intervalMs);
  console.log(`Periodic Background Watchdog started (interval: ${intervalMs / 1000}s).`);
  return intervalId;
};

const stopWatchdogJobs = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Background Watchdog stopped.');
  }
};

module.exports = {
  startWatchdogJobs,
  stopWatchdogJobs,
  runWatchdogCycle
};
