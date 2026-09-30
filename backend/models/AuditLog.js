const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true, // Admin who performed the action
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // The provider/user the action was performed on
  },
  action: {
    type: String,
    required: true, // e.g. PROVIDER_APPROVED, PROVIDER_REJECTED, PROVIDER_SUSPENDED
  },
  previousStatus: {
    type: String,
    default: '',
  },
  newStatus: {
    type: String,
    default: '',
  },
  details: {
    type: String,
    default: '',
  },
  remarks: {
    type: String,
    default: '',
  },
  ipAddress: {
    type: String,
    default: '',
  }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
