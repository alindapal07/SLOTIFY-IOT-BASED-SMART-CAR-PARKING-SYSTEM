const mongoose = require('mongoose');

const parkingSlotSchema = new mongoose.Schema({
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingZone',
    required: true
  },
  slotIdentifier: {
    type: String,
    required: true
  },
  isOccupied: {
    type: Boolean,
    default: false
  },
  isEV: {
    type: Boolean,
    default: false
  },
  currentBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  isUnderMaintenance: {
    type: Boolean,
    default: false
  },
  isReserved: {
    type: Boolean,
    default: false
  },
  isEmergency: {
    type: Boolean,
    default: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  vehicleCategory: {
    type: String,
    enum: ['Bike', 'Scooter', 'Sedan', 'Hatchback', 'SUV', 'Luxury Car', 'EV', 'Mini Truck', 'Truck', 'Bus', 'Handicap'],
    default: 'Sedan'
  },
  floor: {
    type: String,
    default: 'Ground'
  },
  dimensions: {
    type: String,
    default: '5m x 2.5m'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isCovered: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

parkingSlotSchema.index({ zoneId: 1, isOccupied: 1 });
parkingSlotSchema.index({ zoneId: 1, vehicleCategory: 1, isOccupied: 1 });

module.exports = mongoose.model('ParkingSlot', parkingSlotSchema);
