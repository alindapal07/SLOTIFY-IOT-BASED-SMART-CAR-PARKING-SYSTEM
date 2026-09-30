const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  make: {
    type: String,
    required: true
  },
  model: {
    type: String,
    required: true
  },
  licensePlate: {
    type: String,
    required: false,
    default: undefined
  },
  vehicleType: {
    type: String,
    enum: ['Car', 'SUV', 'EV', 'Motorcycle', 'Truck', 'Bike', 'Scooter', 'Hatchback', 'Sedan', 'Luxury Car', 'Mini Truck', 'Bus', 'Handicap'],
    default: 'Car'
  },
  isEV: {
    type: Boolean,
    default: false
  },
  color: {
    type: String,
    default: ''
  }
}, { timestamps: true });

vehicleSchema.pre('save', function(next) {
  if (this.licensePlate === null || this.licensePlate === '') {
    this.licensePlate = undefined;
  }
  next();
});

vehicleSchema.index({ userId: 1 });
vehicleSchema.index({ licensePlate: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);
