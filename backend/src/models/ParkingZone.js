const mongoose = require('mongoose');

const parkingZoneSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    default: ''
  },
  landmark: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: ''
  },
  state: {
    type: String,
    default: ''
  },
  pinCode: {
    type: String,
    default: ''
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true // [longitude, latitude]
    }
  },
  parkingType: {
    type: String,
    enum: ['Public', 'Private', 'Mall', 'Railway', 'Airport', 'Hospital', 'Office', 'Residential', 'Street', 'Stadium', 'University', 'Metro', 'Market', 'Highway'],
    default: 'Public'
  },
  basePricePerHour: {
    type: Number,
    default: 40
  },
  dailyRate: {
    type: Number,
    default: 0
  },
  monthlyRate: {
    type: Number,
    default: 0
  },
  dynamicPricingMultiplier: {
    type: Number,
    default: 1.0
  },
  totalSlots: {
    type: Number,
    required: true
  },
  availableSlots: {
    type: Number,
    required: true
  },
  bikeSlots: { type: Number, default: 0 },
  carSlots: { type: Number, default: 0 },
  busSlots: { type: Number, default: 0 },
  truckSlots: { type: Number, default: 0 },
  vehicleTypesAllowed: {
    type: [String],
    default: ['Car', 'SUV', 'EV', 'Motorcycle']
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['Active', 'Closed', 'Maintenance', 'Coming Soon'],
    default: 'Active'
  },
  rating: {
    type: Number,
    default: 4.0
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  amenities: {
    type: [String],
    default: ['CCTV', 'Covered']
  },
  propertyType: {
    type: String,
    enum: ['Public', 'Private', 'Residential', 'Commercial', 'Mall', 'Office', 'Hospital', 'School', 'Hotel', 'Apartment', 'Others'],
    default: 'Public'
  },
  isCovered: { type: Boolean, default: false },
  hasEVCharging: { type: Boolean, default: false },
  hasDisabledParking: { type: Boolean, default: false },
  hasCCTV: { type: Boolean, default: true },
  hasSecurity: { type: Boolean, default: false },
  hasLighting: { type: Boolean, default: true },
  hasSecurityGuard: { type: Boolean, default: false },
  hasWashroom: { type: Boolean, default: false },
  hasWheelchairAccess: { type: Boolean, default: false },
  hasNightParking: { type: Boolean, default: true },
  dimensions: { type: String, default: '' },
  heightRestriction: {
    type: Number,
    default: 0 // meters, 0 means no restriction
  },
  operatingHours: {
    type: String,
    default: '24/7'
  },
  openTime: { type: String, default: '00:00' },
  closeTime: { type: String, default: '23:59' },
  contact: {
    type: String,
    default: ''
  },
  images: {
    type: [String],
    default: []
  },
  imageEntrance: { type: String, default: '' },
  imageExit: { type: String, default: '' },
  imageOverall: { type: String, default: '' },
  imageSlots: { type: String, default: '' },
  imageEVCharging: { type: String, default: '' },
  imageSecurity: { type: String, default: '' },
  imageVerification: { type: String, default: '' },
  totalArea: { type: Number, default: 0 },
  floorsCount: { type: Number, default: 1 },
  entryGatesCount: { type: Number, default: 1 },
  exitGatesCount: { type: Number, default: 1 },
  hourlyPrice: { type: Number, default: 40 },
  dailyPrice: { type: Number, default: 300 },
  nightPrice: { type: Number, default: 50 },
  weekendPrice: { type: Number, default: 60 },
  festivalPrice: { type: Number, default: 80 },
  peakHourPrice: { type: Number, default: 70 },
  extensionCharges: { type: Number, default: 50 },
  penaltyRules: { type: String, default: '₹2 per minute' },
  popularity: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  verificationStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  documents: [{
    docType: String,
    fileUrl: String
  }],
  rules: {
    type: [String],
    default: []
  },
  description: {
    type: String,
    default: ''
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  sedanSlots: {
    type: Number,
    default: 0
  },
  suvSlots: {
    type: Number,
    default: 0
  },
  evSlots: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

parkingZoneSchema.index({ location: '2dsphere' });
parkingZoneSchema.index({ isApproved: 1, availableSlots: 1 });
parkingZoneSchema.index({ city: 1, parkingType: 1 });
parkingZoneSchema.index({ status: 1 });

module.exports = mongoose.model('ParkingZone', parkingZoneSchema);
