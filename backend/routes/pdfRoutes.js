/**
 * pdfRoutes.js — PDF Generation & Download API
 * Routes are mounted at /api/v1/pdf
 *
 * GET  /api/v1/pdf/booking/:bookingId          → Booking Receipt
 * GET  /api/v1/pdf/refund/:transactionId        → Refund Receipt
 * GET  /api/v1/pdf/fine/:transactionId          → Fine/Penalty Receipt
 * GET  /api/v1/pdf/wallet/:transactionId        → Wallet Transaction
 * GET  /api/v1/pdf/settlement/:providerId       → Provider Settlement
 * GET  /api/v1/pdf/admin/report                 → Admin Daily/Monthly Report
 * GET  /api/v1/pdf/admin/analytics              → Admin Analytics Report
 * POST /api/v1/pdf/incident                     → Emergency Incident Report
 * GET  /api/v1/pdf/history                      → User's PDF Download History
 */

const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  generateBookingReceipt,
  generateRefundReceipt,
  generateFineReceipt,
  generateWalletReceipt,
  generateProviderSettlement,
  generateAdminReport,
  generateAnalyticsReport,
  generateIncidentReport,
} = require('../utils/pdfEngine');

const Booking     = require('../models/Booking');
const Transaction = require('../models/Transaction');
const User        = require('../models/User');
const ParkingZone = require('../models/ParkingZone');
const ParkingSlot = require('../models/ParkingSlot');
const AuditLog    = require('../models/AuditLog');

// Helper — send PDF buffer as download
function sendPDF(res, buffer, filename) {
  res.set({
    'Content-Type':        'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}.pdf"`,
    'Content-Length':      buffer.length,
    'Cache-Control':       'no-store',
  });
  res.end(buffer);
}

// Helper — send PDF buffer as inline (for print)
function sendPDFInline(res, buffer, filename) {
  res.set({
    'Content-Type':        'application/pdf',
    'Content-Disposition': `inline; filename="${filename}.pdf"`,
    'Content-Length':      buffer.length,
  });
  res.end(buffer);
}

// ─── 1. BOOKING RECEIPT ───────────────────────────────────────────────────────
router.get('/booking/:bookingId', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .populate('userId',   'fullName email phone')
      .populate('zoneId',   'name address city basePricePerHour')
      .populate('slotId',   'slotIdentifier slotNumber')
      .populate('vehicleId','make model licensePlate vehicleType isEV');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Authorization: driver sees own bookings, admin/provider sees all
    const isOwner  = booking.userId?._id?.toString() === req.user._id.toString();
    const isStaff  = ['ADMIN', 'PROVIDER'].includes(req.user.role);
    if (!isOwner && !isStaff) return res.status(403).json({ message: 'Access denied' });

    // Fetch provider details for the zone
    const zone = await ParkingZone.findById(booking.zoneId).populate('providerId', 'fullName businessName email gstNumber');
    if (zone) booking.zoneId.provider = zone.providerId;

    const buffer = await generateBookingReceipt(booking);
    const inline = req.query.view === '1';

    // Audit
    await AuditLog.create({ userId: req.user._id, action: 'PDF_BOOKING_RECEIPT', details: `Booking ${booking._id}` }).catch(() => {});

    const filename = `SmartPark_Receipt_${booking._id.toString().slice(-8).toUpperCase()}`;
    inline ? sendPDFInline(res, buffer, filename) : sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF] booking receipt error:', err);
    res.status(500).json({ message: 'PDF generation failed', error: err.message });
  }
});

// ─── 2. REFUND RECEIPT ────────────────────────────────────────────────────────
router.get('/refund/:transactionId', protect, async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.transactionId)
      .populate('userId', 'fullName email phone');

    if (!txn) return res.status(404).json({ message: 'Transaction not found' });
    if (txn.userId?._id?.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Access denied' });

    let booking = null;
    if (txn.relatedBookingId) {
      booking = await Booking.findById(txn.relatedBookingId)
        .populate('zoneId', 'name').populate('slotId', 'slotIdentifier');
    }

    const buffer   = await generateRefundReceipt(txn, booking);
    const filename = `SmartPark_Refund_${txn._id.toString().slice(-8).toUpperCase()}`;
    req.query.view === '1' ? sendPDFInline(res, buffer, filename) : sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF] refund receipt error:', err);
    res.status(500).json({ message: 'PDF generation failed', error: err.message });
  }
});

