const mongoose = require('mongoose');

const waitingQueueSchema = new mongoose.Schema({
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
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  vehicleType: {
    type: String,
    enum: ['Bike', 'Scooter', 'Hatchback', 'Sedan', 'SUV', 'Luxury Car', 'EV', 'Mini Truck', 'Truck', 'Bus', 'Handicap'],
    required: true
  },
  priority: {
    type: Number,
    default: 0 // Higher is higher priority
  },
  status: {
    type: String,
    enum: ['Joined', 'Offered', 'Accepted', 'Declined', 'Timeout', 'Cancelled'],
    default: 'Joined'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  offeredSlotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSlot',
    default: null
  },
  offeredAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },
  isHandicap: {
    type: Boolean,
    default: false
  },
  isEV: {
    type: Boolean,
    default: false
  },
  isEmergency: {
    type: Boolean,
    default: false
  },
  isAdminOverride: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Ensure unique active queue per user-zone combination
waitingQueueSchema.index({ userId: 1, zoneId: 1, status: 1 });

module.exports = mongoose.model('WaitingQueue', waitingQueueSchema);
