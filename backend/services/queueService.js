const WaitingQueue = require('../models/WaitingQueue');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingZone = require('../models/ParkingZone');
const Booking = require('../models/Booking');
const AuditLog = require('../models/AuditLog');
const notificationService = require('./notificationService');

/**
 * Calculates priority score based on:
 * - isEmergency: +1000
 * - isAdminOverride: +500
 * - isHandicap: +100
 * - isEV: +50 (only relevant if matching EV slot, but calculated generally)
 * - FIFO: older joinedAt gets higher relative rank via base timestamp sorting
 */
const calculatePriorityScore = (entry) => {
  let score = 0;
  if (entry.isEmergency) score += 1000;
  if (entry.isAdminOverride) score += 500;
  if (entry.isHandicap) score += 100;
  if (entry.isEV) score += 50;
  return score;
};

/**
 * Dynamic Wait Time Estimation
 * Uses current queue position, active staying bookings, historical stay averages,
 * and current occupancy to calculate a dynamic ETA.
 */
const estimateWaitTimeMinutes = async (zoneId, queueEntryId) => {
  try {
    const entry = await WaitingQueue.findById(queueEntryId);
    if (!entry || entry.status !== 'Joined') return 0;

    // Find all active/joined queue entries for this zone and category
    const list = await WaitingQueue.find({
      zoneId,
      status: 'Joined',
      vehicleType: entry.vehicleType
    }).sort({ priority: -1, joinedAt: 1 });

    const position = list.findIndex(item => item._id.toString() === entry._id.toString()) + 1;
    if (position <= 0) return 0;

    // Get live occupancy stats for this vehicle type in the zone
    const slots = await ParkingSlot.find({ zoneId, isActive: true });
    const categorySlots = slots.filter(s => {
      if (entry.vehicleType === 'EV') return s.isEV;
      if (entry.isHandicap) return s.isHandicap || s.slotIdentifier.startsWith('H');
      return s.vehicleCategory === entry.vehicleType || s.slotIdentifier.startsWith(entry.vehicleType.charAt(0));
    });

    const totalCategorySlots = categorySlots.length || 5;
    const occupiedCount = categorySlots.filter(s => s.isOccupied).length;

    // Average stay duration from last 30 days (default 120 minutes)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const pastBookings = await Booking.find({
      zoneId,
      status: 'Completed',
      createdAt: { $gte: thirtyDaysAgo }
    });

    let avgStayMinutes = 120;
    if (pastBookings.length > 0) {
      const totalMin = pastBookings.reduce((sum, b) => {
        const start = new Date(b.startTime);
        const end = new Date(b.actualEndTime || b.endTime);
        return sum + Math.max(10, Math.round((end - start) / 60000));
      }, 0);
      avgStayMinutes = Math.round(totalMin / pastBookings.length);
    }

    // Dynamic factor based on current late exits and expected exits
    const activeBookings = await Booking.find({ zoneId, status: 'Active' });
    const lateExitsCount = activeBookings.filter(b => new Date(b.endTime) < new Date()).length;

    const baseWait = (position * avgStayMinutes) / Math.max(1, totalCategorySlots);
    const latePenalty = lateExitsCount * 15; // Late exits slow down rotation
    const occupancyFactor = occupiedCount === totalCategorySlots ? 1.2 : 0.8; // Peak factor

    return Math.max(5, Math.round((baseWait + latePenalty) * occupancyFactor));
  } catch (err) {
    console.error('[estimateWaitTimeMinutes] Error:', err);
    return 15; // default fallback
  }
};

/**
 * Core Slot Allocation Hook
 * Triggered automatically when a slot is freed (exit/cancel/expiry/release).
 * Evaluates the waiting list, holds a slot for the highest priority eligible driver
 * for 5 minutes, and broadcasts updates.
 */
const processQueueAllocation = async (app, zoneId, slotId) => {
  try {
    const io = app.get('io');
    const slot = await ParkingSlot.findById(slotId);
    if (!slot || slot.isOccupied || slot.currentBookingId || slot.isUnderMaintenance) return;

    // Find all "Joined" entries for this zone
    const queueEntries = await WaitingQueue.find({ zoneId, status: 'Joined' })
      .populate('userId', 'fullName email')
      .sort({ priority: -1, joinedAt: 1 });

    if (queueEntries.length === 0) return;

    // Find first compatible driver
    let eligibleEntry = null;
    for (const entry of queueEntries) {
      let isCompatible = false;
      if (entry.vehicleType === 'EV') {
        isCompatible = slot.isEV;
      } else if (entry.isHandicap) {
        isCompatible = slot.isEmergency || slot.slotIdentifier.startsWith('H'); // Emergency/Handicap slots
      } else {
        // Match specific vehicle category or default slot prefixes
        isCompatible = !slot.isEV && (
          slot.vehicleCategory === entry.vehicleType || 
          slot.slotIdentifier.startsWith(entry.vehicleType.charAt(0))
        );
      }

      if (isCompatible) {
        eligibleEntry = entry;
        break;
      }
    }

    if (!eligibleEntry) return;

    // We found an eligible driver! Put a hold on the slot for 5 minutes
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 mins hold

    eligibleEntry.status = 'Offered';
    eligibleEntry.offeredSlotId = slot._id;
    eligibleEntry.offeredAt = now;
    eligibleEntry.expiresAt = expiresAt;
    await eligibleEntry.save();

    // Lock the slot temporarily with a queue reservation reference
    slot.isOccupied = true; // Mark as occupied/reserved to avoid double booking
    slot.currentBookingId = eligibleEntry._id; // Place queue entry reference in slot
    await slot.save();

    // Update Zone availability since slot is locked
    const zone = await ParkingZone.findById(zoneId);
    if (zone) {
      const occupiedCount = await ParkingSlot.countDocuments({ zoneId: zone._id, isOccupied: true });
      zone.availableSlots = Math.max(0, zone.totalSlots - occupiedCount);
      await zone.save();
      if (io) io.emit('ZONE_UPDATED', zone);
    }

    // Broadcast to Driver Dashboard
    if (io) {
      io.to(`user:${eligibleEntry.userId._id}`).emit('QUEUE_OFFERED', {
        queueId: eligibleEntry._id,
        zoneId: zoneId,
        zoneName: zone ? zone.name : 'Parking Space',
        slotId: slot._id,
        slotIdentifier: slot.slotIdentifier,
        expiresAt: expiresAt,
        timeRemainingSeconds: 300
      });
      // Broadcast general queue status update
      io.to(`zone:${zoneId}`).emit('QUEUE_STATUS_UPDATED', { zoneId });
    }

    // Send notifications
    await notificationService.sendNotification(
      app,
      eligibleEntry.userId._id,
      'Slot Available in Queue!',
      `A slot (${slot.slotIdentifier}) has been reserved for you at ${zone ? zone.name : 'Parking Space'}. You have 5 minutes to Accept it.`,
      'ALERT'
    );

    await AuditLog.create({
      userId: eligibleEntry.userId._id,
      action: 'QUEUE_SLOT_OFFERED',
      details: `Slot ${slot.slotIdentifier} offered to driver ${eligibleEntry.userId.fullName} in zone ${zoneId} for 5 minutes.`
    });

  } catch (err) {
    console.error('[processQueueAllocation] Error:', err.message);
  }
};

module.exports = {
  calculatePriorityScore,
  estimateWaitTimeMinutes,
  processQueueAllocation
};
