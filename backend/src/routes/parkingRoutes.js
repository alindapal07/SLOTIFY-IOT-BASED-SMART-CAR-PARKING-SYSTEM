const express = require('express');
const router = express.Router();
const { 
  searchParking, createZone, getMyZones, getAllZones, getZoneSlots, 
  toggleFavorite, getFavorites, updateZone, deleteZone, 
  uploadZoneDocuments, createSlot, updateSlot, deleteSlot, getProviderStats,
  enableZone, disableZone, archiveZone, restoreZone, duplicateZone
} = require('../controllers/parkingController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public & Driver discovery routes
router.get('/search', searchParking);
router.get('/zones/all', getAllZones);
router.get('/zones/:id/slots', protect, getZoneSlots);

// Provider analytics & zone listings
router.get('/provider/stats', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), getProviderStats);
router.get('/zones/me', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), getMyZones);
router.post('/zones', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), createZone);

// Lot Management CRUD (Provider/Admin only)
router.put('/zones/:id', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), updateZone);
router.delete('/zones/:id', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), deleteZone);
router.put('/zones/:id/documents', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), uploadZoneDocuments);

// Lot Status & Lifecycle Actions
router.put('/zones/:id/enable', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), enableZone);
router.put('/zones/:id/disable', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), disableZone);
router.put('/zones/:id/archive', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), archiveZone);
router.put('/zones/:id/restore', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), restoreZone);
router.post('/zones/:id/duplicate', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), duplicateZone);

// Slot Management CRUD
router.post('/zones/:zoneId/slots', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), createSlot);
router.put('/slots/:slotId', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), updateSlot);
router.delete('/slots/:slotId', protect, authorize('PROVIDER', 'ADMIN', 'SUPER_ADMIN'), deleteSlot);

// Favorites Routes (Drivers / all authenticated users)
router.post('/favorites/toggle', protect, toggleFavorite);
router.get('/favorites', protect, getFavorites);

module.exports = router;
