const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ParkingZone = require('../models/ParkingZone');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const { protect, authorize } = require('../middleware/authMiddleware');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

// Helper: get client IP
const getIp = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';

// ════════════════════════════════════════════════════════════════════
// PLATFORM STATS
// ════════════════════════════════════════════════════════════════════

// @desc    Get platform stats
// @route   GET /api/v1/admin/stats
router.get('/stats', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const [totalUsers, totalProviders, totalZones, totalBookings, pendingZones, pendingProviders, underReviewProviders, suspendedProviders] = await Promise.all([
      User.countDocuments({ role: 'DRIVER' }),
      User.countDocuments({ role: 'PROVIDER', status: 'ACTIVE' }),
      ParkingZone.countDocuments(),
      Booking.countDocuments(),
      ParkingZone.countDocuments({ isApproved: false }),
      User.countDocuments({ role: 'PROVIDER', status: 'PENDING_APPROVAL' }),
      User.countDocuments({ role: 'PROVIDER', status: 'UNDER_REVIEW' }),
      User.countDocuments({ role: 'PROVIDER', status: 'SUSPENDED' })
    ]);

    const recentBookings = await Booking.find()
      .populate('userId', 'fullName email')
      .populate('zoneId', 'name')
      .sort({ createdAt: -1 }).limit(10);

    const totalRevenue = await Transaction.aggregate([
      { $match: { category: 'booking_payment' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      totalUsers, totalProviders, totalZones, totalBookings, pendingZones,
      pendingProviders, underReviewProviders, suspendedProviders,
      totalRevenue: totalRevenue[0]?.total || 0,
      recentBookings
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ════════════════════════════════════════════════════════════════════

// @desc    List all users
// @route   GET /api/v1/admin/users
router.get('/users', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find()
        .select('-password -mPin -resetPasswordToken -refreshToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments()
    ]);

    res.setHeader('X-Total-Count', total);
    res.setHeader('X-Page', page);
    res.setHeader('X-Limit', limit);
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Update user role
// @route   PUT /api/v1/admin/users/:id/role
router.put('/users/:id/role', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['DRIVER', 'PROVIDER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    
    await AuditLog.create({
      userId: req.user._id,
      targetId: user._id,
      action: 'ROLE_CHANGED',
      newStatus: role,
      details: `Updated role of ${user.email} to ${role}`,
      ipAddress: getIp(req)
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Suspend or activate user status
// @route   PUT /api/v1/admin/users/:id/status
router.put('/users/:id/status', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'BLOCKED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select('-password');
    
    await AuditLog.create({
      userId: req.user._id,
      targetId: user._id,
      action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
      previousStatus: status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE',
      newStatus: status,
      details: `Updated account status of ${user.email} to ${status}`,
      ipAddress: getIp(req)
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Delete user account
// @route   DELETE /api/v1/admin/users/:id
router.delete('/users/:id', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    await AuditLog.create({
      userId: req.user._id,
      targetId: req.params.id,
      action: 'USER_DELETED',
      details: `Deleted user account: ${user?.email || req.params.id}`,
      ipAddress: getIp(req)
    });

    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// PROVIDER VERIFICATION WORKFLOW
// ════════════════════════════════════════════════════════════════════

// @desc    Get all providers with optional status filter
// @route   GET /api/v1/admin/providers/pending
router.get('/providers/pending', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const providers = await User.find({
      role: 'PROVIDER',
      status: { $in: ['PENDING_APPROVAL', 'UNDER_REVIEW'] }
    })
      .select('-password -mPin -resetPasswordToken -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.json(providers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Get ALL providers (all statuses)
// @route   GET /api/v1/admin/providers
router.get('/providers', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const filter = { role: 'PROVIDER' };
    if (status && status !== 'ALL') {
      filter.status = status;
    }
    const [providers, total] = await Promise.all([
      User.find(filter)
        .select('-password -mPin -resetPasswordToken -refreshToken')
        .populate('reviewedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.setHeader('X-Total-Count', total);
    res.setHeader('X-Page', page);
    res.setHeader('X-Limit', limit);
    res.json(providers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Get single provider's full details
// @route   GET /api/v1/admin/providers/:id
router.get('/providers/:id', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const provider = await User.findById(req.params.id)
      .select('-password -mPin -resetPasswordToken')
      .populate('reviewedBy', 'fullName email');

    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    // Fetch zones owned by this provider
    const zones = await ParkingZone.find({ providerId: provider._id });

    // Fetch audit history for this provider
    const auditHistory = await AuditLog.find({ targetId: provider._id })
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ provider, zones, auditHistory });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Approve a provider registration
// @route   PATCH /api/v1/admin/providers/:id/approve
router.patch('/providers/:id/approve', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const provider = await User.findById(req.params.id);

    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const previousStatus = provider.status;

    provider.status = 'ACTIVE';
    provider.verificationStatus = 'Approved';
    provider.reviewedAt = new Date();
    provider.reviewedBy = req.user._id;
    provider.adminRemarks = remarks || '';
    provider.rejectionReason = '';
    provider.verificationChecks = {
      identity: 'Verified',
      property: 'Verified',
      bank: 'Verified',
      gps: 'Verified'
    };
    await provider.save();

    // Create audit log
    await AuditLog.create({
      userId: req.user._id,
      targetId: provider._id,
      action: 'PROVIDER_APPROVED',
      previousStatus,
      newStatus: 'ACTIVE',
      details: `Approved provider registration: ${provider.email} (${provider.businessName})`,
      remarks: remarks || '',
      ipAddress: getIp(req)
    });

    // Send notification to provider
    await notificationService.sendNotification(
      req.app,
      provider._id,
      'Registration Approved! 🎉',
      `Congratulations! Your provider account "${provider.businessName}" has been verified and activated. You can now add parking lots and start earning.`,
      'SUCCESS'
    );

    // Send email to provider
    await emailService.sendProviderStatusEmail(
      provider.email,
      provider.fullName,
      'ACTIVE',
      '',
      remarks || ''
    );

    // Emit real-time status change via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${provider._id}`).emit('PROVIDER_STATUS_CHANGED', {
        status: 'ACTIVE',
        verificationStatus: 'Approved',
        message: 'Your account has been approved!'
      });
    }

    res.json({ message: 'Provider approved and activated', provider });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Legacy POST route for backward compatibility
router.post('/providers/:id/approve', protect, authorize('ADMIN'), async (req, res) => {
  req.method = 'PATCH';
  return router.handle(req, res);
});

// @desc    Reject a provider registration
// @route   PATCH /api/v1/admin/providers/:id/reject
router.patch('/providers/:id/reject', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { reason, remarks } = req.body;
    const provider = await User.findById(req.params.id);

    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const previousStatus = provider.status;

    provider.status = 'REJECTED';
    provider.verificationStatus = 'Rejected';
    provider.rejectionReason = reason || 'Documents did not meet verification requirements.';
    provider.reviewedAt = new Date();
    provider.reviewedBy = req.user._id;
    provider.adminRemarks = remarks || '';
    await provider.save();

    await AuditLog.create({
      userId: req.user._id,
      targetId: provider._id,
      action: 'PROVIDER_REJECTED',
      previousStatus,
      newStatus: 'REJECTED',
      details: `Rejected provider registration: ${provider.email} (${provider.businessName}). Reason: ${provider.rejectionReason}`,
      remarks: remarks || '',
      ipAddress: getIp(req)
    });

    await notificationService.sendNotification(
      req.app,
      provider._id,
      'Registration Rejected',
      `Your provider registration for "${provider.businessName}" was not approved. Reason: ${provider.rejectionReason}. Please contact support for assistance.`,
      'PENALTY'
    );

    // Send email to provider
    await emailService.sendProviderStatusEmail(
      provider.email,
      provider.fullName,
      'REJECTED',
      provider.rejectionReason,
      remarks || ''
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${provider._id}`).emit('PROVIDER_STATUS_CHANGED', {
        status: 'REJECTED',
        verificationStatus: 'Rejected',
        rejectionReason: provider.rejectionReason,
        message: 'Your registration has been rejected.'
      });
    }

    res.json({ message: 'Provider registration rejected', provider });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Legacy POST route for backward compatibility
router.post('/providers/:id/reject', protect, authorize('ADMIN'), async (req, res) => {
  req.method = 'PATCH';
  return router.handle(req, res);
});

// @desc    Suspend a provider account
// @route   PATCH /api/v1/admin/providers/:id/suspend
router.patch('/providers/:id/suspend', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { reason, remarks } = req.body;
    const provider = await User.findById(req.params.id);

    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const previousStatus = provider.status;

    provider.status = 'SUSPENDED';
    provider.verificationStatus = 'Suspended';
    provider.rejectionReason = reason || 'Account suspended by administrator.';
    provider.reviewedAt = new Date();
    provider.reviewedBy = req.user._id;
    provider.adminRemarks = remarks || '';
    await provider.save();

    await AuditLog.create({
      userId: req.user._id,
      targetId: provider._id,
      action: 'PROVIDER_SUSPENDED',
      previousStatus,
      newStatus: 'SUSPENDED',
      details: `Suspended provider account: ${provider.email} (${provider.businessName}). Reason: ${provider.rejectionReason}`,
      remarks: remarks || '',
      ipAddress: getIp(req)
    });

    await notificationService.sendNotification(
      req.app,
      provider._id,
      'Account Suspended',
      `Your provider account "${provider.businessName}" has been suspended. Reason: ${provider.rejectionReason}. Contact support for appeals.`,
      'PENALTY'
    );

    // Send email to provider
    await emailService.sendProviderStatusEmail(
      provider.email,
      provider.fullName,
      'SUSPENDED',
      provider.rejectionReason,
      remarks || ''
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${provider._id}`).emit('PROVIDER_STATUS_CHANGED', {
        status: 'SUSPENDED',
        verificationStatus: 'Suspended',
        rejectionReason: provider.rejectionReason,
        message: 'Your account has been suspended.'
      });
    }

    res.json({ message: 'Provider account suspended', provider });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Reactivate a suspended/rejected provider
// @route   PATCH /api/v1/admin/providers/:id/reactivate
router.patch('/providers/:id/reactivate', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const provider = await User.findById(req.params.id);

    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const previousStatus = provider.status;

    provider.status = 'ACTIVE';
    provider.verificationStatus = 'Approved';
    provider.rejectionReason = '';
    provider.reviewedAt = new Date();
    provider.reviewedBy = req.user._id;
    provider.adminRemarks = remarks || '';
    provider.verificationChecks = {
      identity: 'Verified',
      property: 'Verified',
      bank: 'Verified',
      gps: 'Verified'
    };
    await provider.save();

    await AuditLog.create({
      userId: req.user._id,
      targetId: provider._id,
      action: 'PROVIDER_REACTIVATED',
      previousStatus,
      newStatus: 'ACTIVE',
      details: `Reactivated provider account: ${provider.email} (${provider.businessName})`,
      remarks: remarks || '',
      ipAddress: getIp(req)
    });

    await notificationService.sendNotification(
      req.app,
      provider._id,
      'Account Reactivated! 🎉',
      `Great news! Your provider account "${provider.businessName}" has been reactivated. You can resume operations immediately.`,
      'SUCCESS'
    );

    // Send email to provider
    await emailService.sendProviderStatusEmail(
      provider.email,
      provider.fullName,
      'ACTIVE',
      '',
      remarks || ''
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${provider._id}`).emit('PROVIDER_STATUS_CHANGED', {
        status: 'ACTIVE',
        verificationStatus: 'Approved',
        message: 'Your account has been reactivated!'
      });
    }

    res.json({ message: 'Provider account reactivated', provider });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Mark a provider as Under Review
// @route   PATCH /api/v1/admin/providers/:id/review
router.patch('/providers/:id/review', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const provider = await User.findById(req.params.id);

    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const previousStatus = provider.status;

    provider.status = 'UNDER_REVIEW';
    provider.verificationStatus = 'Under Review';
    provider.reviewedBy = req.user._id;
    provider.adminRemarks = remarks || 'Verification in progress.';
    await provider.save();

    await AuditLog.create({
      userId: req.user._id,
      targetId: provider._id,
      action: 'PROVIDER_UNDER_REVIEW',
      previousStatus,
      newStatus: 'UNDER_REVIEW',
      details: `Started review for provider: ${provider.email} (${provider.businessName})`,
      remarks: remarks || '',
      ipAddress: getIp(req)
    });

    await notificationService.sendNotification(
      req.app,
      provider._id,
      'Verification Started',
      `Your registration is now being reviewed by our team. We will update you within 24-48 hours.`,
      'INFO'
    );

    // Send email to provider
    await emailService.sendProviderStatusEmail(
      provider.email,
      provider.fullName,
      'UNDER_REVIEW',
      '',
      remarks || ''
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${provider._id}`).emit('PROVIDER_STATUS_CHANGED', {
        status: 'UNDER_REVIEW',
        verificationStatus: 'Under Review',
        message: 'Your documents are being reviewed.'
      });
    }

    res.json({ message: 'Provider marked as under review', provider });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Update provider verification checks (identity, property, bank, gps)
// @route   PATCH /api/v1/admin/providers/:id/checks
router.patch('/providers/:id/checks', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { identity, property, bank, gps } = req.body;
    const provider = await User.findById(req.params.id);

    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    if (identity) provider.verificationChecks.identity = identity;
    if (property) provider.verificationChecks.property = property;
    if (bank) provider.verificationChecks.bank = bank;
    if (gps) provider.verificationChecks.gps = gps;

    await provider.save();

    res.json({ message: 'Verification checks updated successfully', provider });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Request additional documents from a provider
// @route   PATCH /api/v1/admin/providers/:id/request-docs
router.patch('/providers/:id/request-docs', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { remarks } = req.body;
    if (!remarks) {
      return res.status(400).json({ message: 'Remarks are required to request additional documents.' });
    }
    const provider = await User.findById(req.params.id);

    if (!provider || provider.role !== 'PROVIDER') {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const previousStatus = provider.status;

    provider.adminRemarks = remarks;
    provider.rejectionReason = ''; // Clear previous rejection reasons
    await provider.save();

    await AuditLog.create({
      userId: req.user._id,
      targetId: provider._id,
      action: 'PROVIDER_DOCS_REQUESTED',
      previousStatus,
      newStatus: provider.status,
      details: `Requested additional documents from provider: ${provider.email} (${provider.businessName}). Remarks: ${remarks}`,
      remarks: remarks,
      ipAddress: getIp(req)
    });

    await notificationService.sendNotification(
      req.app,
      provider._id,
      'Additional Documents Requested',
      `Our verification team has requested additional documents: ${remarks}. Please update your details or upload the documents.`,
      'INFO'
    );

    await emailService.sendDocsRequestedEmail(
      provider.email,
      provider.fullName,
      remarks
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${provider._id}`).emit('PROVIDER_STATUS_CHANGED', {
        status: provider.status,
        verificationStatus: provider.verificationStatus,
        adminRemarks: remarks,
        message: 'Additional documents requested.'
      });
    }

    res.json({ message: 'Additional documents requested successfully', provider });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// ZONE MANAGEMENT
// ════════════════════════════════════════════════════════════════════

// @desc    Get pending zones for approval
// @route   GET /api/v1/admin/zones/pending
router.get('/zones/pending', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const zones = await ParkingZone.find({ isApproved: false })
      .populate('providerId', 'fullName email')
      .sort({ createdAt: -1 });
    res.json(zones);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Get all zones
// @route   GET /api/v1/admin/zones
router.get('/zones', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const zones = await ParkingZone.find()
      .populate('providerId', 'fullName email')
      .sort({ createdAt: -1 });
    res.json(zones);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Approve a zone
// @route   POST /api/v1/admin/zones/:id/approve
router.post('/zones/:id/approve', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const zone = await ParkingZone.findByIdAndUpdate(req.params.id, { 
      isApproved: true, 
      verificationStatus: 'Approved' 
    }, { new: true });

    await AuditLog.create({
      userId: req.user._id,
      action: 'ZONE_APPROVED',
      details: `Approved lot verification request: ${zone.name}`,
      ipAddress: getIp(req)
    });

    res.json({ message: 'Zone approved', zone });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Reject a zone verification
// @route   POST /api/v1/admin/zones/:id/reject
router.post('/zones/:id/reject', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const zone = await ParkingZone.findByIdAndUpdate(req.params.id, { 
      isApproved: false, 
      verificationStatus: 'Rejected' 
    }, { new: true });

    await AuditLog.create({
      userId: req.user._id,
      action: 'ZONE_REJECTED',
      details: `Rejected lot verification request: ${zone.name}`,
      ipAddress: getIp(req)
    });

    res.json({ message: 'Zone rejected', zone });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Delete a zone entirely
// @route   DELETE /api/v1/admin/zones/:id
router.delete('/zones/:id', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const zone = await ParkingZone.findByIdAndDelete(req.params.id);
    
    await AuditLog.create({
      userId: req.user._id,
      action: 'ZONE_DELETED',
      details: `Deleted parking lot: ${zone?.name || req.params.id}`,
      ipAddress: getIp(req)
    });

    res.json({ message: 'Zone deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Update zone pricing dynamically
// @route   PUT /api/v1/admin/zones/:id/pricing
router.put('/zones/:id/pricing', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { basePricePerHour, dynamicPricingMultiplier } = req.body;
    const zone = await ParkingZone.findByIdAndUpdate(req.params.id, {
      ...(basePricePerHour && { basePricePerHour }),
      ...(dynamicPricingMultiplier && { dynamicPricingMultiplier })
    }, { new: true });
    
    await AuditLog.create({
      userId: req.user._id,
      action: 'ZONE_PRICING_UPDATED',
      details: `Adjusted rates for ${zone.name} to ₹${zone.basePricePerHour}/hr x${zone.dynamicPricingMultiplier}`,
      ipAddress: getIp(req)
    });

    res.json(zone);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// BOOKINGS & AUDIT LOGS
// ════════════════════════════════════════════════════════════════════

// @desc    Get all bookings
// @route   GET /api/v1/admin/bookings
router.get('/bookings', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('userId', 'fullName email')
      .populate('zoneId', 'name')
      .populate('slotId', 'slotIdentifier')
      .sort({ createdAt: -1 }).limit(50);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Get all system audit logs
// @route   GET /api/v1/admin/audit-logs
router.get('/audit-logs', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .populate('userId', 'fullName email')
      .populate('targetId', 'fullName email businessName')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// ADMIN IoT DEVICE MANAGEMENT ENDPOINTS
// ════════════════════════════════════════════════════════════════════
const IoTDevice = require('../models/IoTDevice');
const DeviceLog = require('../models/DeviceLog');
const ParkingSlot = require('../models/ParkingSlot');
const crypto = require('crypto');

// Helper to hash tokens
const hashSHA256 = (str) => crypto.createHash('sha256').update(str).digest('hex');

// @desc    Get all IoT devices in the platform
// @route   GET /api/v1/admin/iot/devices
router.get('/iot/devices', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const devices = await IoTDevice.find()
      .populate('zoneId', 'name location')
      .populate('slotId', 'slotIdentifier isOccupied')
      .populate('providerId', 'fullName email')
      .sort({ createdAt: -1 });
    res.json(devices);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Register a new IoT device directly
// @route   POST /api/v1/admin/iot/register-device
router.post('/iot/register-device', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { name, zoneId, slotId, firmwareVersion, providerId } = req.body;

    if (!providerId) {
      return res.status(400).json({ message: 'providerId is required' });
    }

    const deviceId = `DEV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const deviceToken = crypto.randomBytes(24).toString('hex');
    const apiKey = crypto.randomBytes(16).toString('hex');

    const deviceTokenHash = hashSHA256(deviceToken);
    const apiKeyHash = hashSHA256(apiKey);

    const device = await IoTDevice.create({
      deviceId,
      deviceTokenHash,
      apiKeyHash,
      name: name || `Device-${deviceId}`,
      providerId,
      zoneId: zoneId || null,
      slotId: slotId || null,
      firmwareVersion: firmwareVersion || '1.0.0',
      status: 'Offline',
      isActive: true
    });

    // Create Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: 'IOT_DEVICE_CREATED',
      details: `Registered IoT Device ${device.deviceId} (${device.name})`,
      ipAddress: getIp(req)
    });

    // Create Device Log
    await DeviceLog.create({
      deviceId: device.deviceId,
      type: 'connection',
      payload: { action: 'REGISTERED_BY_ADMIN' },
      status: 'SUCCESS',
      ipAddress: getIp(req)
    });

    res.status(201).json({
      message: 'Device registered successfully',
      deviceId: device.deviceId,
      deviceToken, // raw token - displayed only once
      apiKey,      // raw API key
      name: device.name
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// @desc    Toggle device active status
// @route   PUT /api/v1/admin/iot/devices/:deviceId/toggle
router.put('/iot/devices/:deviceId/toggle', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await IoTDevice.findOne({ deviceId });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    device.isActive = !device.isActive;
    device.status = device.isActive ? 'Offline' : 'Disabled';
    await device.save();

    // Log in DeviceLog and AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: device.isActive ? 'IOT_DEVICE_ENABLED' : 'IOT_DEVICE_DISABLED',
      details: `${device.isActive ? 'Enabled' : 'Disabled'} IoT Device ${device.deviceId}`,
      ipAddress: getIp(req)
    });

    await DeviceLog.create({
      deviceId: device.deviceId,
      type: device.isActive ? 'enable' : 'disable',
      payload: { action: 'TOGGLED_BY_ADMIN', isActive: device.isActive },
      status: 'SUCCESS',
      ipAddress: getIp(req)
    });

    // Broadcast WebSocket updates
    const io = req.app.get('io');
    if (io) {
      // Broadcast configuration change to the device itself
      io.to(`device:${device.deviceId}`).emit('CONFIG_UPDATE', { isActive: device.isActive });
      // Notify admin/provider dashboards of status update
      io.emit('ADMIN_DEVICE_UPDATED', device);
    }

    res.json(device);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Sync device configuration
// @route   POST /api/v1/admin/iot/devices/:deviceId/sync
router.post('/iot/devices/:deviceId/sync', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await IoTDevice.findOne({ deviceId }).populate('slotId');

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Update status to Connecting temporarily
    if (device.isActive) {
      device.status = 'Connecting';
      await device.save();
    }

    // Log the sync event
    await DeviceLog.create({
      deviceId: device.deviceId,
      type: 'test_connection',
      payload: { action: 'SYNC_REQUESTED' },
      status: 'SUCCESS',
      ipAddress: getIp(req)
    });

    // Broadcast WebSocket sync event to device
    const io = req.app.get('io');
    if (io) {
      io.to(`device:${device.deviceId}`).emit('SYNC_DEVICE', {
        isActive: device.isActive,
        firmwareVersion: device.firmwareVersion,
        slotId: device.slotId?._id,
        slotIdentifier: device.slotId?.slotIdentifier
      });
      io.emit('ADMIN_DEVICE_UPDATED', device);
    }

    res.json({ message: 'Sync command dispatched to device', device });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Restart device (future-ready)
// @route   POST /api/v1/admin/iot/devices/:deviceId/restart
router.post('/iot/devices/:deviceId/restart', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await IoTDevice.findOne({ deviceId });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    await DeviceLog.create({
      deviceId: device.deviceId,
      type: 'restart',
      payload: { action: 'RESTART_REQUESTED' },
      status: 'SUCCESS',
      ipAddress: getIp(req)
    });

    // Broadcast WebSocket restart event
    const io = req.app.get('io');
    if (io) {
      io.to(`device:${device.deviceId}`).emit('RESTART_DEVICE', { deviceId });
    }

    res.json({ message: 'Restart command dispatched to device' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Delete a device
// @route   DELETE /api/v1/admin/iot/devices/:deviceId
router.delete('/iot/devices/:deviceId', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await IoTDevice.findOneAndDelete({ deviceId });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    await AuditLog.create({
      userId: req.user._id,
      action: 'IOT_DEVICE_DELETED',
      details: `Deleted IoT Device ${deviceId} (${device.name})`,
      ipAddress: getIp(req)
    });

    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Get all device logs
// @route   GET /api/v1/admin/iot/logs
router.get('/iot/logs', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const logs = await DeviceLog.find().sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Get all providers (for device registration dropdown mapping)
// @route   GET /api/v1/admin/iot/providers
router.get('/iot/providers', protect, authorize('ADMIN'), async (req, res) => {
  try {
    const providers = await User.find({ role: 'PROVIDER' }).select('_id fullName email businessName');
    res.json(providers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
