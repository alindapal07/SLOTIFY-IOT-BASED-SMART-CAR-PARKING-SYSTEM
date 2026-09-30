const mongoose = require('mongoose');

const iotConfigurationSchema = new mongoose.Schema({
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  iotMode: {
    type: Boolean,
    default: false
  },
  communicationType: {
    type: String,
    enum: ['HTTP', 'MQTT', 'WebSocket'],
    default: 'HTTP'
  },
  mqttSettings: {
    brokerUrl: { type: String, default: '' },
    port: { type: Number, default: 1883 },
    username: { type: String, default: '' },
    password: { type: String, default: '' },
    topic: { type: String, default: '' },
    qos: { type: Number, default: 0 },
    tls: { type: Boolean, default: false },
    reconnectInterval: { type: Number, default: 5 },
    heartbeatInterval: { type: Number, default: 30 },
    autoConnect: { type: Boolean, default: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('IoTConfiguration', iotConfigurationSchema);
