const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');
const { protect } = require('../middleware/authMiddleware');

// Get all vehicles for user
router.get('/', protect, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ userId: req.user._id });
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add new vehicle
router.post('/', protect, async (req, res) => {
  try {
    let { make, model, licensePlate, vehicleType, isEV, color } = req.body;

    // Normalise: treat any blank/null/undefined plate as no plate
    if (!licensePlate || (typeof licensePlate === 'string' && licensePlate.trim() === '')) {
      licensePlate = undefined;
    } else {
      licensePlate = licensePlate.trim().toUpperCase();
    }

    // Only check for duplicate if an actual plate was provided
    if (licensePlate) {
      const existing = await Vehicle.findOne({
        licensePlate: { $regex: new RegExp(`^${licensePlate.replace(/[-\s]/g, '[- ]?')}$`, 'i') }
      });
      if (existing) {
        return res.status(409).json({ message: `License plate '${licensePlate}' is already registered to another vehicle.` });
      }
    }

    const vehicle = await Vehicle.create({
      userId: req.user._id,
      make,
      model,
      licensePlate,
      vehicleType,
      isEV,
      color
    });
    res.status(201).json(vehicle);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This license plate is already registered. Please use a different plate or leave the field empty.' });
    }
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Delete vehicle
router.delete('/:id', protect, async (req, res) => {
  try {
    await Vehicle.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ message: 'Vehicle removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
