const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: function() {
      return !this.isGoogleAccount;
    },
  },
  role: {
    type: String,
    enum: ['DRIVER', 'PROVIDER', 'ADMIN'],
    default: 'DRIVER',
  },
  isPremium: {
    type: Boolean,
    default: false,
  },
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
  },
  score: {
    type: Number,
    default: 500,
  },
  // Refresh Token support
  refreshToken: {
    type: String,
    default: null,
  },
  // Google OAuth support
  googleId: {
    type: String,
    default: null,
  },
  isGoogleAccount: {
    type: Boolean,
    default: false,
  },
  // Account Status
  status: {
    type: String,
    enum: ['ACTIVE', 'BLOCKED', 'PENDING_APPROVAL', 'UNDER_REVIEW', 'REJECTED', 'SUSPENDED'],
    default: 'ACTIVE',
  },
  // Provider Verification Workflow
  verificationStatus: {
    type: String,
    enum: ['Pending', 'Under Review', 'Approved', 'Rejected', 'Suspended'],
    default: 'Pending',
  },
  rejectionReason: {
    type: String,
    default: '',
  },
  adminRemarks: {
    type: String,
    default: '',
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  verificationChecks: {
    identity: { type: String, enum: ['Pending', 'Verified', 'Failed'], default: 'Pending' },
    property: { type: String, enum: ['Pending', 'Verified', 'Failed'], default: 'Pending' },
    bank: { type: String, enum: ['Pending', 'Verified', 'Failed'], default: 'Pending' },
    gps: { type: String, enum: ['Pending', 'Verified', 'Failed'], default: 'Pending' },
  },
  submittedDocuments: {
    type: [String],
    default: [],
  },
  submittedDate: {
    type: Date,
    default: Date.now,
  },
  // Password Reset Token (Hex-based token instead of OTP)
  resetPasswordToken: {
    type: String,
    default: null,
  },
  resetPasswordExpires: {
    type: Date,
    default: null,
  },
  phone: {
    type: String,
    default: '',
  },
  governmentId: {
    type: String,
    default: '',
  },
  bankAccount: {
    type: String,
    default: '',
  },
  upiId: {
    type: String,
    default: '',
  },
  businessType: {
    type: String,
    default: '',
  },
  businessName: {
    type: String,
    default: '',
  },
  gstNumber: {
    type: String,
    default: '',
  },
  propertyProof: {
    type: String,
    default: '',
  },
  termsAccepted: {
    type: Boolean,
    default: false,
  },
  profilePhoto: {
    type: String,
    default: '',
  },
  savedAddresses: [{
    label: { type: String, required: true },
    address: { type: String, required: true }
  }],
  emergencyContact: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' }
  },
  preferredLanguage: {
    type: String,
    default: 'en'
  },
  preferredTheme: {
    type: String,
    default: 'dark'
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingZone'
  }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