// ─── 3. FINE RECEIPT ──────────────────────────────────────────────────────────
router.get('/fine/:transactionId', protect, async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.transactionId)
      .populate('userId', 'fullName email phone');

    if (!txn) return res.status(404).json({ message: 'Transaction not found' });
    if (txn.userId?._id?.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Access denied' });

    let booking = null;
    if (txn.relatedBookingId) {
      booking = await Booking.findById(txn.relatedBookingId)
        .populate('zoneId', 'name').populate('slotId', 'slotIdentifier');
    }

    const buffer   = await generateFineReceipt(txn, booking);
    const filename = `SmartPark_Fine_${txn._id.toString().slice(-8).toUpperCase()}`;
    req.query.view === '1' ? sendPDFInline(res, buffer, filename) : sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF] fine receipt error:', err);
    res.status(500).json({ message: 'PDF generation failed', error: err.message });
  }
});

// ─── 4. WALLET TRANSACTION RECEIPT ───────────────────────────────────────────
router.get('/wallet/:transactionId', protect, async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.transactionId)
      .populate('userId', 'fullName email');

    if (!txn) return res.status(404).json({ message: 'Transaction not found' });
    if (txn.userId?._id?.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Access denied' });

    const buffer   = await generateWalletReceipt(txn);
    const filename = `SmartPark_Wallet_${txn._id.toString().slice(-8).toUpperCase()}`;
    req.query.view === '1' ? sendPDFInline(res, buffer, filename) : sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF] wallet receipt error:', err);
    res.status(500).json({ message: 'PDF generation failed', error: err.message });
  }
});

// ─── 5. PROVIDER SETTLEMENT ───────────────────────────────────────────────────
router.get('/settlement/:providerId', protect, async (req, res) => {
  try {
    // Only provider themselves or admin
    if (req.params.providerId !== req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Access denied' });

    const provider = await User.findById(req.params.providerId)
      .select('fullName email businessName gstNumber bankAccount upiId phone');
    if (!provider) return res.status(404).json({ message: 'Provider not found' });

    const zones = await ParkingZone.find({ providerId: req.params.providerId });
    const zoneIds = zones.map(z => z._id);

    // Period from query (default: current month)
    const { from, to } = req.query;
    const startDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate   = to   ? new Date(to)   : new Date();

    const bookings = await Booking.find({
      zoneId: { $in: zoneIds },
      status: 'Completed',
      createdAt: { $gte: startDate, $lte: endDate },
    });

    // Aggregate per zone
    const settlements = zones.map(zone => {
      const zoneBookings = bookings.filter(b => b.zoneId.toString() === zone._id.toString());
      const gross = zoneBookings.reduce((s, b) => s + (b.totalCost || 0), 0);
      return {
        zoneName:     zone.name,
        bookingCount: zoneBookings.length,
        gross,
        platformFee:  gross * 0.15,
      };
    }).filter(s => s.bookingCount > 0);

    const period = `${startDate.toLocaleDateString('en-IN')} – ${endDate.toLocaleDateString('en-IN')}`;
    const buffer   = await generateProviderSettlement({ provider, settlements, period });
    const filename = `SmartPark_Settlement_${provider._id.toString().slice(-8).toUpperCase()}`;
    req.query.view === '1' ? sendPDFInline(res, buffer, filename) : sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF] settlement error:', err);
    res.status(500).json({ message: 'PDF generation failed', error: err.message });
  }
});

