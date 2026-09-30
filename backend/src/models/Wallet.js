const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  ownerType: {
    type: String,
    enum: ['User', 'Provider'],
    required: true,
  },
  balance: {
    type: Number,
    default: 10000, // Demo balance of 10000 INR
  },
  currency: {
    type: String,
    default: 'INR'
  }
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);
