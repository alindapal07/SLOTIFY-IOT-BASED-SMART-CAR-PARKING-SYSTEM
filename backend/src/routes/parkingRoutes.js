const express = require('express');
const router = express.Router();
const { 
  searchParking, createZone, getMyZones, getAllZones, getZoneSlots, 
  toggleFavorite, getFavorites, updateZone, deleteZone, 
  uploadZoneDocuments, createSlot, updateSlot, deleteSlot, getProviderStats,
  enableZone, disableZone, archiveZone, restoreZone, duplicateZone
} = require('../controllers/parkingController');
const { protect } = require('../middleware/authMiddleware');

router.get('/search', searchParking);
router.get('/zones/all', getAllZones);
router.get('/provider/stats', protect, getProviderStats);
router.get('/zones/me', protect, getMyZones);
router.get('/zones/:id/slots', protect, getZoneSlots);
router.post('/zones', protect, createZone);

// Lot Management CRUD
router.put('/zones/:id', protect, updateZone);
router.delete('/zones/:id', protect, deleteZone);
router.put('/zones/:id/documents', protect, uploadZoneDocuments);

// Lot Status & Lifecycle Actions
router.put('/zones/:id/enable', protect, enableZone);
router.put('/zones/:id/disable', protect, disableZone);
router.put('/zones/:id/archive', protect, archiveZone);
router.put('/zones/:id/restore', protect, restoreZone);
router.post('/zones/:id/duplicate', protect, duplicateZone);

// Slot Management CRUD
router.post('/zones/:zoneId/slots', protect, createSlot);
router.put('/slots/:slotId', protect, updateSlot);
router.delete('/slots/:slotId', protect, deleteSlot);

// Favorites Routes
router.post('/favorites/toggle', protect, toggleFavorite);
router.get('/favorites', protect, getFavorites);

module.exports = router;