// ─── 6. ADMIN DAILY / MONTHLY REPORT ─────────────────────────────────────────
router.get('/admin/report', protect, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Admin only' });

    const { type = 'Daily', from, to } = req.query;
    const startDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const endDate   = to   ? new Date(to)   : new Date();

    const [allBookings, allZones, allUsers] = await Promise.all([
      Booking.find({ createdAt: { $gte: startDate, $lte: endDate } })
              .populate('zoneId', 'name')
              .populate('userId', 'fullName score status'),
      ParkingZone.find({}),
      User.find({ role: 'DRIVER' }).select('fullName score status createdAt'),
    ]);

    const completedBookings = allBookings.filter(b => b.status === 'Completed');
    const totalRevenue      = completedBookings.reduce((s, b) => s + (b.totalCost || 0), 0);

    // Zone breakdown
    const zoneMap = {};
    completedBookings.forEach(b => {
      const zid = b.zoneId?._id?.toString() || b.zoneId?.toString();
      if (!zid) return;
      if (!zoneMap[zid]) zoneMap[zid] = { name: b.zoneId?.name || 'Unknown', bookings: 0, revenue: 0 };
      zoneMap[zid].bookings++;
      zoneMap[zid].revenue += b.totalCost || 0;
    });
    const zoneStats = Object.values(zoneMap).sort((a, b) => b.revenue - a.revenue).slice(0, 20);

    // Top drivers
    const driverMap = {};
    completedBookings.forEach(b => {
      const uid = b.userId?._id?.toString();
      if (!uid) return;
      if (!driverMap[uid]) driverMap[uid] = { fullName: b.userId?.fullName, score: b.userId?.score, status: b.userId?.status, bookings: 0, spend: 0 };
      driverMap[uid].bookings++;
      driverMap[uid].spend += b.totalCost || 0;
    });
    const topDrivers = Object.values(driverMap).sort((a, b) => b.spend - a.spend).slice(0, 10);

    const metrics = {
      totalBookings: allBookings.length,
      totalRevenue,
      avgOccupancy: allZones.length > 0
        ? allZones.reduce((s, z) => s + (z.totalSlots > 0 ? ((z.totalSlots - z.availableSlots) / z.totalSlots) * 100 : 0), 0) / allZones.length
        : 0,
      activeUsers: allUsers.filter(u => u.status === 'ACTIVE').length,
    };

    const period = `${startDate.toLocaleDateString('en-IN')} – ${endDate.toLocaleDateString('en-IN')}`;
    const buffer   = await generateAdminReport({ period, type, metrics, zones: zoneStats, topDrivers });
    const filename = `SmartPark_${type}Report_${Date.now()}`;
    req.query.view === '1' ? sendPDFInline(res, buffer, filename) : sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF] admin report error:', err);
    res.status(500).json({ message: 'PDF generation failed', error: err.message });
  }
});

// ─── 7. ADMIN ANALYTICS REPORT ────────────────────────────────────────────────
router.get('/admin/analytics', protect, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Admin only' });

    const { from, to } = req.query;
    const startDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const endDate   = to   ? new Date(to)   : new Date();

    const bookings = await Booking.find({
      status: 'Completed',
      createdAt: { $gte: startDate, $lte: endDate },
    }).populate('vehicleId', 'vehicleType isEV');

    // Daily revenue trend
    const dayMap = {};
    bookings.forEach(b => {
      const day = new Date(b.createdAt).toISOString().slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { date: day, bookings: 0, revenue: 0 };
      dayMap[day].bookings++;
      dayMap[day].revenue += b.totalCost || 0;
    });
    const revenue = Object.values(dayMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, avgSpend: d.bookings > 0 ? d.revenue / d.bookings : 0 }));

    // Vehicle breakdown
    const vMap = {};
    bookings.forEach(b => {
      const vtype = b.vehicleId?.isEV ? 'EV' : (b.vehicleId?.vehicleType || 'Unknown');
      if (!vMap[vtype]) vMap[vtype] = { type: vtype, bookings: 0, revenue: 0, totalHours: 0 };
      vMap[vtype].bookings++;
      vMap[vtype].revenue    += b.totalCost || 0;
      vMap[vtype].totalHours += b.hours || 1;
    });
    const vehicleBreakdown = Object.values(vMap).map(v => ({
      ...v,
      avgHours: v.bookings > 0 ? (v.totalHours / v.bookings).toFixed(1) + 'h' : '—',
    }));

    const period = `${startDate.toLocaleDateString('en-IN')} – ${endDate.toLocaleDateString('en-IN')}`;
    const buffer   = await generateAnalyticsReport({ period, revenue, vehicleBreakdown });
    const filename = `SmartPark_Analytics_${Date.now()}`;
    req.query.view === '1' ? sendPDFInline(res, buffer, filename) : sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF] analytics report error:', err);
    res.status(500).json({ message: 'PDF generation failed', error: err.message });
  }
});

