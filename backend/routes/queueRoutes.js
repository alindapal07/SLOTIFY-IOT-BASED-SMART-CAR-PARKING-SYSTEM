const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const WaitingQueue = require('../models/WaitingQueue');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingZone = require('../models/ParkingZone');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const AuditLog = require('../models/AuditLog');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const { protect } = require('../middleware/authMiddleware');
const { generateQRToken } = require('../utils/qrUtil');
const { encryptPayload } = require('../utils/qrCrypto');
const { calculatePriorityScore, estimateWaitTimeMinutes, processQueueAllocation } = require('../services/queueService');

// @route   POST /api/v1/queue/join
// @desc    Join the waiting queue for a zone
// @access  Private
router.post('/join', protect, async (req, res) => {
  try {
    const { zoneId, vehicleId } = req.body;
    if (!zoneId || !vehicleId) {
      return res.status(400).json({ message: 'Zone ID and Vehicle ID are required' });
    }

    const zone = await ParkingZone.findById(zoneId);
    if (!zone) {
      return res.status(404).json({ message: 'Parking zone not found' });
    }

    const vehicle = await Vehicle.findOne({ _id: vehicleId, userId: req.user._id });
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found or unauthorized' });
    }

    // 1. Prevent joining queue if active booking exists
    const activeBooking = await Booking.findOne({
      userId: req.user._id,
      status: { $in: ['Confirmed', 'Active', 'ENTERING', 'PARKED', 'EXITING'] }
    });
    if (activeBooking) {
      return res.status(400).json({ message: 'You already have an active booking reservation.' });
    }

    // 2. Prevent duplicate active queue entries
    const existingQueue = await WaitingQueue.findOne({
      userId: req.user._id,
      status: { $in: ['Joined', 'Offered'] }
    });
    if (existingQueue) {
      return res.status(400).json({ message: 'You are already in an active waiting queue.' });
    }

    const vehicleType = vehicle.isEV ? 'EV' : (vehicle.vehicleType === 'Motorcycle' ? 'Bike' : vehicle.vehicleType);

    const entry = new WaitingQueue({
      userId: req.user._id,
      zoneId,
      vehicleId,
      vehicleType,
      isHandicap: vehicle.isHandicap || false,
      isEV: vehicle.isEV || false,
      isEmergency: false, // Default false, can be set via override
      status: 'Joined',
      joinedAt: new Date()
    });

    // Calculate priority
    entry.priority = calculatePriorityScore(entry);
    await entry.save();

    await AuditLog.create({
      userId: req.user._id,
      action: 'QUEUE_JOIN',
      details: `Driver joined queue for zone ${zone.name} in category ${vehicleType}`
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${zoneId}`).emit('QUEUE_STATUS_UPDATED', { zoneId });
      io.to(`user:${req.user._id}`).emit('QUEUE_STATE_CHANGED', { status: 'Joined', entry });
    }

    res.status(201).json({ message: 'Successfully joined waiting queue', entry });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   POST /api/v1/queue/leave
// @desc    Leave or cancel waiting queue entry
// @access  Private
router.post('/leave', protect, async (req, res) => {
  try {
    const { queueId } = req.body;
    const entry = await WaitingQueue.findOne({ _id: queueId, userId: req.user._id });
    if (!entry) {
      return res.status(404).json({ message: 'Queue entry not found' });
    }

    const originalStatus = entry.status;
    entry.status = 'Cancelled';
    await entry.save();

    await AuditLog.create({
      userId: req.user._id,
      action: 'QUEUE_LEAVE',
      details: `Driver left queue for zone ${entry.zoneId}`
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${entry.zoneId}`).emit('QUEUE_STATUS_UPDATED', { zoneId: entry.zoneId });
      io.to(`user:${req.user._id}`).emit('QUEUE_STATE_CHANGED', { status: 'Cancelled', entry });
    }

    // If slot was offered, release the slot and allocate to next
    if (originalStatus === 'Offered' && entry.offeredSlotId) {
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
          if (io) io.emit('ZONE_UPDATED', zone);
        }

        // Trigger next allocation
        await processQueueAllocation(req.app, entry.zoneId, slot._id);
      }
    }

    res.json({ message: 'Left waiting queue successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   POST /api/v1/queue/accept
// @desc    Accept slot offer and create booking
// @access  Private
router.post('/accept', protect, async (req, res) => {
  try {
    const { queueId } = req.body;
    const entry = await WaitingQueue.findOne({ _id: queueId, userId: req.user._id })
      .populate('zoneId')
      .populate('vehicleId');

    if (!entry) {
      return res.status(404).json({ message: 'Queue offer not found' });
    }
    if (entry.status !== 'Offered') {
      return res.status(400).json({ message: 'No active slot offer for this queue entry' });
    }
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      return res.status(400).json({ message: 'Slot offer has expired' });
    }

    const slot = await ParkingSlot.findById(entry.offeredSlotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const zone = entry.zoneId;
    const hours = 1; // Default 1 hour booking for queue acceptance
    const expectedCost = 40; // Default flat rate

    // Create booking document
    const bookingStartTime = new Date();
    const booking = new Booking({
      userId: req.user._id,
      zoneId: zone._id,
      slotId: slot._id,
      vehicleId: entry.vehicleId._id,
      vehiclePlate: entry.vehicleId.licensePlate || '',
      status: 'Confirmed',
      startTime: bookingStartTime,
      endTime: new Date(bookingStartTime.getTime() + hours * 60 * 60 * 1000),
      totalCost: expectedCost,
      hours,
      qrCodeData: null,
      arrivalDeadline: new Date(bookingStartTime.getTime() + 30 * 60 * 1000),
      vehicleStatus: 'WAITING_FOR_ENTRY'
    });

    // Generate signed JWT QR token
    const qrPayload = {
      bookingId: booking._id,
      providerId: zone.providerId,
      lotId: zone._id,
      slotId: slot._id,
      vehicleNumber: booking.vehiclePlate,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
    };
    booking.qrToken = generateQRToken(qrPayload);
    booking.qrGeneratedAt = new Date();

    // Generate AES encrypted and base64 encoded qrCodeData
    const qrObj = {
      bookingId: booking._id,
      userId: req.user._id,
      version: booking.qrVersion || 1,
      signature: crypto.createHash('sha256')
        .update(booking._id.toString() + slot._id.toString() + entry.vehicleId._id.toString())
        .digest('hex')
        .slice(0, 10)
    };
    const encrypted = encryptPayload(qrObj);
    booking.qrCodeData = Buffer.from(encrypted).toString('base64');

    await booking.save();

    // Deduct wallet and write ledger
    try {
      await walletService.deductBalance(
        req.user._id,
        expectedCost,
        'booking_payment',
        `Booking from Queue at ${zone.name} - Slot ${slot.slotIdentifier}`,
        booking._id
      );
    } catch (walletError) {
      await Booking.findByIdAndDelete(booking._id);
      return res.status(400).json({ message: walletError.message });
    }

    // Update queue entry
    entry.status = 'Accepted';
    await entry.save();

    // Link slot currentBookingId to the new booking
    slot.isOccupied = true;
    slot.currentBookingId = booking._id;
    await slot.save();

    await AuditLog.create({
      userId: req.user._id,
      action: 'QUEUE_ACCEPT',
      details: `Driver accepted offer and booked slot ${slot.slotIdentifier} at ${zone.name}`
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${zone._id}`).emit('BOOKING_CREATED', {
        slotId: slot._id, status: 'Confirmed', slot: slot.slotIdentifier
      });
      io.to(`zone:${zone._id}`).emit('QUEUE_STATUS_UPDATED', { zoneId: zone._id });
      io.to(`user:${req.user._id}`).emit('QUEUE_STATE_CHANGED', { status: 'Accepted', entry, booking });
    }

    res.json({ message: 'Offer accepted successfully', booking });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   POST /api/v1/queue/decline
// @desc    Decline slot offer
// @access  Private
router.post('/decline', protect, async (req, res) => {
  try {
    const { queueId } = req.body;
    const entry = await WaitingQueue.findOne({ _id: queueId, userId: req.user._id });
    if (!entry) {
      return res.status(404).json({ message: 'Queue offer not found' });
    }
    if (entry.status !== 'Offered') {
      return res.status(400).json({ message: 'No active offer to decline' });
    }

    entry.status = 'Declined';
    await entry.save();

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
        const io = req.app.get('io');
        if (io) io.emit('ZONE_UPDATED', zone);
      }

      await AuditLog.create({
        userId: req.user._id,
        action: 'QUEUE_DECLINE',
        details: `Driver declined queue slot offer ${slot.slotIdentifier} at ${zone ? zone.name : entry.zoneId}`
      });

      const io = req.app.get('io');
      if (io) {
        io.to(`zone:${entry.zoneId}`).emit('QUEUE_STATUS_UPDATED', { zoneId: entry.zoneId });
        io.to(`user:${req.user._id}`).emit('QUEUE_STATE_CHANGED', { status: 'Declined', entry });
      }

      // Trigger next allocation
      await processQueueAllocation(req.app, entry.zoneId, slot._id);
    }

    res.json({ message: 'Offer declined successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   GET /api/v1/queue/status
// @desc    Get current driver's queue status
// @access  Private
router.get('/status', protect, async (req, res) => {
  try {
    const entries = await WaitingQueue.find({
      userId: req.user._id,
      status: { $in: ['Joined', 'Offered'] }
    }).populate('zoneId').populate('vehicleId');

    const result = await Promise.all(entries.map(async (entry) => {
      const list = await WaitingQueue.find({
        zoneId: entry.zoneId._id,
        status: 'Joined',
        vehicleType: entry.vehicleType
      }).sort({ priority: -1, joinedAt: 1 });

      const position = entry.status === 'Offered' ? 0 : list.findIndex(item => item._id.toString() === entry._id.toString()) + 1;
      const waitTime = await estimateWaitTimeMinutes(entry.zoneId._id, entry._id);
      const reservationTimer = entry.status === 'Offered' && entry.expiresAt
        ? Math.max(0, Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000))
        : 0;

      return {
        _id: entry._id,
        zoneId: entry.zoneId,
        vehicleType: entry.vehicleType,
        vehiclePlate: entry.vehicleId?.licensePlate || '',
        status: entry.status,
        priority: entry.priority,
        joinedAt: entry.joinedAt,
        offeredSlotId: entry.offeredSlotId,
        expiresAt: entry.expiresAt,
        queuePosition: position,
        waitTimeMinutes: waitTime,
        reservationTimerSeconds: reservationTimer
      };
    }));

    res.json(result[0] || null); // Return single active queue entry or null
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   GET /api/v1/queue/provider
// @desc    Get queue details for all zones owned by the provider
// @access  Private
router.get('/provider', protect, async (req, res) => {
  try {
    if (req.user.role !== 'PROVIDER' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Access denied' });
    }
    const zones = await ParkingZone.find({ providerId: req.user._id });
    const zoneIds = zones.map(z => z._id);

    const entries = await WaitingQueue.find({ zoneId: { $in: zoneIds }, status: { $in: ['Joined', 'Offered'] } })
      .populate('userId', 'fullName email')
      .populate('zoneId', 'name')
      .populate('vehicleId', 'make model licensePlate')
      .sort({ priority: -1, joinedAt: 1 });

    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   GET /api/v1/queue/zone/:zoneId
// @desc    Get queue details for a zone (Provider / Admin view)
// @access  Private
router.get('/zone/:zoneId', protect, async (req, res) => {
  try {
    const { zoneId } = req.params;
    const entries = await WaitingQueue.find({ zoneId, status: { $in: ['Joined', 'Offered'] } })
      .populate('userId', 'fullName email')
      .populate('vehicleId', 'make model licensePlate')
      .sort({ priority: -1, joinedAt: 1 });

    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @route   POST /api/v1/queue/override
// @desc    Admin/Provider queue priority override
// @access  Private
router.post('/override', protect, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN' && req.user.role !== 'PROVIDER') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { queueId, priorityBoost, adminOverride } = req.body;
    const entry = await WaitingQueue.findById(queueId);
    if (!entry) {
      return res.status(404).json({ message: 'Queue entry not found' });
    }

    if (priorityBoost !== undefined) entry.priority += priorityBoost;
    if (adminOverride !== undefined) entry.isAdminOverride = adminOverride;
    
    await entry.save();

    await AuditLog.create({
      userId: req.user._id,
      action: 'QUEUE_OVERRIDE',
      details: `Queue override applied to entry ${queueId}`
    });

    const io = req.app.get('io');
    if (io) io.to(`zone:${entry.zoneId}`).emit('QUEUE_STATUS_UPDATED', { zoneId: entry.zoneId });

    res.json({ message: 'Queue entry override applied successfully', entry });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
