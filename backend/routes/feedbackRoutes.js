const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const { protect } = require('../middleware/authMiddleware');

// @desc    Submit feedback for a booking
// @route   POST /api/v1/feedback
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { bookingId, zoneId, rating, comments } = req.body;
    
    // In a real scenario, we would trigger an NLP model here to get sentiment
    const sentimentLabel = rating >= 4 ? 'Positive' : (rating <= 2 ? 'Negative' : 'Neutral');

    const feedback = await Feedback.create({
      bookingId,
      userId: req.user._id,
      zoneId,
      rating,
      comments,
      sentimentLabel
    });

    // Notify Provider
    const ParkingZone = require('../models/ParkingZone');
    const zone = await ParkingZone.findById(zoneId);
    if (zone) {
      const notificationService = require('../services/notificationService');
      await notificationService.sendNotification(
        req.app,
        zone.providerId,
        'Review Added',
        `A driver left a ${rating}-star review for your lot "${zone.name}": "${comments || ''}"`,
        'INFO'
      );
    }

    res.status(201).json(feedback);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get feedback for a specific zone
// @route   GET /api/v1/feedback/zone/:zoneId
// @access  Public
router.get('/zone/:zoneId', async (req, res) => {
    try {
      const feedbacks = await Feedback.find({ zoneId: req.params.zoneId }).populate('userId', 'fullName');
      res.json(feedbacks);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
});

// @desc    Update own feedback
// @route   PUT /api/v1/feedback/:id
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { rating, comments } = req.body;
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ message: 'Review not found' });

    if (feedback.userId.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Unauthorized review modification' });
    }

    if (rating !== undefined) {
      feedback.rating = rating;
      feedback.sentimentLabel = rating >= 4 ? 'Positive' : (rating <= 2 ? 'Negative' : 'Neutral');
    }
    if (comments !== undefined) feedback.comments = comments;

    await feedback.save();
    res.json(feedback);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Delete own feedback
// @route   DELETE /api/v1/feedback/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ message: 'Review not found' });

    if (feedback.userId.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN') {
      return res.status(401).json({ message: 'Unauthorized review deletion' });
    }

    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