// ─── 8. INCIDENT REPORT ───────────────────────────────────────────────────────
router.post('/incident', protect, async (req, res) => {
  try {
    if (!['ADMIN', 'PROVIDER'].includes(req.user.role))
      return res.status(403).json({ message: 'Access denied' });

    const { incident, bookingId, driverId, zoneId } = req.body;
    if (!incident) return res.status(400).json({ message: 'Incident data required' });

    const [booking, driver, zone] = await Promise.all([
      bookingId ? Booking.findById(bookingId).populate('slotId', 'slotIdentifier') : Promise.resolve(null),
      driverId  ? User.findById(driverId).select('fullName email phone') : Promise.resolve(null),
      zoneId    ? ParkingZone.findById(zoneId).select('name address') : Promise.resolve(null),
    ]);

    const buffer   = await generateIncidentReport({ incident, booking, driver, zone });
    const filename = `SmartPark_Incident_${Date.now()}`;
    req.query.view === '1' ? sendPDFInline(res, buffer, filename) : sendPDF(res, buffer, filename);
  } catch (err) {
    console.error('[PDF] incident report error:', err);
    res.status(500).json({ message: 'PDF generation failed', error: err.message });
  }
});

// ─── 9. PDF DOWNLOAD HISTORY ──────────────────────────────────────────────────
// (Returns the user's recent bookings & transactions with download links)
router.get('/history', protect, async (req, res) => {
  try {
    const [bookings, transactions] = await Promise.all([
      Booking.find({ userId: req.user._id })
              .populate('zoneId', 'name')
              .populate('slotId', 'slotIdentifier')
              .sort({ createdAt: -1 }).limit(20),
      Transaction.find({ userId: req.user._id })
                  .sort({ createdAt: -1 }).limit(30),
    ]);

    const history = [
      ...bookings.map(b => ({
        id:       b._id,
        type:     'Booking Receipt',
        label:    `${b.zoneId?.name || 'Parking'} — Slot ${b.slotId?.slotIdentifier || 'N/A'}`,
        date:     b.createdAt,
        status:   b.status,
        amount:   b.totalCost,
        url:      `/api/v1/pdf/booking/${b._id}`,
        viewUrl:  `/api/v1/pdf/booking/${b._id}?view=1`,
      })),
      ...transactions.map(t => {
        const typeMap = {
          refund:          { type: 'Refund Receipt',     url: `/api/v1/pdf/refund/${t._id}` },
          fine:            { type: 'Fine Receipt',       url: `/api/v1/pdf/fine/${t._id}` },
          booking_payment: { type: 'Wallet Transaction', url: `/api/v1/pdf/wallet/${t._id}` },
          topup:           { type: 'Wallet Transaction', url: `/api/v1/pdf/wallet/${t._id}` },
        };
        const info = typeMap[t.category] || { type: 'Wallet Transaction', url: `/api/v1/pdf/wallet/${t._id}` };
        return {
          id:      t._id,
          type:    info.type,
          label:   t.description,
          date:    t.createdAt,
          status:  t.type === 'credit' ? 'Credit' : 'Debit',
          amount:  t.amount,
          url:     info.url,
          viewUrl: info.url + '?view=1',
        };
      }),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(history);
  } catch (err) {
    console.error('[PDF] history error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
