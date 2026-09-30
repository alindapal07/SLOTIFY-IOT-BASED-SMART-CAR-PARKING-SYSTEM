const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingZone',
    required: true
  },
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSlot',
    required: true
  },
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null
  },
  vehiclePlate: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Active', 'Completed', 'Cancelled', 'Expired', 'ENTERING', 'PARKED', 'EXITING'],
    default: 'Pending'
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  actualEndTime: {
    type: Date,
    default: null
  },
  totalCost: {
    type: Number,
    required: true
  },
  fineAmount: {
    type: Number,
    default: 0
  },
  qrCodeData: {
    type: String,
    default: null
  },
  qrToken: {
    type: String,
    default: null
  },
  qrGeneratedAt: {
    type: Date,
    default: null
  },
  entryStatus: {
    type: String,
    enum: ['NotEntered', 'Entered'],
    default: 'NotEntered'
  },
  entryTime: {
    type: Date,
    default: null
  },
  exitStatus: {
    type: String,
    enum: ['NotExited', 'Exited'],
    default: 'NotExited'
  },
  exitTime: {
    type: Date,
    default: null
  },
  lastScanTime: {
    type: Date,
    default: null
  },
  scanCount: {
    type: Number,
    default: 0
  },
  hours: {
    type: Number,
    default: 1
  },
  qrUsed: {
    type: Boolean,
    default: false
  },
  qrVersion: {
    type: Number,
    default: 1
  },
  scanLogs: [{
    action: String,
    gateId: String,
    timestamp: Date,
    status: String,
    failureReason: String,
    ipAddress: String,
    gpsCoordinates: [Number]
  }],
  causedReassignment: {
    type: Boolean,
    default: false
  },
  reassignedBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  isEmergencyUpgraded: {
    type: Boolean,
    default: false
  },
  originalSlotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSlot',
    default: null
  },
  lateExitNotified: {
    type: Boolean,
    default: false
  },

  // ─────────────────────────────────────────
  // PHASE 17 — VEHICLE PRESENCE ENGINE FIELDS
  // ─────────────────────────────────────────

  // IR Sensor-driven vehicle presence state machine
  // WAITING_FOR_ENTRY: QR scanned, waiting for IR confirmation
  // PARKED:            IR sensor confirmed vehicle is present
  // MISSING:           IR sensor reports vehicle is gone (theft alert candidate)
  // EXITED:            Exit QR scanned — normal checkout
  vehicleStatus: {
    type: String,
    enum: ['WAITING_FOR_ENTRY', 'PARKED', 'MISSING', 'EXITING', 'EXITED'],
    default: null  // null = presence engine not yet active (pre-QR-scan)
  },

  // Arrival deadline: driver must arrive within this window after booking confirmation
  // Set to bookingStartTime + 30 minutes by default
  arrivalDeadline: {
    type: Date,
    default: null
  },

  // Last time an IR sensor update was received for this booking's slot
  lastSensorUpdate: {
    type: Date,
    default: null
  },

  // Sensor hardware health at last update
  sensorHealth: {
    type: String,
    default: null
  },

  // Theft detection: true once a MISSING alert has been sent to avoid repeated notifications
  theftAlertSent: {
    type: Boolean,
    default: false
  },

  // No-show processing: true once the booking has been cancelled/expired for no-show
  noShowProcessed: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ zoneId: 1, status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
