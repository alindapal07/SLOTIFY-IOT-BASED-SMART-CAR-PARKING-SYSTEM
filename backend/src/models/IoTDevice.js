const mongoose = require('mongoose');

const iotDeviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true
  },
  deviceTokenHash: {
    type: String,
    required: true
  },
  apiKeyHash: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingZone',
    default: null
  },
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSlot',
    default: null
  },
  status: {
    type: String,
    enum: ['Online', 'Offline', 'Disconnected', 'Connecting', 'Disabled', 'Maintenance', 'Error'],
    default: 'Offline'
  },
  sensorType: {
    type: String,
    default: 'IR Sensor'
  },
  healthStatus: {
    type: String,
    enum: ['Healthy', 'Faulty', 'Maintenance', 'Unknown'],
    default: 'Healthy'
  },
  battery: {
    type: Number,
    default: null
  },
  signalStrength: {
    type: Number,
    default: null
  },
  firmwareVersion: {
    type: String,
    default: '1.0.0'
  },
  lastHeartbeat: {
    type: Date,
    default: null
  },
  lastIp: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('IoTDevice', iotDeviceSchema);
