const mongoose = require('mongoose');

const bookingAuditSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  entryTime: {
    type: Date,
    required: true
  },
  exitTime: {
    type: Date,
    required: true
  },
  bookedDurationHours: {
    type: Number,
    required: true
  },
  actualDurationMinutes: {
    type: Number,
    required: true
  },
  graceUsedMinutes: {
    type: Number,
    default: 0
  },
  fineAmount: {
    type: Number,
    default: 0
  },
  paymentAmount: {
    type: Number,
    required: true
  },
  walletDistribution: {
    providerAmount: {
      type: Number,
      required: true
    },
    displacedCustomerAmount: {
      type: Number,
      default: 0
    },
    systemAmount: {
      type: Number,
      default: 0
    }
  },
  exitVerificationMethod: {
    type: String,
    enum: ['QR_EXIT', 'SENSOR_AUTO_EXIT', 'ADMIN_OVERRIDE'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('BookingAudit', bookingAuditSchema);
