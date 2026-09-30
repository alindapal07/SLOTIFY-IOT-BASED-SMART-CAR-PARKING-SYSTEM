const mongoose = require('mongoose');

const deviceLogSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['connection', 'disconnection', 'heartbeat', 'slot_update', 'test_connection', 'http_error', 'auth_failure', 'restart', 'enable', 'disable'],
    required: true
  },
  payload: {
    type: Object,
    default: {}
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    required: true
  },
  error: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('DeviceLog', deviceLogSchema);
