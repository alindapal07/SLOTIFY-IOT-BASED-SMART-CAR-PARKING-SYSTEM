const express = require('express');
const router = express.Router();
const {
  initiateBooking,
  cancelBooking,
  extendBooking,
  completeBooking,
  getUserBookings,
  getActiveBooking,
  getAlternativeSlots,
  switchBookingSlot,
  getBookingDetails,
  entryBooking,
  exitBooking,
  getProviderBookings
} = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');

router.get('/my', protect, getUserBookings);
router.get('/active', protect, getActiveBooking);
router.post('/initiate', protect, initiateBooking);
router.get('/:id/alternatives', protect, getAlternativeSlots);
router.post('/:id/switch-slot', protect, switchBookingSlot);
router.post('/:id/extend', protect, extendBooking);
router.post('/:id/cancel', protect, cancelBooking);
router.post('/:id/complete', protect, completeBooking);
// Entry and Exit scanning
router.post('/entry', protect, entryBooking);
router.post('/exit', protect, exitBooking);

// Provider-specific bookings list
router.get('/provider', protect, getProviderBookings);


router.get('/:id', protect, getBookingDetails);
module.exports = router;
