const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
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
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  comments: String,
  sentimentLabel: {
    type: String, // Output from NLP model (e.g. "Positive", "Negative")
    default: 'Neutral'
  }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
