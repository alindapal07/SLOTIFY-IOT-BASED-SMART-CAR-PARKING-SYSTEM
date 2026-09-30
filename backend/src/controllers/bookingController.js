const Booking = require('../models/Booking');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingZone = require('../models/ParkingZone');
const Vehicle = require('../models/Vehicle');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const { generateQRToken, verifyQRToken } = require('../utils/qrUtil');
const { encryptPayload } = require('../utils/qrCrypto');
const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');
const BookingAudit = require('../models/BookingAudit');

// Helper to return a minimal booking payload
function minimalBooking(booking) {
  return {
    bookingId: booking._id,
    zoneId: booking.zoneId,
    slotId: booking.slotId,
    vehicleId: booking.vehicleId,
    status: booking.status,
    startTime: booking.startTime,
    endTime: booking.endTime,
    totalCost: booking.totalCost
  };
}
// @desc    Get all bookings for current user
// @route   GET /api/v1/bookings/my
// @access  Private
exports.getUserBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .populate('zoneId', 'name location basePricePerHour')
      .populate('slotId', 'slotIdentifier isEV')
      .populate('vehicleId', 'make model licensePlate vehicleType color')
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get active booking for current user
// @route   GET /api/v1/bookings/active
// @access  Private
exports.getActiveBooking = async (req, res) => {
  try {
    const active = await Booking.findOne({
      userId: req.user._id,
      status: { $in: ['Confirmed', 'Active', 'ENTERING', 'PARKED', 'EXITING'] }
    })
      .populate('zoneId', 'name location basePricePerHour address')
      .populate('slotId', 'slotIdentifier isEV')
      .populate('vehicleId', 'make model licensePlate vehicleType color');
    
    res.json(active || null);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Helper function to check vehicle size and category compatibility
const isCompatible = (vehicleType, slotCategory) => {
  if (!vehicleType || !slotCategory) return false;

  // Strict category matches
  if (slotCategory === 'Handicap') return vehicleType === 'Handicap';
  if (vehicleType === 'Handicap') return slotCategory === 'Handicap';

  if (slotCategory === 'EV') return vehicleType === 'EV';
  if (vehicleType === 'EV') return slotCategory === 'EV';

  if (slotCategory === 'Bus') return vehicleType === 'Bus';
  if (vehicleType === 'Bus') return slotCategory === 'Bus';

  // Bike and Scooter
  if (slotCategory === 'Bike') return ['Bike', 'Scooter'].includes(vehicleType);
  if (slotCategory === 'Scooter') return vehicleType === 'Scooter';
  if (['Bike', 'Scooter'].includes(vehicleType)) return ['Bike', 'Scooter'].includes(slotCategory);

  // Trucks
  if (slotCategory === 'Truck') return ['Truck', 'Mini Truck'].includes(vehicleType);
  if (slotCategory === 'Mini Truck') return vehicleType === 'Mini Truck';
  if (['Truck', 'Mini Truck'].includes(vehicleType)) return ['Truck', 'Mini Truck'].includes(slotCategory);

  // Standard Car sizes: Hatchback <= Sedan <= SUV <= Luxury Car
  const sizes = { 'Hatchback': 1, 'Sedan': 2, 'SUV': 3, 'Luxury Car': 4 };
  const vehicleSize = sizes[vehicleType];
  const slotSize = sizes[slotCategory];

  if (vehicleSize && slotSize) {
    return vehicleSize <= slotSize;
  }
  return vehicleType === slotCategory;
};

// @desc    Initiate a parking booking
// @route   POST /api/v1/bookings/initiate
// @access  Private
exports.initiateBooking = async (req, res) => {
  try {
    const { zoneId, slotId, hours, vehicleId, vehicleType } = req.body;

    const zone = await ParkingZone.findById(zoneId);
    if (!zone) return res.status(404).json({ message: 'Zone not found' });

    // 1. Prevent duplicate concurrent bookings
    const activeBooking = await Booking.findOne({
      userId: req.user._id,
      status: { $in: ['Confirmed', 'Active', 'ENTERING', 'PARKED', 'EXITING'] }
    });
    if (activeBooking) {
      return res.status(400).json({ message: 'You already have an active or confirmed parking reservation. Multiple concurrent bookings are not allowed.' });
    }

    // 2. Fetch and check slot status
    const slot = await ParkingSlot.findById(slotId);
    if (!slot) return res.status(404).json({ message: 'Slot not found' });

    if (slot.isOccupied || slot.currentBookingId) {
      return res.status(400).json({ message: 'Slot is already occupied or reserved.' });
    }
    if (slot.isUnderMaintenance) {
      return res.status(400).json({ message: 'Slot is under maintenance and cannot be booked.' });
    }
    if (slot.isActive === false) {
      return res.status(400).json({ message: 'Slot is offline/inactive and cannot be booked.' });
    }
    if (slot.isEmergency) {
      return res.status(400).json({ message: 'Reserved emergency slots cannot be booked by general users.' });
    }

    // 3. Get vehicle information and check size compatibility
    let finalVehicleType = '';
    let vehiclePlate = '';
    
    if (vehicleId) {
      const vehicle = await Vehicle.findOne({ _id: vehicleId, userId: req.user._id });
      if (!vehicle) {
        return res.status(400).json({ message: 'Selected vehicle not found or does not belong to your account.' });
      }
      finalVehicleType = vehicle.isEV ? 'EV' : (vehicle.vehicleType === 'Motorcycle' ? 'Bike' : vehicle.vehicleType);
      vehiclePlate = vehicle.licensePlate || '';
    } else {
      return res.status(400).json({ message: 'Vehicle selection is required to book a slot.' });
    }

    if (!isCompatible(finalVehicleType, slot.vehicleCategory)) {
      return res.status(400).json({ message: `Wrong vehicle size: A vehicle of type "${finalVehicleType}" is not compatible with a "${slot.vehicleCategory}" slot.` });
    }

    const h = hours || 1;
    let expectedCost;
    if (h <= 1) {
      expectedCost = 40;
    } else {
      expectedCost = 40 + Math.round((h - 1) * zone.basePricePerHour * zone.dynamicPricingMultiplier);
    }

    // Atomically reserve the slot to prevent concurrent double-booking race conditions
    const updatedSlot = await ParkingSlot.findOneAndUpdate(
      { _id: slotId, isOccupied: false, isUnderMaintenance: false, currentBookingId: null, isActive: true },
      { $set: { isOccupied: true } },
      { new: true }
    );

    if (!updatedSlot) {
      return res.status(400).json({ message: 'Slot is no longer available or already reserved (Double allocation prevented).' });
    }

    // Create booking (status: Confirmed/Reserved)
    const bookingStartTime = new Date();
    const booking = new Booking({
      userId: req.user._id,
      zoneId,
      slotId,
      vehicleId: vehicleId || null,
      vehiclePlate,
      status: 'Confirmed',
      startTime: bookingStartTime,
      endTime: new Date(Date.now() + h * 60 * 60 * 1000),
      totalCost: expectedCost,
      hours: h,
      qrCodeData: null,
      // Phase 17: arrival deadline — driver must arrive within 30 minutes
      arrivalDeadline: new Date(bookingStartTime.getTime() + 30 * 60 * 1000),
      // Phase 17: begin presence engine in WAITING_FOR_ENTRY
      vehicleStatus: 'WAITING_FOR_ENTRY'
    });

    // Generate signed JWT QR token with required claims
    const qrPayload = {
      bookingId: booking._id,
      providerId: zone.providerId,
      lotId: zone._id,
      slotId: slot._id,
      vehicleNumber: vehiclePlate,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // token valid for 24h
    };
    booking.qrToken = generateQRToken(qrPayload);
    booking.qrGeneratedAt = new Date();

    // Generate AES encrypted and base64 encoded qrCodeData for /scan-qr and frontend
    const qrObj = {
      bookingId: booking._id,
      userId: req.user._id,
      version: booking.qrVersion || 1,
      signature: crypto.createHash('sha256')
        .update(booking._id.toString() + slot._id.toString() + (vehicleId ? vehicleId.toString() : ''))
        .digest('hex')
        .slice(0, 10)
    };
    const encrypted = encryptPayload(qrObj);
    booking.qrCodeData = Buffer.from(encrypted).toString('base64');

    await booking.save();

    // Deduct wallet and write ledger via wallet service
    let walletResult;
    try {
      walletResult = await walletService.deductBalance(
        req.user._id,
        expectedCost,
        'booking_payment',
        `Booking at ${zone.name} - Slot ${slot.slotIdentifier} (${h}h)`,
        booking._id
      );
    } catch (walletError) {
      // Rollback slot and delete booking if wallet debit fails
      await ParkingSlot.findByIdAndUpdate(slotId, { $set: { isOccupied: false, currentBookingId: null } });
      await Booking.findByIdAndDelete(booking._id);
      return res.status(400).json({ message: walletError.message });
    }

    // Save currentBookingId onto slot
    updatedSlot.currentBookingId = booking._id;
    await updatedSlot.save();

    // Update zone available slots
    zone.availableSlots = Math.max(0, zone.availableSlots - 1);
    await zone.save();

    // Broadcast WebSocket update
    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${booking.zoneId}`).emit('BOOKING_CREATED', {
        slotId: booking.slotId, status: 'Confirmed', slot: slot.slotIdentifier
      });
      io.to(`zone:${booking.zoneId}`).emit('SLOT_OCCUPIED', {
        zoneId: booking.zoneId, slotId: booking.slotId, slot: slot.slotIdentifier
      });
      io.to(`user:${req.user._id}`).emit('BOOKING_CONFIRMED', {
        bookingId: booking._id, zone: zone.name, slot: slot.slotIdentifier
      });
      io.to(`provider:${zone.providerId}`).emit('NEW_BOOKING', {
        bookingId: booking._id, zoneId: zone._id, slot: slot.slotIdentifier
      });
    }

    // Save In-App Notification log
    await notificationService.sendNotification(
      req.app,
      req.user._id,
      'Booking Confirmed',
      `Your slot ${slot.slotIdentifier} at ${zone.name} is reserved successfully.`,
      'INFO'
    );

    // Return minimal booking info with QR token and new balance
    const response = {
      ...minimalBooking(booking),
      qrToken: booking.qrToken,
      newBalance: walletResult.wallet.balance
    };
    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get single booking details
// @route   GET /api/v1/bookings/:id
// @access  Private
exports.getBookingDetails = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate({
        path: 'zoneId',
        select: 'name location basePricePerHour address providerId landmark city state',
        populate: {
          path: 'providerId',
          select: 'fullName email phone businessName'
        }
      })
      .populate('slotId', 'slotIdentifier isEV')
      .populate('vehicleId', 'make model licensePlate vehicleType color');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Security: Driver, Admin, or Provider only
    const isDriver = booking.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'ADMIN';
    const isProvider = booking.zoneId?.providerId?._id?.toString() === req.user._id.toString();

    if (!isDriver && !isAdmin && !isProvider) {
      return res.status(403).json({ message: 'Access denied. You are not authorized to view this booking.' });
    }

    // Auto-heal: if qrCodeData is missing (old booking), regenerate it on-the-fly
    if (!booking.qrCodeData && ['Confirmed', 'Active', 'ENTERING', 'PARKED', 'EXITING'].includes(booking.status)) {
      try {
        const qrObj = {
          bookingId: booking._id,
          userId: booking.userId,
          version: booking.qrVersion || 1,
          signature: crypto.createHash('sha256')
            .update(
              booking._id.toString() +
              (booking.slotId?._id || booking.slotId || '').toString() +
              (booking.vehicleId?._id || booking.vehicleId || '').toString()
            )
            .digest('hex')
            .slice(0, 10)
        };
        const encrypted = encryptPayload(qrObj);
        booking.qrCodeData = Buffer.from(encrypted).toString('base64');
        await Booking.findByIdAndUpdate(booking._id, { qrCodeData: booking.qrCodeData });
      } catch (qrErr) {
        console.error('QR auto-heal failed:', qrErr.message);
      }
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Cancel a booking and refund
// @route   POST /api/v1/bookings/:id/cancel
// @access  Private

// @access  Private
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('zoneId').populate('slotId');
    if (!booking || booking.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (!['Pending', 'Confirmed'].includes(booking.status)) {
      return res.status(400).json({ message: 'Cannot cancel this booking' });
    }

    // Free slot
    const slot = await ParkingSlot.findById(booking.slotId._id || booking.slotId);
    if (slot) {
      slot.isOccupied = false;
      slot.currentBookingId = null;
      await slot.save();
    }

    // Update zone
    const zone = await ParkingZone.findById(booking.zoneId._id || booking.zoneId);
    if (zone) {
      zone.availableSlots = Math.min(zone.totalSlots, zone.availableSlots + 1);
      await zone.save();
    }

    // Refund wallet balance and log ledger via wallet service
    let walletResult;
    try {
      walletResult = await walletService.creditBalance(
        req.user._id,
        booking.totalCost,
        'refund',
        `Refund: Cancelled booking at ${zone?.name || 'zone'}`,
        booking._id
      );
    } catch (walletError) {
      return res.status(500).json({ message: 'Refund processing failed', error: walletError.message });
    }

    booking.status = 'Cancelled';
    await booking.save();

    // Trigger Notification
    await notificationService.sendNotification(
      req.app,
      req.user._id,
      'Booking Cancelled',
      `Your booking at ${zone?.name || 'zone'} has been cancelled. Refund of ₹${booking.totalCost} credited.`,
      'CANCELLATION'
    );

    const io = req.app.get('io');
    if (io) {
      const slotIdentifier = slot ? slot.slotIdentifier : '';
      io.to(`zone:${booking.zoneId}`).emit('BOOKING_CANCELLED', {
        zoneId: booking.zoneId,
        slotId: booking.slotId,
        slot: slotIdentifier
      });
      io.to(`zone:${booking.zoneId}`).emit('SLOT_FREED', {
        zoneId: booking.zoneId,
        slotId: booking.slotId,
        slot: slotIdentifier
      });
    }

    res.json({ message: 'Booking cancelled and refunded', newBalance: walletResult.wallet.balance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Extend a booking
// @route   POST /api/v1/bookings/:id/extend
// @access  Private
exports.extendBooking = async (req, res) => {
  try {
    const { hours } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking || booking.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (!['Confirmed', 'Active', 'ENTERING', 'PARKED'].includes(booking.status)) {
      return res.status(400).json({ message: 'Cannot extend an inactive booking' });
    }

    const zone = await ParkingZone.findById(booking.zoneId);
    if (!zone) return res.status(404).json({ message: 'Zone not found' });

    const h = hours || 1;
    const additionalCost = Math.round(zone.basePricePerHour * zone.dynamicPricingMultiplier * h);

    // Deduct additional cost from wallet
    let walletResult;
    try {
      walletResult = await walletService.deductBalance(
        req.user._id,
        additionalCost,
        'booking_payment',
        `Extension at ${zone.name} (${h}h)`,
        booking._id
      );
    } catch (walletError) {
      return res.status(400).json({ message: walletError.message });
    }

    // Update booking duration and cost
    booking.endTime = new Date(booking.endTime.getTime() + h * 60 * 60 * 1000);
    booking.hours += h;
    booking.totalCost += additionalCost;
    await booking.save();

    // Trigger Notification
    await notificationService.sendNotification(
      req.app,
      req.user._id,
      'Booking Extended',
      `Your parking reservation at ${zone.name} is extended by ${h} hour(s).`,
      'EXTENSION_REMINDER'
    );

    // Notify Provider
    await notificationService.sendNotification(
      req.app,
      zone.providerId,
      'Booking Extended',
      `Booking for vehicle ${booking.vehiclePlate} at "${zone.name}" has been extended by ${h} hour(s).`,
      'INFO'
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${booking.zoneId}`).emit('BOOKING_EXTENDED', {
        bookingId: booking._id,
        zoneId: booking.zoneId,
        endTime: booking.endTime
      });
    }

    res.json({ message: 'Booking extended successfully', booking, newBalance: walletResult.wallet.balance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Complete a booking (checkout) — calculates overtime fines
// @route   POST /api/v1/bookings/:id/complete
// @access  Private
exports.completeBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking || booking.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (!['Confirmed', 'Active', 'ENTERING', 'PARKED', 'EXITING', 'Completed'].includes(booking.status)) {
      return res.status(400).json({ message: 'Cannot complete this booking' });
    }
    if (booking.status === 'Completed') {
      return res.json({ message: 'Booking already completed', booking });
    }
    if (['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(booking.status)) {
      return res.status(400).json({ message: 'Active sessions can only be completed by scanning the Exit QR code at the gate.' });
    }

    const now = new Date();
    booking.actualEndTime = now;

    // Free slot
    const slot = await ParkingSlot.findById(booking.slotId);
    if (slot) {
      slot.isOccupied = false;
      slot.currentBookingId = null;
      await slot.save();
    }

    // Update zone
    const zone = await ParkingZone.findById(booking.zoneId);
    if (zone) {
      zone.availableSlots = Math.min(zone.totalSlots, zone.availableSlots + 1);
      await zone.save();

      // Credit provider earnings
      try {
        await walletService.creditBalance(
          zone.providerId,
          booking.totalCost,
          'provider_earning',
          `Earning from booking at ${zone.name}`,
          booking._id
        );
      } catch (walletError) {
        console.error('Crediting provider wallet failed:', walletError.message);
      }
    }

    booking.status = 'Completed';
    await booking.save();

    // Trigger Notification
    await notificationService.sendNotification(
      req.app,
      req.user._id,
      'Parking Completed',
      `You checked out of ${zone?.name || 'parking slot'}. Transaction complete.`,
      'INFO'
    );

    // Notify Provider
    if (zone) {
      await notificationService.sendNotification(
        req.app,
        zone.providerId,
        'Payment Received',
        `Earnings of ₹${booking.totalCost} credited to your wallet for slot ${slot ? slot.slotIdentifier : ''} (${booking.vehiclePlate}).`,
        'PAYMENT'
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${booking.zoneId}`).emit('SLOT_FREED', {
        zoneId: booking.zoneId,
        slotId: booking.slotId,
        slot: slot ? slot.slotIdentifier : ''
      });
    }

    res.json({ message: 'Booking completed', fineAmount: 0, booking });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get alternative compatible slots for early arrival
// @route   GET /api/v1/bookings/:id/alternatives
// @access  Private
exports.getAlternativeSlots = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('slotId');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status !== 'Confirmed') {
      return res.status(400).json({ message: 'Can only switch slots for confirmed pending bookings.' });
    }

    const currentSlot = booking.slotId;

    // Find all alternative slots in same zone
    const query = {
      zoneId: booking.zoneId,
      _id: { $ne: currentSlot._id },
      isOccupied: false,
      isUnderMaintenance: false,
      currentBookingId: null
    };

    // If original slot was EV, match EV capability
    if (currentSlot.isEV) {
      query.isEV = true;
    }

    const alternativeSlots = await ParkingSlot.find(query);

    const mapped = alternativeSlots.map((slot, index) => ({
      slotId: slot._id,
      slotIdentifier: slot.slotIdentifier,
      isEV: slot.isEV,
      distance: `${Math.round(15 + index * 8)}m`,
      estimatedWalkingTime: '1 min',
      priceText: 'Same price category'
    }));

    res.json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Perform a smart slot switch
// @route   POST /api/v1/bookings/:id/switch-slot
// @access  Private
exports.switchBookingSlot = async (req, res) => {
  try {
    const { newSlotId } = req.body;
    if (!newSlotId) {
      return res.status(400).json({ message: 'New slot ID is required' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status !== 'Confirmed') {
      return res.status(400).json({ message: 'Can only switch slots for confirmed bookings.' });
    }

    const oldSlotId = booking.slotId;

    // 1. Fetch target slot and validate status/compatibility
    const targetSlot = await ParkingSlot.findById(newSlotId);
    if (!targetSlot) {
      return res.status(404).json({ message: 'Target slot not found.' });
    }
    if (targetSlot.isOccupied || targetSlot.currentBookingId) {
      return res.status(400).json({ message: 'Target slot is already occupied or reserved.' });
    }
    if (targetSlot.isUnderMaintenance) {
      return res.status(400).json({ message: 'Target slot is under maintenance and cannot be assigned.' });
    }
    if (targetSlot.isActive === false) {
      return res.status(400).json({ message: 'Target slot is offline/inactive.' });
    }
    if (targetSlot.isEmergency) {
      return res.status(400).json({ message: 'Reserved emergency slots cannot be assigned.' });
    }

    // Determine vehicle type for compatibility
    let finalVehicleType = 'Sedan'; // default fallback
    if (booking.vehicleId) {
      const vehicle = await Vehicle.findById(booking.vehicleId);
      if (vehicle) {
        finalVehicleType = vehicle.isEV ? 'EV' : (vehicle.vehicleType === 'Motorcycle' ? 'Bike' : vehicle.vehicleType);
      }
    }
    if (!isCompatible(finalVehicleType, targetSlot.vehicleCategory)) {
      return res.status(400).json({ message: `Target slot is incompatible: Your vehicle type (${finalVehicleType}) cannot park in a "${targetSlot.vehicleCategory}" slot.` });
    }

    // 1. Atomically acquire the new slot
    const newSlot = await ParkingSlot.findOneAndUpdate(
      { _id: newSlotId, isOccupied: false, isUnderMaintenance: false, currentBookingId: null, isActive: true },
      { $set: { isOccupied: true, currentBookingId: booking._id } },
      { new: true }
    );

    if (!newSlot) {
      return res.status(400).json({ message: 'Target slot is no longer available (double reservation checked).' });
    }

    // 2. Atomically release the old slot
    await ParkingSlot.findByIdAndUpdate(oldSlotId, {
      $set: { isOccupied: false, currentBookingId: null }
    });

    // 3. Update booking details
    booking.slotId = newSlot._id;
    booking.qrVersion = (booking.qrVersion || 1) + 1;

    // Regenerate secure QR code payload with updated slot
    const zone = await ParkingZone.findById(booking.zoneId);
    const qrObj = {
      bookingId: booking._id,
      userId: booking.userId,
      version: booking.qrVersion,
      signature: crypto.createHash('sha256')
        .update(booking._id.toString() + newSlot._id.toString() + (booking.vehicleId ? booking.vehicleId.toString() : ''))
        .digest('hex')
        .slice(0, 10),
      zone: zone?.name || 'Smart Parking',
      slot: newSlot.slotIdentifier,
      plate: booking.vehiclePlate,
      validUntil: booking.endTime
    };
    const encrypted = encryptPayload(qrObj);
    booking.qrCodeData = Buffer.from(encrypted).toString('base64');
    await booking.save();

    // 4. Create Audit Log entry
    const AuditLog = require('../models/AuditLog');
    await AuditLog.create({
      userId: req.user._id,
      action: 'SLOT_SWITCH',
      details: `Switched booking #${booking._id.toString().slice(-6)} from slot ID ${oldSlotId} to ${newSlotId}`
    });

    // 5. Broadcast Socket.IO updates
    const io = req.app.get('io');
    if (io) {
      // Free old slot
      io.to(`zone:${booking.zoneId}`).emit('SLOT_FREED', {
        zoneId: booking.zoneId,
        slotId: oldSlotId
      });
      // Occupy new slot
      io.to(`zone:${booking.zoneId}`).emit('SLOT_OCCUPIED', {
        zoneId: booking.zoneId,
        slotId: newSlot._id,
        slot: newSlot.slotIdentifier
      });
    }

    // 6. Notify driver and provider
    await notificationService.sendNotification(
      req.app,
      booking.userId,
      'Slot Switched Successfully',
      `Your reservation has been transferred to slot ${newSlot.slotIdentifier}.`,
      'INFO'
    );

    res.json({
      message: 'Slot switched successfully',
      booking,
      newSlotIdentifier: newSlot.slotIdentifier
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// ---------------------------------------------------
// Entry Scan Endpoint
// ---------------------------------------------------
exports.entryBooking = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'QR token required' });
    const payload = verifyQRToken(token);
    if (!payload) return res.status(400).json({ message: 'Invalid QR token' });
    const booking = await Booking.findById(payload.bookingId)
      .populate('zoneId')
      .populate('slotId')
      .populate('vehicleId');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!['Confirmed', 'Active', 'ENTERING', 'PARKED'].includes(booking.status)) {
      return res.status(400).json({ message: 'Booking is not in a state that permits entry' });
    }
    if (booking.entryStatus === 'Entered') {
      return res.status(400).json({ message: 'Entry already recorded for this booking' });
    }
    booking.entryStatus = 'Entered';
    booking.entryTime = new Date();
    if (['Confirmed', 'ENTERING'].includes(booking.status)) booking.status = 'PARKED';
    await booking.save();
    await AuditLog.create({ userId: req.user._id, action: 'ENTRY_SCAN', details: `Entry recorded for booking ${booking._id}` });
    const io = req.app.get('io');
    if (io) {
      io.to(`provider:${booking.zoneId?.providerId}`).emit('ENTRY_COMPLETED', { bookingId: booking._id });
      io.to(`user:${booking.userId}`).emit('ENTRY_CONFIRMED', { bookingId: booking._id });
    }
    await notificationService.sendNotification(req.app, booking.userId, 'Entry Confirmed', `Your vehicle has entered slot ${booking.slotId?.slotIdentifier}.`, 'INFO');
    res.json({ message: 'Entry recorded', booking });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ---------------------------------------------------
// Exit Scan Endpoint
// ---------------------------------------------------
exports.exitBooking = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'QR token required' });
    const payload = verifyQRToken(token);
    if (!payload) return res.status(400).json({ message: 'Invalid QR token' });
    const booking = await Booking.findById(payload.bookingId)
      .populate('zoneId')
      .populate('slotId')
      .populate('vehicleId');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    
    // Duplicate exit scan check: if completed or already exited, bypass cleanly to allow boom barrier opening
    if (booking.status === 'Completed' || booking.exitStatus === 'Exited') {
      return res.json({
        message: 'Exit already recorded',
        command: 'OPEN_BARRIER',
        displayMessage: 'Exit already approved! Safe journey!',
        autoCloseSeconds: 10,
        booking
      });
    }

    const now = new Date();
    // Stop Timer: Use actual sensor exit time if already captured, otherwise current timestamp
    const exitTime = booking.actualEndTime || now;
    booking.actualEndTime = exitTime;

    // Calculate elapsed stay duration (capped at scheduled duration)
    const elapsedMs = exitTime - booking.startTime;
    const elapsedHours = Math.max(0, elapsedMs / (1000 * 60 * 60));
    const cappedHours = Math.min(booking.hours, elapsedHours);
    const ceiledCappedHours = Math.max(1, Math.ceil(cappedHours));

    const zone = booking.zoneId;
    const slot = booking.slotId;

    // Calculate Base Charge (Standard Pricing: ₹40 1st hour, configured rates after)
    let actualBaseCharge = 40;
    if (zone && ceiledCappedHours > 1) {
      actualBaseCharge = 40 + Math.round((ceiledCappedHours - 1) * zone.basePricePerHour * zone.dynamicPricingMultiplier);
    }

    // Calculate Overstay Fine: Waive 5-minute grace, apply ₹2 per minute overstay penalty thereafter
    let fineAmount = 0;
    const graceMs = 5 * 60 * 1000;
    let delayMinutes = 0;
    let graceUsedMinutes = 0;

    if (exitTime > booking.endTime) {
      delayMinutes = Math.ceil((exitTime - booking.endTime) / 60000);
      graceUsedMinutes = Math.min(5, delayMinutes);
      if (exitTime > new Date(booking.endTime.getTime() + graceMs)) {
        fineAmount = (delayMinutes - 5) * 2;
      }
    }

    booking.fineAmount = fineAmount;

    // Settle wallets: Upfront paid vs. actual base charge + fine
    const upfrontPayment = booking.totalCost;
    const finalCost = actualBaseCharge + fineAmount;
    const settlementDiff = finalCost - upfrontPayment;

    if (settlementDiff > 0) {
      // Driver owes additional fine or base cost
      await walletService.deductBalance(
        booking.userId,
        settlementDiff,
        'fine',
        `Settle late exit: final cost ₹${finalCost} (incl. ₹${fineAmount} fine) - upfront ₹${upfrontPayment}`,
        booking._id
      );
    } else if (settlementDiff < 0) {
      // Driver gets a refund for checking out early
      const refundAmount = Math.abs(settlementDiff);
      await walletService.creditBalance(
        booking.userId,
        refundAmount,
        'refund',
        `Settle early exit refund: final cost ₹${finalCost} - upfront ₹${upfrontPayment}`,
        booking._id
      );
    }

    // Wallet Distribution: Split Late Fine 50/50
    const halfFine = Math.round(fineAmount / 2);
    let providerShare = actualBaseCharge;
    let systemAmount = 0;
    let displacedCustomerAmount = 0;

    if (zone) {
      providerShare += halfFine;
      await walletService.creditBalance(
        zone.providerId,
        providerShare,
        'provider_earning',
        `Provider payout: base charge ₹${actualBaseCharge} + ₹${halfFine} fine share`,
        booking._id
      );
    }

    if (halfFine > 0) {
      if (booking.causedReassignment && booking.reassignedBookingId) {
        const affected = await Booking.findById(booking.reassignedBookingId);
        if (affected) {
          displacedCustomerAmount = halfFine;
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
        } else {
          systemAmount = halfFine;
        }
      } else {
        systemAmount = halfFine;
      }
    }

    if (slot) {
      slot.isOccupied = false;
      slot.currentBookingId = null;
      await slot.save();
    }

    if (zone) {
      zone.availableSlots = Math.min(zone.totalSlots, zone.availableSlots + 1);
      await zone.save();
    }

    booking.exitStatus = 'Exited';
    booking.exitTime = exitTime;
    booking.status = 'Completed';
    // Ensure vehicleStatus is EXITED
    booking.vehicleStatus = 'EXITED';
    // Set totalCost to final actualBaseCharge in DB
    booking.totalCost = actualBaseCharge;
    await booking.save();

    // Create Audit Log
    await AuditLog.create({ 
      userId: req.user._id, 
      action: 'EXIT_SCAN', 
      details: `Exit recorded for booking ${booking._id} via QR token.` 
    });

    // Create BookingAudit log record (never deletes)
    await BookingAudit.create({
      bookingId: booking._id,
      driverId: booking.userId,
      providerId: zone?.providerId || booking.userId,
      entryTime: booking.startTime,
      exitTime: exitTime,
      bookedDurationHours: booking.hours,
      actualDurationMinutes: Math.ceil(elapsedMs / 60000),
      graceUsedMinutes: graceUsedMinutes,
      fineAmount: fineAmount,
      paymentAmount: finalCost,
      walletDistribution: {
        providerAmount: providerShare,
        displacedCustomerAmount: displacedCustomerAmount,
        systemAmount: systemAmount
      },
      exitVerificationMethod: 'QR_EXIT'
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`provider:${zone?.providerId}`).emit('EXIT_COMPLETED', { bookingId: booking._id });
      io.to(`user:${booking.userId}`).emit('EXIT_CONFIRMED', { bookingId: booking._id });
      io.to(`zone:${booking.zoneId}`).emit('SLOT_FREED', {
        zoneId: booking.zoneId,
        slotId: booking.slotId,
        slot: slot?.slotIdentifier || ''
      });
      io.to(`user:${booking.userId}`).emit('VEHICLE_STATUS_UPDATE', {
        bookingId: booking._id,
        vehicleStatus: 'EXITED',
        lastSensorUpdate: now,
        slotIdentifier: slot?.slotIdentifier || '',
        sensorHealth: 'OK'
      });
    }

    await notificationService.sendNotification(
      req.app,
      booking.userId,
      'Exit Completed',
      `Your vehicle has left slot ${slot?.slotIdentifier || ''}. Thank you!`,
      'INFO'
    );

    res.json({ message: 'Exit recorded', booking });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ---------------------------------------------------
// Provider‑specific Bookings
// ---------------------------------------------------
exports.getProviderBookings = async (req, res) => {
  if (req.user.role !== 'PROVIDER') {
    return res.status(403).json({ message: 'Access denied' });
  }
  try {
    // Find all zones belonging to this provider
    const providerZones = await ParkingZone.find({ providerId: req.user._id }).select('_id name');
    const zoneIds = providerZones.map(z => z._id);

    if (zoneIds.length === 0) {
      return res.json([]);
    }

    // Optional query filters
    const filter = { zoneId: { $in: zoneIds } };
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.zoneId) {
      filter.zoneId = req.query.zoneId;
    }

    const bookings = await Booking.find(filter)
      .populate('zoneId', 'name address city hourlyPrice basePricePerHour')
      .populate('slotId', 'slotIdentifier floor vehicleCategory isEV isCovered')
      .populate('vehicleId', 'make model licensePlate vehicleType color isEV')
      .populate('userId', 'fullName email phone')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// NOTE: Existing exports (getUserBookings, getActiveBooking, etc.) remain unchanged.

