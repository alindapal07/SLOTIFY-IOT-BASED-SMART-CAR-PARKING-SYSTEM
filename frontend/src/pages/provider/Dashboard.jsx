import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../i18n/index.jsx';
import {
  Layers, Activity, Car, Banknote, Plus, X, Loader2, MapPin,
  CheckCircle, Clock, AlertTriangle, Settings, Trash2, Edit2,
  FileText, Star, Bell, Wifi, WifiOff,
  BarChart2, TrendingUp, RefreshCw,
  Lock, Unlock, Wrench, Search,
  Navigation, Upload, Building2, Mail,
  CreditCard, AlertCircle, CheckCircle2,
  Timer, Battery, Signal, Grid, Cpu, QrCode,
  Archive, Copy
} from 'lucide-react';
import api from '../../services/api';
import { socket } from '../../services/socket';
import IoTSettings from './IoTSettings';
import IoTDeviceManagement from './IoTDeviceManagement';
import GateSimulator from './GateSimulator';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

// Helper to center the map dynamically
const ChangeMapCenter = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
};

// Premium map pin icon for parking lot entrance selection
const providerMapPinIcon = L.divIcon({
  className: 'provider-map-pin',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#e11d48;border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.3);">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32]
});

// ─── Constants ─────────────────────────────────────────────────────────────────
const VEHICLE_CATEGORIES = ['Bike', 'Scooter', 'Hatchback', 'Sedan', 'SUV', 'Luxury Car', 'EV', 'Mini Truck', 'Truck', 'Bus', 'Handicap'];
const PARKING_TYPES = ['Public', 'Private', 'Commercial', 'Residential'];
const SLOT_STATUS_COLOR = {
  Available: 'bg-emerald-500',
  Occupied: 'bg-red-500',
  Reserved: 'bg-blue-500',
  Maintenance: 'bg-amber-500',
  Offline: 'bg-gray-400',
  Blocked: 'bg-purple-500'
};

// ─── Helper: get slot status label ──────────────────────────────────────────────
const getSlotStatus = (slot) => {
  if (!slot.isActive) return 'Offline';
  if (slot.isBlocked) return 'Blocked';
  if (slot.isUnderMaintenance) return 'Maintenance';
  if (slot.isOccupied) return 'Occupied';
  if (slot.isReserved) return 'Reserved';
  return 'Available';
};

// ─── Empty Zone Form ────────────────────────────────────────────────────────────
const emptyZoneForm = () => ({
  name: '', parkingType: 'Public', address: '', landmark: '', city: '', state: '', pinCode: '',
  lat: '28.5355', lng: '77.3910', totalSlots: 0,
  // Per-category slot counts (generates named slots like B001, S001, SUV001, EV001)
  bikeSlots: 0, sedanSlots: 0, suvSlots: 0, evSlots: 0,
  totalArea: '', floorsCount: 1, entryGatesCount: 1, exitGatesCount: 1,
  basePricePerHour: 40, hourlyPrice: 40, dailyPrice: 300, nightPrice: 50,
  weekendPrice: 60, festivalPrice: 80, peakHourPrice: 70,
  extensionCharges: 50, penaltyRules: '₹2 per minute',
  operatingHours: '24/7', description: '', rules: '',
  amenities: [],
  imageEntrance: '', imageExit: '', imageOverall: '', imageSlots: '', imageEVCharging: '', imageSecurity: ''
});

// ─── Empty Slot Form ────────────────────────────────────────────────────────────
const emptySlotForm = () => ({
  slotIdentifier: '', vehicleCategory: 'Sedan', dimensions: '5m x 2.5m',
  floor: 'Ground', isEV: false, isReserved: false, isEmergency: false,
  isCovered: false, isBlocked: false, isActive: true, isUnderMaintenance: false
});

// ─── Amenity Toggle list ────────────────────────────────────────────────────────
const AMENITIES = ['CCTV', 'Security', 'Covered', 'EV Charging', 'Washroom', 'Disabled Access', 'Overnight Parking', 'Height Restrictions', 'Valet'];

// ──────────────────────────────────────────────────────────────────────────────────
const ProviderDashboard = () => {
  const { user, login } = useStore();
  const { t } = useI18n();

  // ─── Navigation ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('overview');

  // ─── Core Data ───────────────────────────────────────────────────────────────
  const [zones, setZones] = useState([]);
  const [archivedZones, setArchivedZones] = useState([]);
  const [lotsView, setLotsView] = useState('active'); // 'active' | 'archived'
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [bookingTab, setBookingTab] = useState('active');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState({ text: '', type: 'success' });

  // ─── Zone Form State ──────────────────────────────────────────────────────────
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [zoneFormMode, setZoneFormMode] = useState('create'); // 'create' | 'edit'
  const [zoneForm, setZoneForm] = useState(emptyZoneForm());
  const [zoneFormStep, setZoneFormStep] = useState(1); // 1 = location, 2 = details, 3 = pricing
  const [creatingZone, setCreatingZone] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationSearching, setLocationSearching] = useState(false);
  const [zoneFormError, setZoneFormError] = useState('');

  // ─── Slot Manager ─────────────────────────────────────────────────────────────
  const [selectedZone, setSelectedZone] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotForm, setSlotForm] = useState(emptySlotForm());
  const [editingSlot, setEditingSlot] = useState(null);
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [slotError, setSlotError] = useState('');
  const [slotSearch, setSlotSearch] = useState('');

  // ─── Document upload ──────────────────────────────────────────────────────────
  const [verifyingZone, setVerifyingZone] = useState(null);
  const [showDocForm, setShowDocForm] = useState(false);
  const [docType, setDocType] = useState('Parking Ownership Proof');
  const [docUrl, setDocUrl] = useState('');
  const [docSaving, setDocSaving] = useState(false);

  // ─── WebSocket ────────────────────────────────────────────────────────────────
  const socketRef = useRef(null);
  const joinedZonesRef = useRef(new Set());

  // ─── Provider account status — fetched LIVE from backend ──────────────────────
  const [providerStatus, setProviderStatus] = useState(user?.status || 'PENDING_APPROVAL');
  const [verificationData, setVerificationData] = useState({
    verificationStatus: 'Pending',
    rejectionReason: '',
    adminRemarks: '',
    reviewedAt: null,
    verificationChecks: { identity: 'Pending', property: 'Pending', bank: 'Pending', gps: 'Pending' }
  });
  const [statusLoading, setStatusLoading] = useState(true);

  // Fetch live verification status from backend
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me/status');
      setProviderStatus(data.status);
      setVerificationData({
        verificationStatus: data.verificationStatus || 'Pending',
        rejectionReason: data.rejectionReason || '',
        adminRemarks: data.adminRemarks || '',
        reviewedAt: data.reviewedAt,
        verificationChecks: data.verificationChecks || { identity: 'Pending', property: 'Pending', bank: 'Pending', gps: 'Pending' }
      });
      // Sync zustand store if status changed
      if (data.status !== user?.status) {
        login({ ...user, status: data.status, verificationStatus: data.verificationStatus });
      }
    } catch (err) {
      console.error('Failed to fetch provider status:', err);
      // Fallback to user object from store
      setProviderStatus(user?.status || 'PENDING_APPROVAL');
    } finally {
      setStatusLoading(false);
    }
  }, [user, login]);

  // ─── Flash message helper ─────────────────────────────────────────────────────
  const flash = useCallback((text, type = 'success') => {
    setActionMsg({ text, type });
    setTimeout(() => setActionMsg({ text: '', type: 'success' }), 4000);
  }, []);

  // ─── Load all data ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const [zonesRes, archivedRes, statsRes, bookingsRes, notifRes] = await Promise.all([
        api.get('/parking/zones/me'),
        api.get('/parking/zones/me?archived=true').catch(() => ({ data: [] })),
        api.get('/parking/provider/stats').catch(() => ({ data: null })),
        api.get('/bookings/provider').catch(() => ({ data: [] })),
        api.get('/notifications').catch(() => ({ data: [] }))
      ]);
      setZones(zonesRes.data || []);
      setArchivedZones(archivedRes.data || []);
      setStats(statsRes.data || null);
      setBookings(bookingsRes.data || []);
      setNotifications(notifRes.data || []);
    } catch (err) {
      console.error('Provider dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch status on mount
  useEffect(() => { fetchStatus(); loadAll(); }, [fetchStatus, loadAll]);

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ─── WebSocket subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
    socketRef.current = socket;

    const joinRooms = () => {
      // Join user-specific room for status updates
      if (user?._id) {
        socket.emit('JOIN_USER_ROOM', user._id);
      }
      // Join all provider zone rooms
      zones.forEach(z => {
        if (!joinedZonesRef.current.has(z._id)) {
          socket.emit('JOIN_ZONE_ROOM', z._id);
          joinedZonesRef.current.add(z._id);
        }
      });
    };

    if (socket.connected) {
      joinRooms();
    }

    socket.on('connect', joinRooms);

    // ─── REAL-TIME PROVIDER STATUS CHANGES ────────────────────────────────────
    socket.on('PROVIDER_STATUS_CHANGED', (data) => {
      setProviderStatus(data.status);
      setVerificationData(prev => ({
        ...prev,
        verificationStatus: data.verificationStatus || prev.verificationStatus,
        rejectionReason: data.rejectionReason || '',
      }));
      // Auto-sync zustand store
      if (data.status && data.status !== user?.status) {
        login({ ...user, status: data.status, verificationStatus: data.verificationStatus });
      }
      // Trigger native notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Verification Status Update', {
          body: data.message || `Your account verification status is now: ${data.verificationStatus || data.status}`
        });
      }
      // If approved, reload dashboard data
      if (data.status === 'ACTIVE') {
        loadAll();
      }
    });

    socket.on('NEW_NOTIFICATION', (notif) => {
      setNotifications(prev => [notif, ...prev]);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notif.title, { body: notif.message });
      }
    });

    socket.on('ZONE_CREATED', (zone) => {
      setZones(prev => {
        const exists = prev.find(z => z._id === zone._id);
        return exists ? prev.map(z => z._id === zone._id ? zone : z) : [zone, ...prev];
      });
    });

    socket.on('ZONE_UPDATED', (zone) => {
      setZones(prev => prev.map(z => z._id === zone._id ? zone : z));
    });

    socket.on('ZONE_DELETED', ({ zoneId }) => {
      setZones(prev => prev.filter(z => z._id !== zoneId));
    });

    socket.on('SLOT_UPDATED', ({ zoneId, slot }) => {
      if (selectedZone?._id === zoneId) {
        setSlots(prev => prev.map(s => s._id === slot._id ? slot : s));
      }
      setZones(prev => prev.map(z => z._id === zoneId ? { ...z, _slotUpdated: Date.now() } : z));
    });

    socket.on('SLOT_FREED', ({ zoneId }) => {
      setZones(prev => prev.map(z => z._id === zoneId ? { ...z, availableSlots: Math.min(z.totalSlots, (z.availableSlots || 0) + 1) } : z));
    });

    socket.on('SLOT_OCCUPIED', ({ zoneId }) => {
      setZones(prev => prev.map(z => z._id === zoneId ? { ...z, availableSlots: Math.max(0, (z.availableSlots || 0) - 1) } : z));
    });

    socket.on('NEW_BOOKING_NOTIFICATION', (notif) => {
      setNotifications(prev => [notif, ...prev]);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notif.title, { body: notif.message });
      }
      loadAll();
    });

    return () => {
      socket.off('connect', joinRooms);
      socket.off('PROVIDER_STATUS_CHANGED');
      socket.off('NEW_NOTIFICATION');
      socket.off('ZONE_CREATED');
      socket.off('ZONE_UPDATED');
      socket.off('ZONE_DELETED');
      socket.off('SLOT_UPDATED');
      socket.off('SLOT_FREED');
      socket.off('SLOT_OCCUPIED');
      socket.off('NEW_BOOKING_NOTIFICATION');
    };
  }, [zones.length, selectedZone, loadAll, user, login]);

  // ─── Join new zones when zones list changes ────────────────────────────────────
  useEffect(() => {
    if (socketRef.current?.connected) {
      zones.forEach(z => {
        if (!joinedZonesRef.current.has(z._id)) {
          socketRef.current.emit('JOIN_ZONE_ROOM', z._id);
          joinedZonesRef.current.add(z._id);
        }
      });
    }
  }, [zones]);

  // ─── Reverse geocode coordinates to address details ────────────────────────────
  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.address) {
          const addr = data.address;
          const road = addr.road || addr.suburb || addr.neighbourhood || '';
          const city = addr.city || addr.town || addr.village || addr.county || '';
          const state = addr.state || '';
          const pinCode = addr.postcode || '';
          
          setZoneForm(prev => ({
            ...prev,
            address: data.display_name || prev.address,
            city: city || prev.city,
            state: state || prev.state,
            pinCode: pinCode || prev.pinCode
          }));
          flash('Address details updated from map location!', 'success');
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding failed:', err);
    }
  };

  // ─── GPS detect current location ─────────────────────────────────────────────
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      flash('Geolocation is not supported by your browser.', 'error');
      return;
    }
    flash('Acquiring precise GPS location...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        
        setZoneForm(prev => ({
          ...prev,
          lat: lat.toFixed(6),
          lng: lng.toFixed(6)
        }));
        
        if (accuracy > 20) {
          flash(`GPS accuracy is low (${accuracy.toFixed(1)}m). Please drag the map pin to adjust for exact parking entrance.`, 'warning');
        } else {
          flash('GPS location detected with high accuracy!', 'success');
        }
        
        reverseGeocode(lat.toFixed(6), lng.toFixed(6));
      },
      (error) => {
        flash('Could not retrieve precise location. Please adjust pin manually.', 'error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // ─── Nominatim address search ──────────────────────────────────────────────
  const handleLocationSearch = async () => {
    if (!locationSearch.trim()) return;
    setLocationSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationSearch)}&format=json&limit=1`);
      const data = await res.json();
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const newLat = parseFloat(lat).toFixed(6);
        const newLng = parseFloat(lon).toFixed(6);
        setZoneForm(prev => ({
          ...prev,
          lat: newLat,
          lng: newLng,
          address: display_name
        }));
        flash('Location found and pin updated!', 'success');
        await reverseGeocode(newLat, newLng);
      } else {
        flash('No location found for that query.', 'error');
      }
    } catch {
      flash('Location search failed. Check your connection.', 'error');
    } finally {
      setLocationSearching(false);
    }
  };

  // ─── Handle marker dragend ──────────────────────────────────────────────────
  const handleMarkerDragEnd = async (e) => {
    const marker = e.target;
    if (marker != null) {
      const position = marker.getLatLng();
      const newLat = position.lat.toFixed(6);
      const newLng = position.lng.toFixed(6);
      
      setZoneForm(prev => ({
        ...prev,
        lat: newLat,
        lng: newLng
      }));
      
      await reverseGeocode(newLat, newLng);
    }
  };

  // ─── Zone CRUD ────────────────────────────────────────────────────────────────
  const handleOpenCreateZone = () => {
    setZoneForm(emptyZoneForm());
    setZoneFormMode('create');
    setZoneFormStep(1);
    setZoneFormError('');
    setShowZoneForm(true);
  };

  const handleOpenEditZone = (zone) => {
    setZoneForm({
      ...emptyZoneForm(),
      ...zone,
      lat: zone.location?.coordinates?.[1]?.toFixed(6) || '28.5355',
      lng: zone.location?.coordinates?.[0]?.toFixed(6) || '77.3910',
      rules: Array.isArray(zone.rules) ? zone.rules.join('\n') : (zone.rules || ''),
      amenities: zone.amenities || []
    });
    setZoneFormMode('edit');
    setZoneFormStep(1);
    setZoneFormError('');
    setShowZoneForm(true);
  };

  const handleZoneFormSubmit = async (e) => {
    e.preventDefault();
    if (zoneFormStep < 3) { setZoneFormStep(s => s + 1); return; }
    setCreatingZone(true);
    setZoneFormError('');
    try {
      // Compute totalSlots from category inputs for display in payload
      const categoryTotal = (parseInt(zoneForm.bikeSlots) || 0) +
        (parseInt(zoneForm.sedanSlots) || 0) +
        (parseInt(zoneForm.suvSlots) || 0) +
        (parseInt(zoneForm.evSlots) || 0);
      const payload = {
        ...zoneForm,
        totalSlots: categoryTotal > 0 ? categoryTotal : (parseInt(zoneForm.totalSlots) || 20),
        rules: zoneForm.rules ? zoneForm.rules.split('\n').filter(Boolean) : []
      };
      if (zoneFormMode === 'create') {
        await api.post('/parking/zones', payload);
        flash('Parking lot created! Slots auto-generated by vehicle category.', 'success');
      } else {
        await api.put(`/parking/zones/${zoneForm._id}`, payload);
        flash('Parking lot updated successfully.', 'success');
      }
      setShowZoneForm(false);
      await loadAll();
    } catch (err) {
      setZoneFormError(err.response?.data?.message || 'Failed to save parking lot.');
    } finally {
      setCreatingZone(false);
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (!confirm('Delete this parking lot and all its slots? This cannot be undone.')) return;
    try {
      await api.delete(`/parking/zones/${zoneId}`);
      flash('Parking lot deleted.', 'success');
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Delete failed', 'error');
    }
  };

  // ─── Lot Management Actions ──────────────────────────────────────────────────
  const handleEnableZone = async (zoneId) => {
    try {
      await api.put(`/parking/zones/${zoneId}/enable`);
      flash('Parking lot enabled.', 'success');
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Enable failed', 'error');
    }
  };

  const handleDisableZone = async (zoneId) => {
    if (!confirm('Disable this parking lot? Drivers will not be able to book it.')) return;
    try {
      await api.put(`/parking/zones/${zoneId}/disable`);
      flash('Parking lot disabled.', 'success');
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Disable failed', 'error');
    }
  };

  const handleArchiveZone = async (zoneId) => {
    if (!confirm('Archive this parking lot? It will be hidden from all listings.')) return;
    try {
      await api.put(`/parking/zones/${zoneId}/archive`);
      flash('Parking lot archived.', 'success');
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Archive failed', 'error');
    }
  };

  const handleRestoreZone = async (zoneId) => {
    try {
      await api.put(`/parking/zones/${zoneId}/restore`);
      flash('Parking lot restored and set to Active.', 'success');
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Restore failed', 'error');
    }
  };

  const handleDuplicateZone = async (zoneId) => {
    if (!confirm('Duplicate this parking lot? A copy will be created with all its slots.')) return;
    try {
      await api.post(`/parking/zones/${zoneId}/duplicate`);
      flash('Parking lot duplicated successfully.', 'success');
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Duplicate failed', 'error');
    }
  };

  // ─── Document verification ────────────────────────────────────────────────────
  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (!verifyingZone) return;
    setDocSaving(true);
    try {
      await api.put(`/parking/zones/${verifyingZone._id}/documents`, {
        documents: [{ docType, fileUrl: docUrl }]
      });
      flash('Documents submitted for admin review.', 'success');
      setShowDocForm(false);
      setVerifyingZone(null);
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Submission failed', 'error');
    } finally {
      setDocSaving(false);
    }
  };

  // ─── Slot Management ──────────────────────────────────────────────────────────
  const fetchSlots = async (zoneId) => {
    setLoadingSlots(true);
    setSlotError('');
    try {
      const { data } = await api.get(`/parking/zones/${zoneId}/slots`);
      setSlots(data || []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleOpenSlots = (zone) => {
    setSelectedZone(zone);
    fetchSlots(zone._id);
    setSlotForm(emptySlotForm());
    setEditingSlot(null);
    setShowSlotForm(false);
    setSlotSearch('');
  };

  const handleSlotFormSubmit = async (e) => {
    e.preventDefault();
    setSlotError('');
    try {
      if (editingSlot) {
        await api.put(`/parking/slots/${editingSlot._id}`, slotForm);
        flash('Slot updated.', 'success');
      } else {
        await api.post(`/parking/zones/${selectedZone._id}/slots`, {
          ...slotForm,
          slotIdentifier: slotForm.slotIdentifier.toUpperCase()
        });
        flash('Slot created.', 'success');
      }
      setSlotForm(emptySlotForm());
      setEditingSlot(null);
      setShowSlotForm(false);
      await fetchSlots(selectedZone._id);
      await loadAll();
    } catch (err) {
      setSlotError(err.response?.data?.message || 'Slot operation failed.');
    }
  };

  const handleEditSlot = (slot) => {
    setEditingSlot(slot);
    setSlotForm({
      slotIdentifier: slot.slotIdentifier,
      vehicleCategory: slot.vehicleCategory || 'Sedan',
      dimensions: slot.dimensions || '5m x 2.5m',
      floor: slot.floor || 'Ground',
      isEV: slot.isEV || false,
      isReserved: slot.isReserved || false,
      isEmergency: slot.isEmergency || false,
      isCovered: slot.isCovered || false,
      isBlocked: slot.isBlocked || false,
      isActive: slot.isActive !== false,
      isUnderMaintenance: slot.isUnderMaintenance || false
    });
    setShowSlotForm(true);
    setSlotError('');
  };

  const handleToggleSlotFlag = async (slot, flag) => {
    try {
      await api.put(`/parking/slots/${slot._id}`, { [flag]: !slot[flag] });
      await fetchSlots(selectedZone._id);
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Update failed', 'error');
    }
  };

  const handleDeleteSlot = async (slotId) => {
    if (!confirm('Delete this slot permanently?')) return;
    try {
      await api.delete(`/parking/slots/${slotId}`);
      flash('Slot deleted.', 'success');
      await fetchSlots(selectedZone._id);
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Delete failed', 'error');
    }
  };

  // ─── Booking Management ───────────────────────────────────────────────────────
  const handleCancelBooking = async (bookingId) => {
    if (!confirm('Cancel this booking? The user will be refunded.')) return;
    try {
      await api.post(`/bookings/${bookingId}/cancel`);
      flash('Booking cancelled and user refunded.', 'success');
      await loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Cancel failed', 'error');
    }
  };

  const filteredBookings = bookings.filter(b => {
    if (bookingTab === 'active') return ['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status);
    if (bookingTab === 'upcoming') return b.status === 'Confirmed';
    if (bookingTab === 'completed') return b.status === 'Completed';
    if (bookingTab === 'cancelled') return b.status === 'Cancelled';
    if (bookingTab === 'noshows') return b.status === 'Expired';
    if (bookingTab === 'lateexits') return ['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status) && new Date(b.endTime) < new Date();
    if (bookingTab === 'extensions') return b.hours > 2;
    return true;
  });

  // ─── Computed stats from zones (if API stats not available) ──────────────────
  const totalSlotsAll = zones.reduce((a, z) => a + (z.totalSlots || 0), 0);
  const availableSlotsAll = zones.reduce((a, z) => a + (z.availableSlots || 0), 0);
  const occupiedSlotsAll = totalSlotsAll - availableSlotsAll;
  const occupancyPct = totalSlotsAll > 0 ? Math.round((occupiedSlotsAll / totalSlotsAll) * 100) : 0;
  const m = stats?.metrics || {};

  // ─── Tabs ─────────────────────────────────────────────────────────────────────
  const TABS = [
    { k: 'overview', l: 'Overview', icon: Activity },
    { k: 'my zones', l: 'My Lots', icon: Layers },
    { k: 'bookings', l: 'Bookings', icon: Clock, badge: bookings.filter(b => ['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status)).length },
    { k: 'analytics', l: 'Analytics', icon: BarChart2 },
    { k: 'notifications', l: 'Alerts', icon: Bell, badge: notifications.filter(n => !n.read).length },
    { k: 'iot_devices', l: 'IoT Devices', icon: Cpu },
    { k: 'iot_settings', l: 'IoT Settings', icon: Settings },
    { k: 'gate_simulator', l: 'Gate Scanner', icon: QrCode },
    { k: 'profile', l: 'Profile', icon: Settings },
  ];

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-parking-primary" />
      <p className="text-sm text-asphalt-500 font-bold">Loading your provider portal...</p>
    </div>
  );

  // ─── Pending Approval & Under Review splash ───────────────────────────────────
  if (providerStatus === 'PENDING_APPROVAL' || providerStatus === 'UNDER_REVIEW') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-6 max-w-lg mx-auto text-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center">
          <Clock className="w-10 h-10 text-amber-500" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-asphalt-900 dark:text-white">
            {providerStatus === 'UNDER_REVIEW' ? 'Account Under Review' : 'Registration Pending'}
          </h2>
          <p className="text-sm text-asphalt-500 dark:text-asphalt-400 mt-2 leading-relaxed">
            {providerStatus === 'UNDER_REVIEW' 
              ? 'Our team is currently reviewing your documents. We are validating your property lease, bank details, and business setup.'
              : 'Your provider registration has been submitted and is awaiting review. Verification checks will begin shortly.'}
          </p>
        </div>

        {/* Real-time verification checks checklist */}
        <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 w-full text-left space-y-4">
          <p className="text-xs font-black text-asphalt-600 dark:text-asphalt-300 uppercase tracking-wider">Verification Checklist</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Identity / Gov ID', status: verificationData.verificationChecks.identity },
              { label: 'Property Ownership / Lease', status: verificationData.verificationChecks.property },
              { label: 'Bank Account / UPI', status: verificationData.verificationChecks.bank },
              { label: 'GPS / Address Matching', status: verificationData.verificationChecks.gps },
            ].map((check, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 bg-asphalt-50 dark:bg-asphalt-900/40 rounded-xl border border-asphalt-100 dark:border-asphalt-800/40">
                <span className="text-xs font-bold text-asphalt-700 dark:text-asphalt-300">{check.label}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  check.status === 'Verified' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                  check.status === 'Failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' :
                  'bg-amber-100 text-amber-700 dark:bg-amber-900/30'
                }`}>
                  {check.status}
                </span>
              </div>
            ))}
          </div>
          {verificationData.adminRemarks && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-750 dark:text-blue-300 border border-blue-100 dark:border-blue-900/30 rounded-xl text-xs">
              <span className="font-bold">Admin Remarks:</span> {verificationData.adminRemarks}
            </div>
          )}
        </div>

        <button onClick={fetchStatus} className="btn-secondary py-2.5 px-5 text-xs font-bold flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Status
        </button>
      </div>
    );
  }

  // ─── Rejected splash ──────────────────────────────────────────────────────────
  if (providerStatus === 'REJECTED') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6 max-w-md mx-auto text-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-asphalt-900 dark:text-white">Registration Rejected</h2>
          <p className="text-sm text-asphalt-550 dark:text-asphalt-400 mt-2 leading-relaxed">
            Your provider registration was not approved.
          </p>
          {verificationData.rejectionReason && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/20 text-parking-danger border border-red-200 dark:border-red-900/30 rounded-xl text-xs text-left">
              <span className="font-bold">Reason for Rejection:</span>
              <p className="mt-1 font-medium">{verificationData.rejectionReason}</p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={fetchStatus} className="btn-secondary py-3 px-6 text-sm font-bold flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Check Again
          </button>
          <a href="mailto:support@smartparking.in" className="btn-primary py-3 px-6 text-sm font-bold flex items-center gap-2">
            <Mail className="w-4 h-4" /> Contact Support
          </a>
        </div>
      </div>
    );
  }

  // ─── Suspended splash ─────────────────────────────────────────────────────────
  if (providerStatus === 'SUSPENDED') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6 max-w-md mx-auto text-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-asphalt-100 dark:bg-asphalt-950/30 flex items-center justify-center">
          <Lock className="w-10 h-10 text-asphalt-500" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-asphalt-900 dark:text-white">Account Suspended</h2>
          <p className="text-sm text-asphalt-550 dark:text-asphalt-400 mt-2 leading-relaxed">
            Your provider account has been temporarily suspended by system administrators.
          </p>
          {verificationData.rejectionReason && (
            <div className="mt-4 p-4 bg-asphalt-50 dark:bg-asphalt-900/20 text-asphalt-700 dark:text-asphalt-300 border border-asphalt-250 dark:border-asphalt-800 rounded-xl text-xs text-left">
              <span className="font-bold">Suspension Reason:</span>
              <p className="mt-1 font-medium">{verificationData.rejectionReason}</p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={fetchStatus} className="btn-secondary py-3 px-6 text-sm font-bold flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Verify Status
          </button>
          <a href="mailto:support@smartparking.in" className="btn-primary py-3 px-6 text-sm font-bold flex items-center gap-2">
            <Mail className="w-4 h-4" /> Appeal Suspension
          </a>
        </div>
      </div>
    );
  }

  // ─── Main Dashboard ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6 px-2 sm:px-4">

      {/* SIDEBAR */}
      <div className="w-full md:w-56 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 shrink-0 border-b md:border-b-0 md:border-r border-asphalt-200 dark:border-asphalt-800 pr-0 md:pr-4">
        <div className="hidden md:flex items-center gap-2.5 px-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-parking-primary flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black text-asphalt-450 uppercase tracking-widest">Provider</p>
            <p className="text-xs font-bold text-asphalt-900 dark:text-white truncate max-w-[110px]">{user?.fullName || 'Partner'}</p>
          </div>
        </div>
        {TABS.map(tab => (
          <button
            key={tab.k}
            onClick={() => setActiveTab(tab.k)}
            className={`text-left px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2.5 whitespace-nowrap ${activeTab === tab.k ? 'bg-parking-primary text-white shadow-sm' : 'hover:bg-asphalt-100 dark:hover:bg-asphalt-900 text-asphalt-600 dark:text-asphalt-400'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.l}
            {tab.badge > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* MAIN PANEL */}
      <div className="flex-1 space-y-6 min-w-0">

        {/* Global Flash Message */}
        <AnimatePresence>
          {actionMsg.text && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`p-3 rounded-lg text-xs font-bold border ${actionMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-green-700 border-green-200' : 'bg-red-50 dark:bg-red-950/20 text-red-700 border-red-200'}`}
            >
              {actionMsg.text}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* ─── OVERVIEW ──────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black text-asphalt-900 dark:text-white">Provider Dashboard</h1>
                  <p className="text-xs text-asphalt-500 mt-0.5">Real-time business overview · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <button onClick={loadAll} className="p-2 rounded-lg border border-asphalt-200 dark:border-asphalt-800 hover:bg-asphalt-50 dark:hover:bg-asphalt-900 transition text-asphalt-500">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { title: "Today's Revenue", value: `₹${(m.todayRevenue || 0).toLocaleString()}`, icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-900/30' },
                  { title: "Today's Bookings", value: m.todayBookings || bookings.filter(b => new Date(b.createdAt).toDateString() === new Date().toDateString()).length, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-200 dark:border-blue-900/30' },
                  { title: 'Occupancy Rate', value: `${m.currentOccupancy ?? occupancyPct}%`, icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/20', border: 'border-purple-200 dark:border-purple-900/30' },
                  { title: 'Available Slots', value: m.availableSlots ?? availableSlotsAll, icon: Grid, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-900/30' },
                  { title: 'Occupied Slots', value: m.occupiedSlots ?? occupiedSlotsAll, icon: Car, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-900/30' },
                  { title: 'Late Exit Cases', value: m.lateExitCases ?? bookings.filter(b => b.status === 'Active' && new Date(b.endTime) < new Date()).length, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-200 dark:border-orange-900/30' },
                  { title: 'Wallet Balance', value: `₹${(m.walletBalance || 0).toLocaleString()}`, icon: CreditCard, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-950/20', border: 'border-teal-200 dark:border-teal-900/30' },
                  { title: 'Monthly Earnings', value: `₹${(m.monthlyEarnings || 0).toLocaleString()}`, icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/20', border: 'border-indigo-200 dark:border-indigo-900/30' },
                ].map((card, i) => (
                  <div key={i} className={`glass-card p-5 border ${card.border} flex items-center gap-4`}>
                    <div className={`p-2.5 rounded-xl ${card.bg} shrink-0`}>
                      <card.icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-asphalt-500 font-bold uppercase tracking-wider truncate">{card.title}</p>
                      <h4 className="text-xl font-black text-asphalt-850 dark:text-white mt-0.5">{card.value}</h4>
                    </div>
                  </div>
                ))}
              </div>

              {/* Secondary metrics row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Avg. Duration', val: m.averageParkingDuration || '2.5 hrs', icon: Timer },
                  { label: 'Peak Hours', val: m.peakHours || '14:00–17:00', icon: TrendingUp },
                  { label: 'Avg Rating', val: `${m.averageRating || 4.5} ★`, icon: Star },
                  { label: 'Settlement', val: m.settlementStatus || 'Settled', icon: CheckCircle2 },
                ].map((s, i) => (
                  <div key={i} className="glass-card p-4 border border-asphalt-200 dark:border-asphalt-800 flex items-center gap-3">
                    <s.icon className="w-4 h-4 text-parking-primary shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-asphalt-400 uppercase">{s.label}</p>
                      <p className="text-sm font-black text-asphalt-900 dark:text-white">{s.val}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* IoT Status Panel */}
              <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                <h3 className="font-bold text-asphalt-850 dark:text-white flex items-center gap-2">
                  <Signal className="w-4 h-4 text-green-500" /> IoT Device Status
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: 'Online Slots', val: m.iotDeviceStatus?.online ?? zones.reduce((a, z) => a + z.totalSlots, 0), color: 'text-green-600', icon: Wifi },
                    { label: 'Offline', val: m.iotDeviceStatus?.offline ?? 0, color: 'text-red-500', icon: WifiOff },
                    { label: 'Battery', val: m.iotDeviceStatus?.batteryStatus || 'Good', color: 'text-blue-600', icon: Battery },
                    { label: 'Last Heartbeat', val: m.iotDeviceStatus?.lastHeartbeat || 'N/A', color: 'text-purple-600', icon: Signal },
                    { label: 'Sensor Health', val: m.iotDeviceStatus?.sensorHealth || 'Excellent', color: 'text-emerald-600', icon: Activity },
                  ].map((d, i) => (
                    <div key={i} className="p-3 bg-asphalt-50 dark:bg-asphalt-900/40 rounded-xl border border-asphalt-200/50 dark:border-asphalt-800/50 text-center">
                      <d.icon className={`w-5 h-5 mx-auto mb-1 ${d.color}`} />
                      <p className="text-xs font-black text-asphalt-900 dark:text-white">{d.val}</p>
                      <p className="text-[9px] text-asphalt-400 font-bold uppercase mt-0.5">{d.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-asphalt-400 italic">Supports ESP32 / ESP8266 / BLE / WiFi / MQTT / WebSocket protocols. Sensor data updates every 30 seconds.</p>
              </div>

              {/* Recent Reviews */}
              {m.customerReviews?.length > 0 && (
                <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-3">
                  <h3 className="font-bold text-asphalt-850 dark:text-white flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> Customer Reviews
                    <span className="ml-auto text-xs text-asphalt-500">{m.averageRating} avg</span>
                  </h3>
                  {m.customerReviews.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-asphalt-50 dark:bg-asphalt-900/40 rounded-xl border border-asphalt-100 dark:border-asphalt-800/50">
                      <div className="w-8 h-8 rounded-full bg-parking-primary/10 flex items-center justify-center shrink-0 text-xs font-black text-parking-primary">
                        {(r.userId?.fullName || 'U').charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-asphalt-900 dark:text-white">{r.userId?.fullName || 'User'}</span>
                          <span className="flex text-amber-500">{'★'.repeat(r.rating)}</span>
                        </div>
                        <p className="text-[11px] text-asphalt-500 mt-0.5 italic">"{r.comments}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ─── MY LOTS ───────────────────────────────────────────────────── */}
          {activeTab === 'my zones' && (
            <motion.div key="zones" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-asphalt-900 dark:text-white">My Parking Lots</h2>
                <button onClick={handleOpenCreateZone} className="btn-primary py-2 px-3 text-xs flex items-center gap-1.5 font-bold shadow-none">
                  <Plus className="w-3.5 h-3.5" /> Register New Lot
                </button>
              </div>

              {/* Active / Archived Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setLotsView('active')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${lotsView === 'active' ? 'bg-parking-primary text-white' : 'bg-asphalt-100 dark:bg-asphalt-900 text-asphalt-600 dark:text-asphalt-400'}`}
                >
                  Active Lots <span className="ml-1 opacity-70">({zones.length})</span>
                </button>
                <button
                  onClick={() => setLotsView('archived')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${lotsView === 'archived' ? 'bg-asphalt-700 text-white' : 'bg-asphalt-100 dark:bg-asphalt-900 text-asphalt-600 dark:text-asphalt-400'}`}
                >
                  Archived <span className="ml-1 opacity-70">({archivedZones.length})</span>
                </button>
              </div>

              {/* Zone List */}
              {(lotsView === 'active' ? zones : archivedZones).length === 0 ? (
                <div className="glass-card p-12 border border-dashed border-asphalt-300 dark:border-asphalt-700 text-center space-y-3">
                  <MapPin className="w-10 h-10 text-asphalt-300 mx-auto" />
                  <p className="font-bold text-asphalt-500">
                    {lotsView === 'active' ? 'No active parking lots registered yet.' : 'No archived parking lots.'}
                  </p>
                  {lotsView === 'active' && (
                    <button onClick={handleOpenCreateZone} className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" /> Add Your First Lot
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {(lotsView === 'active' ? zones : archivedZones).map((zone) => {
                    const occ = zone.totalSlots > 0 ? Math.round(((zone.totalSlots - zone.availableSlots) / zone.totalSlots) * 100) : 0;
                    const isActive = zone.status === 'Active';
                    return (
                      <div key={zone._id} className="glass-card border border-asphalt-200 dark:border-asphalt-800 overflow-hidden">
                        <div className="p-5 flex flex-col sm:flex-row gap-4">
                          {/* Zone Info */}
                          <div className="flex-1 space-y-2 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-black text-lg text-asphalt-900 dark:text-white">{zone.name}</h3>
                              <span className={`status-chip text-[9px] ${zone.isApproved ? 'badge-emerald' : zone.verificationStatus === 'Rejected' ? 'badge-red' : 'badge-yellow'}`}>
                                {zone.isApproved ? 'Approved & Live' : zone.verificationStatus || 'Pending Review'}
                              </span>
                              <span className={`status-chip text-[9px] ${isActive ? 'badge-emerald' : 'badge-red'}`}>
                                {zone.status || 'Active'}
                              </span>
                              <span className="status-chip badge-blue text-[9px]">{zone.parkingType || 'Public'}</span>
                              {zone.isArchived && <span className="status-chip badge-yellow text-[9px]">Archived</span>}
                            </div>
                            <p className="text-xs text-asphalt-500 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              {[zone.address, zone.city, zone.state, zone.pinCode].filter(Boolean).join(', ') || 'Address not set'}
                            </p>
                            <div className="flex flex-wrap gap-3 text-[10px] text-asphalt-500 font-bold uppercase">
                              <span>₹{zone.hourlyPrice || zone.basePricePerHour}/hr</span>
                              <span>•</span>
                              <span>{zone.totalSlots} slots</span>
                              {zone.bikeSlots > 0 && <><span>•</span><span className="text-blue-600">{zone.bikeSlots}B</span></>}
                              {zone.sedanSlots > 0 && <><span>•</span><span className="text-green-600">{zone.sedanSlots}S</span></>}
                              {zone.suvSlots > 0 && <><span>•</span><span className="text-orange-600">{zone.suvSlots}SUV</span></>}
                              {zone.evSlots > 0 && <><span>•</span><span className="text-purple-600">{zone.evSlots}EV</span></>}
                              <span>•</span>
                              <span>{zone.floorsCount || 1} floor(s)</span>
                            </div>
                            {/* Occupancy bar */}
                            <div className="space-y-1 pt-1">
                              <div className="flex justify-between text-[10px] font-bold text-asphalt-500">
                                <span>{zone.availableSlots} available · {zone.totalSlots - zone.availableSlots} occupied</span>
                                <span>{occ}% full</span>
                              </div>
                              <div className="h-1.5 bg-asphalt-100 dark:bg-asphalt-900 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${occ > 80 ? 'bg-red-500' : occ > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${occ}%` }} />
                              </div>
                            </div>
                            {/* Amenities */}
                            {zone.amenities?.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {zone.amenities.slice(0, 5).map(a => (
                                  <span key={a} className="text-[9px] font-bold bg-asphalt-100 dark:bg-asphalt-900 text-asphalt-600 dark:text-asphalt-400 px-1.5 py-0.5 rounded">{a}</span>
                                ))}
                                {zone.amenities.length > 5 && <span className="text-[9px] font-bold text-asphalt-400">+{zone.amenities.length - 5} more</span>}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex sm:flex-col gap-2 shrink-0 justify-end flex-wrap">
                            {lotsView === 'archived' ? (
                              <>
                                <button onClick={() => handleRestoreZone(zone._id)} className="btn-primary py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Restore
                                </button>
                                <button onClick={() => handleDeleteZone(zone._id)} className="py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1 border border-red-200 text-parking-danger hover:bg-red-50 rounded-lg transition">
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleOpenSlots(zone)} className="btn-primary py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1">
                                  <Grid className="w-3.5 h-3.5" /> Manage Slots
                                </button>
                                <button onClick={() => handleOpenEditZone(zone)} className="btn-secondary py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1">
                                  <Edit2 className="w-3.5 h-3.5" /> Edit Lot
                                </button>
                                {isActive ? (
                                  <button onClick={() => handleDisableZone(zone._id)} className="py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1 border border-amber-300 text-amber-600 hover:bg-amber-50 rounded-lg transition">
                                    <AlertCircle className="w-3.5 h-3.5" /> Disable
                                  </button>
                                ) : (
                                  <button onClick={() => handleEnableZone(zone._id)} className="py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1 border border-emerald-300 text-emerald-600 hover:bg-emerald-50 rounded-lg transition">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Enable
                                  </button>
                                )}
                                <button onClick={() => handleDuplicateZone(zone._id)} className="py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1 border border-asphalt-200 dark:border-asphalt-800 rounded-lg hover:bg-asphalt-50 dark:hover:bg-asphalt-900 transition">
                                  <Copy className="w-3.5 h-3.5" /> Duplicate
                                </button>
                                <button onClick={() => { setVerifyingZone(zone); setShowDocForm(true); }} className="py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1 border border-asphalt-200 dark:border-asphalt-800 rounded-lg hover:bg-asphalt-50 dark:hover:bg-asphalt-900 transition">
                                  <FileText className="w-3.5 h-3.5" /> Documents
                                </button>
                                <button onClick={() => handleArchiveZone(zone._id)} className="py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1 border border-asphalt-200 dark:border-asphalt-800 text-asphalt-500 hover:bg-asphalt-50 rounded-lg transition">
                                  <Archive className="w-3.5 h-3.5" /> Archive
                                </button>
                                <button onClick={() => handleDeleteZone(zone._id)} className="py-1.5 px-3 text-[10px] font-bold shadow-none flex items-center gap-1 border border-red-200 text-parking-danger hover:bg-red-50 rounded-lg transition">
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Coordinates bar */}
                        <div className="px-5 py-2.5 bg-asphalt-50 dark:bg-asphalt-900/40 border-t border-asphalt-100 dark:border-asphalt-800 flex items-center gap-4 text-[10px] font-mono text-asphalt-400">
                          <Navigation className="w-3 h-3" />
                          <span>Lat: {zone.location?.coordinates?.[1]?.toFixed(4) || '—'} · Lng: {zone.location?.coordinates?.[0]?.toFixed(4) || '—'}</span>
                          {zone.operatingHours && <><span>·</span><Clock className="w-3 h-3" /><span>{zone.operatingHours}</span></>}
                          {zone.landmark && <><span>·</span><span>Near {zone.landmark}</span></>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ─── BOOKINGS ──────────────────────────────────────────────────── */}
          {activeTab === 'bookings' && (
            <motion.div key="bookings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-xl font-black text-asphalt-900 dark:text-white">Booking Management</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-asphalt-400 font-bold">{bookings.length} total bookings</span>
                  <button onClick={loadAll} className="p-1.5 rounded-lg border border-asphalt-200 dark:border-asphalt-800 hover:bg-asphalt-50 dark:hover:bg-asphalt-900 transition text-asphalt-400">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Booking sub-tabs */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { k: 'all', l: 'All' },
                  { k: 'active', l: 'Active' },
                  { k: 'upcoming', l: 'Upcoming' },
                  { k: 'completed', l: 'Completed' },
                  { k: 'cancelled', l: 'Cancelled' },
                  { k: 'noshows', l: 'No Shows' },
                  { k: 'lateexits', l: 'Late Exits' },
                ].map(bt => (
                  <button key={bt.k} onClick={() => setBookingTab(bt.k)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition ${bookingTab === bt.k ? 'bg-parking-primary text-white' : 'bg-asphalt-100 dark:bg-asphalt-900 text-asphalt-600 dark:text-asphalt-400 hover:bg-asphalt-200 dark:hover:bg-asphalt-800'}`}>
                    {bt.l}
                    <span className="ml-1 opacity-60">({bookings.filter(b => {
                      if (bt.k === 'all') return true;
                      if (bt.k === 'active') return ['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status);
                      if (bt.k === 'upcoming') return b.status === 'Confirmed';
                      if (bt.k === 'completed') return b.status === 'Completed';
                      if (bt.k === 'cancelled') return b.status === 'Cancelled';
                      if (bt.k === 'noshows') return b.status === 'Expired';
                      if (bt.k === 'lateexits') return ['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status) && new Date(b.endTime) < new Date();
                      return true;
                    }).length})</span>
                  </button>
                ))}
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-asphalt-400" />
                <input
                  type="text"
                  placeholder="Search by driver name, plate, slot, lot…"
                  value={slotSearch}
                  onChange={e => setSlotSearch(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 text-xs border border-asphalt-200 dark:border-asphalt-800 rounded-lg bg-white dark:bg-asphalt-900 text-asphalt-900 dark:text-white placeholder:text-asphalt-400 focus:outline-none focus:ring-2 focus:ring-parking-primary/30"
                />
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Active Now', val: bookings.filter(b => ['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status)).length, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-200 dark:border-blue-900/30' },
                  { label: 'Upcoming', val: bookings.filter(b => b.status === 'Confirmed').length, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-900/30' },
                  { label: 'Completed', val: bookings.filter(b => b.status === 'Completed').length, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-900/30' },
                  { label: 'Late Exits', val: bookings.filter(b => ['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status) && new Date(b.endTime) < new Date()).length, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-900/30' },
                ].map((c, i) => (
                  <div key={i} className={`glass-card p-3.5 border ${c.border} flex items-center gap-3`}>
                    <div className={`p-2 rounded-lg ${c.bg} shrink-0`}>
                      <Clock className={`w-4 h-4 ${c.color}`} />
                    </div>
                    <div>
                      <p className="text-[10px] text-asphalt-400 font-bold uppercase">{c.label}</p>
                      <p className={`text-lg font-black ${c.color}`}>{c.val}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="glass-card border border-asphalt-200 dark:border-asphalt-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-asphalt-200 dark:border-asphalt-800 bg-asphalt-50 dark:bg-asphalt-900/40">
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Driver</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Lot / Slot</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Vehicle</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Date & Time</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Duration</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Amount</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Status</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const search = slotSearch.toLowerCase();
                        const filtered = bookings.filter(b => {
                          // Status filter
                          if (bookingTab === 'active') { if (!['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status)) return false; }
                          else if (bookingTab === 'upcoming') { if (b.status !== 'Confirmed') return false; }
                          else if (bookingTab === 'completed') { if (b.status !== 'Completed') return false; }
                          else if (bookingTab === 'cancelled') { if (b.status !== 'Cancelled') return false; }
                          else if (bookingTab === 'noshows') { if (b.status !== 'Expired') return false; }
                          else if (bookingTab === 'lateexits') { if (!(['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status) && new Date(b.endTime) < new Date())) return false; }
                          // Search filter
                          if (search) {
                            const driverName = b.userId?.fullName?.toLowerCase() || '';
                            const driverEmail = b.userId?.email?.toLowerCase() || '';
                            const plate = (b.vehiclePlate || b.vehicleId?.licensePlate || '').toLowerCase();
                            const slot = b.slotId?.slotIdentifier?.toLowerCase() || '';
                            const lot = b.zoneId?.name?.toLowerCase() || '';
                            const vType = (b.vehicleId?.vehicleType || '').toLowerCase();
                            if (![driverName, driverEmail, plate, slot, lot, vType].some(f => f.includes(search))) return false;
                          }
                          return true;
                        });

                        if (filtered.length === 0) {
                          return <tr><td colSpan="8" className="py-12 text-center text-asphalt-400 text-xs font-bold">No bookings found for this filter.</td></tr>;
                        }

                        return filtered.map((b, i) => {
                          const isLate = ['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status) && new Date(b.endTime) < new Date();
                          const startDate = new Date(b.startTime);
                          const endDate = new Date(b.endTime);
                          const plate = b.vehiclePlate || b.vehicleId?.licensePlate || '—';
                          const vType = b.vehicleId?.vehicleType || '';
                          const vMakeModel = b.vehicleId ? `${b.vehicleId.make || ''} ${b.vehicleId.model || ''}`.trim() : '';
                          return (
                            <tr key={b._id || i} className={`border-b border-asphalt-100 dark:border-asphalt-800 last:border-0 hover:bg-asphalt-50/50 dark:hover:bg-asphalt-900/10 transition ${isLate ? 'bg-red-50/40 dark:bg-red-950/10' : ''}`}>
                              {/* Driver */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-parking-primary/10 flex items-center justify-center text-parking-primary font-black text-[10px] shrink-0">
                                    {(b.userId?.fullName || 'D').charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-bold text-asphalt-900 dark:text-white">{b.userId?.fullName || 'Driver'}</p>
                                    <p className="text-[10px] text-asphalt-400">{b.userId?.email || '—'}</p>
                                  </div>
                                </div>
                              </td>
                              {/* Lot / Slot */}
                              <td className="py-3.5 px-4">
                                <p className="font-bold text-asphalt-900 dark:text-white">{b.zoneId?.name || '—'}</p>
                                <p className="font-mono text-asphalt-400 text-[10px]">
                                  {b.slotId?.slotIdentifier || '—'}
                                  {b.slotId?.floor ? ` · ${b.slotId.floor}` : ''}
                                  {b.slotId?.isEV ? ' ⚡' : ''}
                                </p>
                              </td>
                              {/* Vehicle */}
                              <td className="py-3.5 px-4">
                                <p className="font-mono font-bold text-asphalt-700 dark:text-asphalt-300">{plate}</p>
                                <p className="text-[10px] text-asphalt-400">{vMakeModel || vType || '—'}</p>
                              </td>
                              {/* Date & Time */}
                              <td className="py-3.5 px-4">
                                <p className="font-bold text-asphalt-700 dark:text-asphalt-300">{startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</p>
                                <p className="text-[10px] text-asphalt-400">
                                  {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </td>
                              {/* Duration */}
                              <td className="py-3.5 px-4">
                                <p className="font-bold text-asphalt-700 dark:text-asphalt-300">{b.hours || Math.round((endDate - startDate) / 3600000) || 1}h</p>
                                {b.actualEndTime && (
                                  <p className="text-[10px] text-asphalt-400">Exited: {new Date(b.actualEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                )}
                              </td>
                              {/* Amount */}
                              <td className="py-3.5 px-4">
                                <p className="font-bold font-mono text-asphalt-900 dark:text-white">₹{b.totalCost?.toLocaleString() || '—'}</p>
                                {b.fineAmount > 0 && <p className="text-[10px] text-red-500 font-bold">+₹{b.fineAmount} fine</p>}
                              </td>
                              {/* Status */}
                              <td className="py-3.5 px-4">
                                <span className={`status-chip text-[9px] ${
                                  isLate ? 'badge-red' :
                                  ['Active', 'ENTERING', 'PARKED', 'EXITING'].includes(b.status) ? 'badge-blue' :
                                  b.status === 'Confirmed' ? 'badge-yellow' :
                                  b.status === 'Completed' ? 'badge-emerald' :
                                  b.status === 'Cancelled' ? 'badge-red' : 'badge-red'
                                }`}>
                                  {isLate ? 'LATE EXIT' : b.status?.toUpperCase()}
                                </span>
                                {b.entryStatus === 'Entered' && (
                                  <p className="text-[9px] text-blue-500 font-bold mt-0.5">✓ Entered</p>
                                )}
                              </td>
                              {/* Actions */}
                              <td className="py-3.5 px-4 text-right">
                                {['Confirmed', 'Active', 'ENTERING', 'PARKED'].includes(b.status) && (
                                  <button onClick={() => handleCancelBooking(b._id)} className="px-2.5 py-1 text-[10px] font-bold bg-red-50 text-parking-danger hover:bg-red-100 rounded border border-red-200 shadow-none">Cancel</button>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── ANALYTICS ─────────────────────────────────────────────────── */}
          {activeTab === 'analytics' && (
            <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <h2 className="text-xl font-black text-asphalt-900 dark:text-white">Analytics & Insights</h2>

              {/* Revenue + Occupancy Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Revenue Chart */}
                <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                  <h3 className="font-bold text-asphalt-850 dark:text-white flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-emerald-500" /> 7-Day Revenue (₹)
                  </h3>
                  <div className="flex items-end gap-2 h-36 pt-2">
                    {(stats?.analytics?.revenueGraph?.data || [120, 200, 180, 300, 250, 350, 280]).map((val, idx) => {
                      const max = Math.max(...(stats?.analytics?.revenueGraph?.data || [120, 200, 180, 300, 250, 350, 280]));
                      const pct = max > 0 ? (val / max) * 100 : 0;
                      const labels = stats?.analytics?.revenueGraph?.labels || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1.5">
                          <span className="text-[8px] font-bold text-asphalt-400">₹{val}</span>
                          <div className="w-full bg-asphalt-100 dark:bg-asphalt-900 rounded-t flex items-end" style={{ height: '100px' }}>
                            <div className="w-full bg-emerald-500/80 hover:bg-emerald-500 rounded-t transition-all" style={{ height: `${pct}%` }} />
                          </div>
                          <span className="text-[9px] font-bold text-asphalt-400">{labels[idx]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Occupancy Chart */}
                <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                  <h3 className="font-bold text-asphalt-850 dark:text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" /> 7-Day Occupancy (%)
                  </h3>
                  <div className="flex items-end gap-2 h-36 pt-2">
                    {(stats?.analytics?.occupancyGraph?.data || [45, 60, 55, 80, 70, 90, 65]).map((val, idx) => {
                      const labels = stats?.analytics?.occupancyGraph?.labels || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1.5">
                          <span className="text-[8px] font-bold text-asphalt-400">{val}%</span>
                          <div className="w-full bg-asphalt-100 dark:bg-asphalt-900 rounded-t flex items-end" style={{ height: '100px' }}>
                            <div className={`w-full rounded-t transition-all ${val > 80 ? 'bg-red-500/80' : val > 60 ? 'bg-amber-500/80' : 'bg-blue-500/80'}`} style={{ height: `${val}%` }} />
                          </div>
                          <span className="text-[9px] font-bold text-asphalt-400">{labels[idx]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom analytics row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Vehicle Distribution */}
                <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                  <h3 className="font-bold text-asphalt-850 dark:text-white text-sm">Vehicle Distribution</h3>
                  <div className="space-y-3">
                    {(stats?.analytics?.popularVehicleTypes || [
                      { type: 'Sedan', percentage: 40 },
                      { type: 'SUV', percentage: 30 },
                      { type: 'Bike', percentage: 20 },
                      { type: 'EV', percentage: 10 }
                    ]).map((v, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-asphalt-700 dark:text-asphalt-300">{v.type}</span>
                          <span className="text-asphalt-500">{v.percentage}%</span>
                        </div>
                        <div className="h-2 bg-asphalt-100 dark:bg-asphalt-900 rounded-full overflow-hidden">
                          <div className="h-full bg-parking-primary/80 rounded-full" style={{ width: `${v.percentage}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Ratios */}
                <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                  <h3 className="font-bold text-asphalt-850 dark:text-white text-sm">Performance Ratios</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'Cancellation Rate', val: `${stats?.analytics?.cancellationRate || 5}%`, color: 'text-red-500' },
                      { label: 'Customer Retention', val: `${stats?.analytics?.customerRetention || 75}%`, color: 'text-emerald-500' },
                      { label: 'Monthly Growth', val: `${stats?.analytics?.monthlyGrowth || 0}%`, color: 'text-blue-500' },
                      { label: 'Avg Parking Time', val: stats?.analytics?.averageParkingTime || '2.5 hours', color: 'text-purple-500' },
                    ].map((r, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-xs text-asphalt-600 dark:text-asphalt-400 font-bold">{r.label}</span>
                        <span className={`text-sm font-black ${r.color}`}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Earnings summary */}
                <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                  <h3 className="font-bold text-asphalt-850 dark:text-white text-sm">Earnings Summary</h3>
                  <div className="space-y-4">
                    {[
                      { label: "Today's Revenue", val: `₹${(m.todayRevenue || 0).toLocaleString()}` },
                      { label: 'Monthly Earnings', val: `₹${(m.monthlyEarnings || 0).toLocaleString()}` },
                      { label: 'Yearly Earnings', val: `₹${(m.yearlyEarnings || 0).toLocaleString()}` },
                      { label: 'Wallet Balance', val: `₹${(m.walletBalance || 0).toLocaleString()}` },
                    ].map((r, i) => (
                      <div key={i} className="flex justify-between items-center border-b border-asphalt-100 dark:border-asphalt-800 pb-2 last:border-0">
                        <span className="text-xs text-asphalt-600 dark:text-asphalt-400 font-bold">{r.label}</span>
                        <span className="text-sm font-black text-emerald-600">{r.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── NOTIFICATIONS ─────────────────────────────────────────────── */}
          {activeTab === 'notifications' && (
            <motion.div key="notifs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-asphalt-900 dark:text-white">Alert Center</h2>
                <span className="text-xs text-asphalt-400 font-bold">{notifications.length} alerts</span>
              </div>
              <div className="glass-card border border-asphalt-200 dark:border-asphalt-800 divide-y divide-asphalt-100 dark:divide-asphalt-800">
                {notifications.length === 0 ? (
                  <div className="p-10 text-center text-asphalt-400 text-xs font-bold">No notifications yet.</div>
                ) : notifications.map((n, i) => (
                  <div key={n._id || i} className={`p-4 flex gap-4 hover:bg-asphalt-50/50 dark:hover:bg-asphalt-900/20 transition ${!n.read ? 'border-l-4 border-parking-primary' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs ${n.type === 'PENALTY' ? 'bg-red-500' : n.type === 'SUCCESS' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                      <Bell className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-asphalt-900 dark:text-white">{n.title}</h4>
                      <p className="text-[11px] text-asphalt-500 mt-0.5 leading-relaxed">{n.message}</p>
                      <span className="text-[9px] font-mono text-asphalt-400 mt-1 block">{new Date(n.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── IoT DEVICES ─────────────────────────────────────────────────── */}
          {activeTab === 'iot_devices' && (
            <motion.div key="iot_devices" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <IoTDeviceManagement />
            </motion.div>
          )}

          {/* ─── IoT SETTINGS ────────────────────────────────────────────────── */}
          {activeTab === 'iot_settings' && (
            <motion.div key="iot_settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <IoTSettings />
            </motion.div>
          )}

          {/* ─── GATE SIMULATOR ──────────────────────────────────────────── */}
          {activeTab === 'gate_simulator' && (
            <motion.div key="gate_simulator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <GateSimulator onRefresh={() => {}} />
            </motion.div>
          )}

          {/* ─── SETTINGS ──────────────────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <h2 className="text-xl font-black text-asphalt-900 dark:text-white">Business Profile & Settings</h2>
              <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-asphalt-450 uppercase">Full Name</label>
                    <div className="form-input mt-1.5 bg-asphalt-50 dark:bg-asphalt-900 text-asphalt-500 cursor-not-allowed">{user?.fullName}</div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-asphalt-450 uppercase">Email</label>
                    <div className="form-input mt-1.5 bg-asphalt-50 dark:bg-asphalt-900 text-asphalt-500 cursor-not-allowed">{user?.email}</div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-asphalt-450 uppercase">Business Name</label>
                    <div className="form-input mt-1.5 bg-asphalt-50 dark:bg-asphalt-900 text-asphalt-500">{user?.businessName || '—'}</div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-asphalt-450 uppercase">Account Status</label>
                    <div className={`form-input mt-1.5 font-bold ${user?.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'}`}>{user?.status}</div>
                  </div>
                </div>
                <div className="pt-2 border-t border-asphalt-100 dark:border-asphalt-800">
                  <p className="text-xs text-asphalt-400">Bank Account: {user?.bankAccount || '—'} · UPI: {user?.upiId || '—'} · GST: {user?.gstNumber || 'N/A'}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* ZONE FORM (Create / Edit) — 3 Step Wizard */}
      <AnimatePresence>
        {showZoneForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-asphalt-950/50 dark:bg-asphalt-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowZoneForm(false)}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-parking-card rounded-2xl border border-asphalt-200 dark:border-asphalt-800 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

              {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b border-asphalt-100 dark:border-asphalt-800 shrink-0">
                <div>
                  <h3 className="text-lg font-black text-asphalt-900 dark:text-white">
                    {zoneFormMode === 'create' ? 'Register New Parking Lot' : 'Edit Parking Lot'}
                  </h3>
                  <p className="text-xs text-asphalt-400 mt-0.5">Step {zoneFormStep} of 3 — {['Location & Address', 'Lot Details & Facilities', 'Pricing & Images'][zoneFormStep - 1]}</p>
                </div>
                <button onClick={() => setShowZoneForm(false)} className="p-2 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-800 text-asphalt-450">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step Indicators */}
              <div className="flex gap-0 px-6 pt-4 pb-0 shrink-0">
                {[1, 2, 3].map(s => (
                  <div key={s} className="flex-1 flex items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${zoneFormStep >= s ? 'bg-parking-primary text-white' : 'bg-asphalt-100 dark:bg-asphalt-800 text-asphalt-400'}`}>{s}</div>
                    {s < 3 && <div className={`flex-1 h-0.5 mx-1 ${zoneFormStep > s ? 'bg-parking-primary' : 'bg-asphalt-100 dark:bg-asphalt-800'}`} />}
                  </div>
                ))}
              </div>

              {/* Scrollable form body */}
              <form onSubmit={handleZoneFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                {zoneFormError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 border border-red-200 rounded-lg text-xs font-bold">{zoneFormError}</div>
                )}

                <AnimatePresence mode="wait">
                  {/* Step 1 — Location */}
                  {zoneFormStep === 1 && (
                    <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Lot Name *</label>
                          <input value={zoneForm.name} onChange={e => setZoneForm(p => ({ ...p, name: e.target.value }))} required className="form-input mt-1.5" placeholder="e.g. Metro Plaza Garage" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Parking Type *</label>
                          <select value={zoneForm.parkingType} onChange={e => setZoneForm(p => ({ ...p, parkingType: e.target.value }))} className="form-input mt-1.5 bg-white dark:bg-asphalt-900">
                            {PARKING_TYPES.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-asphalt-450 uppercase">Full Address *</label>
                        <input value={zoneForm.address} onChange={e => setZoneForm(p => ({ ...p, address: e.target.value }))} required className="form-input mt-1.5" placeholder="Street, Area, Sector" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Landmark</label>
                          <input value={zoneForm.landmark} onChange={e => setZoneForm(p => ({ ...p, landmark: e.target.value }))} className="form-input mt-1.5" placeholder="Near XYZ Mall" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">City *</label>
                          <input value={zoneForm.city} onChange={e => setZoneForm(p => ({ ...p, city: e.target.value }))} required className="form-input mt-1.5" placeholder="e.g. Noida" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">State *</label>
                          <input value={zoneForm.state} onChange={e => setZoneForm(p => ({ ...p, state: e.target.value }))} required className="form-input mt-1.5" placeholder="e.g. Uttar Pradesh" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">PIN Code *</label>
                          <input value={zoneForm.pinCode} onChange={e => setZoneForm(p => ({ ...p, pinCode: e.target.value }))} required className="form-input mt-1.5" placeholder="e.g. 201301" />
                        </div>
                      </div>

                      {/* Location search */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-asphalt-450 uppercase">Search Location on Map</label>
                        <div className="flex gap-2">
                          <input value={locationSearch} onChange={e => setLocationSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleLocationSearch())} className="form-input flex-1" placeholder="Search any place..." />
                          <button type="button" onClick={handleLocationSearch} disabled={locationSearching} className="btn-secondary py-2 px-3 text-xs font-bold flex items-center gap-1 shadow-none shrink-0">
                            {locationSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                          </button>
                          <button type="button" onClick={handleDetectLocation} className="btn-secondary py-2 px-3 text-xs font-bold flex items-center gap-1 shadow-none shrink-0" title="Detect GPS Location">
                            <Navigation className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Verify Entrance Location (Drag Pin) */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-asphalt-450 uppercase">Verify Entrance Location (Drag Pin) *</label>
                        <div className="h-[220px] w-full rounded-xl overflow-hidden border border-asphalt-200 dark:border-asphalt-800 z-0 relative">
                          {zoneForm.lat && zoneForm.lng && (
                            <MapContainer
                              center={[parseFloat(zoneForm.lat), parseFloat(zoneForm.lng)]}
                              zoom={15}
                              style={{ height: '100%', width: '100%' }}
                              zoomControl={true}
                            >
                              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                              <ChangeMapCenter center={[parseFloat(zoneForm.lat), parseFloat(zoneForm.lng)]} />
                              <Marker
                                position={[parseFloat(zoneForm.lat), parseFloat(zoneForm.lng)]}
                                draggable={true}
                                icon={providerMapPinIcon}
                                eventHandlers={{
                                  dragend: handleMarkerDragEnd
                                }}
                              />
                            </MapContainer>
                          )}
                        </div>
                      </div>

                      {/* Lat / Lng display */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Latitude *</label>
                          <input type="number" step="any" value={zoneForm.lat} onChange={e => setZoneForm(p => ({ ...p, lat: e.target.value }))} required className="form-input mt-1.5 font-mono text-sm" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Longitude *</label>
                          <input type="number" step="any" value={zoneForm.lng} onChange={e => setZoneForm(p => ({ ...p, lng: e.target.value }))} required className="form-input mt-1.5 font-mono text-sm" />
                        </div>
                      </div>
                      <p className="text-[10px] text-asphalt-400 italic">📍 Verified entrance coordinates: {parseFloat(zoneForm.lat || 0).toFixed(6)}, {parseFloat(zoneForm.lng || 0).toFixed(6)} — Drag marker to adjust.</p>
                    </motion.div>
                  )}

                  {/* Step 2 — Lot Details */}
                  {zoneFormStep === 2 && (
                    <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">

                      {/* Vehicle Category Slot Capacity */}
                      <div>
                        <label className="text-[11px] font-bold text-asphalt-450 uppercase">Slot Capacity by Vehicle Category</label>
                        <p className="text-[10px] text-asphalt-400 mt-0.5 mb-2">Slots will be auto-generated with prefixes: <span className="font-mono text-parking-primary">B001</span> (Bike), <span className="font-mono text-parking-primary">S001</span> (Sedan), <span className="font-mono text-parking-primary">SUV001</span>, <span className="font-mono text-parking-primary">EV001</span></p>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { key: 'bikeSlots', label: '🏍️ Bike Slots', color: 'text-blue-600' },
                            { key: 'sedanSlots', label: '🚗 Sedan Slots', color: 'text-green-600' },
                            { key: 'suvSlots', label: '🚙 SUV Slots', color: 'text-orange-600' },
                            { key: 'evSlots', label: '⚡ EV Slots', color: 'text-purple-600' }
                          ].map(({ key, label, color }) => (
                            <div key={key} className="p-3 border border-asphalt-200 dark:border-asphalt-700 rounded-lg bg-white dark:bg-asphalt-900">
                              <label className={`text-[11px] font-bold ${color} uppercase`}>{label}</label>
                              <input
                                type="number"
                                min="0"
                                value={zoneForm[key]}
                                onChange={e => setZoneForm(p => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
                                className="form-input mt-1.5 text-center font-bold text-lg"
                                placeholder="0"
                              />
                            </div>
                          ))}
                        </div>
                        {/* Live total */}
                        {(() => {
                          const total = (parseInt(zoneForm.bikeSlots) || 0) + (parseInt(zoneForm.sedanSlots) || 0) + (parseInt(zoneForm.suvSlots) || 0) + (parseInt(zoneForm.evSlots) || 0);
                          return total > 0 ? (
                            <p className="mt-2 text-xs font-bold text-parking-primary">✓ Total slots: <span className="text-asphalt-700 dark:text-white">{total}</span></p>
                          ) : (
                            <div className="mt-2">
                              <p className="text-[11px] text-amber-600 font-medium">Or enter a total and slots will be auto-distributed:</p>
                              <input
                                type="number"
                                min="1"
                                value={zoneForm.totalSlots || ''}
                                onChange={e => setZoneForm(p => ({ ...p, totalSlots: parseInt(e.target.value) || 0 }))}
                                className="form-input mt-1 w-32"
                                placeholder="e.g. 50"
                              />
                            </div>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Total Area (sq.m)</label>
                          <input type="number" value={zoneForm.totalArea} onChange={e => setZoneForm(p => ({ ...p, totalArea: e.target.value }))} className="form-input mt-1.5" placeholder="e.g. 5000" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Floors</label>
                          <input type="number" min="1" value={zoneForm.floorsCount} onChange={e => setZoneForm(p => ({ ...p, floorsCount: parseInt(e.target.value) }))} className="form-input mt-1.5" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Entry Gates</label>
                          <input type="number" min="1" value={zoneForm.entryGatesCount} onChange={e => setZoneForm(p => ({ ...p, entryGatesCount: parseInt(e.target.value) }))} className="form-input mt-1.5" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Exit Gates</label>
                          <input type="number" min="1" value={zoneForm.exitGatesCount} onChange={e => setZoneForm(p => ({ ...p, exitGatesCount: parseInt(e.target.value) }))} className="form-input mt-1.5" />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Operating Hours</label>
                          <input value={zoneForm.operatingHours} onChange={e => setZoneForm(p => ({ ...p, operatingHours: e.target.value }))} className="form-input mt-1.5" placeholder="e.g. 6AM–11PM or 24/7" />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-asphalt-450 uppercase">Amenities & Facilities</label>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {AMENITIES.map(a => (
                            <label key={a} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs font-bold transition-all ${zoneForm.amenities.includes(a) ? 'bg-parking-primary/10 border-parking-primary text-parking-primary' : 'border-asphalt-200 dark:border-asphalt-800 text-asphalt-600 dark:text-asphalt-400 hover:bg-asphalt-50 dark:hover:bg-asphalt-900'}`}>
                              <input type="checkbox" checked={zoneForm.amenities.includes(a)}
                                onChange={e => setZoneForm(p => ({
                                  ...p,
                                  amenities: e.target.checked ? [...p.amenities, a] : p.amenities.filter(x => x !== a)
                                }))} className="sr-only" />
                              <CheckCircle className={`w-3.5 h-3.5 ${zoneForm.amenities.includes(a) ? 'text-parking-primary' : 'text-asphalt-300'}`} />
                              {a}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-asphalt-450 uppercase">Description</label>
                        <textarea rows="3" value={zoneForm.description} onChange={e => setZoneForm(p => ({ ...p, description: e.target.value }))} className="form-input mt-1.5 resize-none" placeholder="Describe your parking lot for drivers..." />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-asphalt-450 uppercase">Parking Rules (one per line)</label>
                        <textarea rows="2" value={zoneForm.rules} onChange={e => setZoneForm(p => ({ ...p, rules: e.target.value }))} className="form-input mt-1.5 resize-none" placeholder="e.g. No overnight parking&#10;Max height 2.5m" />
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3 — Pricing & Images */}
                  {zoneFormStep === 3 && (
                    <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                      <p className="text-xs font-bold text-asphalt-600 dark:text-asphalt-300 uppercase tracking-wider">Pricing Tiers (₹)</p>
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { key: 'hourlyPrice', label: 'Hourly Rate *' },
                          { key: 'dailyPrice', label: 'Daily Rate' },
                          { key: 'nightPrice', label: 'Night Rate' },
                          { key: 'weekendPrice', label: 'Weekend Rate' },
                          { key: 'festivalPrice', label: 'Festival Rate' },
                          { key: 'peakHourPrice', label: 'Peak Hour Rate' },
                          { key: 'extensionCharges', label: 'Extension Fee' },
                        ].map(({ key, label }) => (
                          <div key={key}>
                            <label className="text-[11px] font-bold text-asphalt-450 uppercase">{label}</label>
                            <input type="number" min="0" value={zoneForm[key]} onChange={e => setZoneForm(p => ({ ...p, [key]: parseFloat(e.target.value) }))} className="form-input mt-1.5" />
                          </div>
                        ))}
                        <div>
                          <label className="text-[11px] font-bold text-asphalt-450 uppercase">Penalty Rules</label>
                          <input value={zoneForm.penaltyRules} onChange={e => setZoneForm(p => ({ ...p, penaltyRules: e.target.value }))} className="form-input mt-1.5" placeholder="e.g. ₹2/minute" />
                        </div>
                      </div>

                      <p className="text-xs font-bold text-asphalt-600 dark:text-asphalt-300 uppercase tracking-wider pt-2">Image URLs</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { key: 'imageEntrance', label: 'Entrance' },
                          { key: 'imageExit', label: 'Exit Gate' },
                          { key: 'imageOverall', label: 'Overall View' },
                          { key: 'imageSlots', label: 'Slot Area' },
                          { key: 'imageEVCharging', label: 'EV Charging' },
                          { key: 'imageSecurity', label: 'Security Area' },
                        ].map(({ key, label }) => (
                          <div key={key}>
                            <label className="text-[11px] font-bold text-asphalt-450 uppercase">{label}</label>
                            <input value={zoneForm[key]} onChange={e => setZoneForm(p => ({ ...p, [key]: e.target.value }))} className="form-input mt-1.5 text-xs" placeholder="https://..." />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Navigation Buttons */}
                <div className="flex gap-3 pt-4 border-t border-asphalt-100 dark:border-asphalt-800">
                  {zoneFormStep > 1 && (
                    <button type="button" onClick={() => setZoneFormStep(s => s - 1)} className="btn-secondary py-3 px-4 text-sm font-bold shadow-none">
                      Back
                    </button>
                  )}
                  <button type="submit" disabled={creatingZone} className="flex-1 btn-primary py-3 font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-none">
                    {creatingZone ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {zoneFormStep < 3 ? 'Next Step →' : (zoneFormMode === 'create' ? 'Register Parking Lot' : 'Save Changes')}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DOCUMENT VERIFICATION MODAL */}
      <AnimatePresence>
        {showDocForm && verifyingZone && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-asphalt-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDocForm(false)}>
            <motion.form initial={{ scale: 0.97 }} animate={{ scale: 1 }} exit={{ scale: 0.97 }}
              onClick={e => e.stopPropagation()} onSubmit={handleVerifySubmit}
              className="bg-white dark:bg-parking-card rounded-2xl border border-asphalt-200 dark:border-asphalt-800 p-6 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-asphalt-100 dark:border-asphalt-800">
                <h3 className="text-base font-black text-asphalt-900 dark:text-white">Submit Ownership Documents</h3>
                <button type="button" onClick={() => setShowDocForm(false)} className="p-1 hover:bg-asphalt-100 dark:hover:bg-asphalt-800 rounded-lg text-asphalt-450"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-asphalt-500">Submit legal proof of ownership or lease for <strong>{verifyingZone.name}</strong>.</p>
              <div>
                <label className="text-[11px] font-bold text-asphalt-450 uppercase">Document Type</label>
                <select value={docType} onChange={e => setDocType(e.target.value)} className="form-input mt-1.5 bg-white dark:bg-asphalt-900">
                  <option>Parking Ownership Proof</option>
                  <option>Identity Document / Gov ID</option>
                  <option>Business Lease / License</option>
                  <option>Property Tax Receipt</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-asphalt-450 uppercase">Document URL / Path</label>
                <input value={docUrl} onChange={e => setDocUrl(e.target.value)} required className="form-input mt-1.5" placeholder="https://..." />
              </div>
              <button type="submit" disabled={docSaving} className="w-full btn-primary py-3 font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-none">
                {docSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Submit for Review
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SLOT MANAGER DRAWER */}
      <AnimatePresence>
        {selectedZone && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-asphalt-950/40 dark:bg-asphalt-950/70 backdrop-blur-sm z-50 flex items-center justify-end"
            onClick={() => setSelectedZone(null)}>
            <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-parking-card w-full max-w-lg h-full flex flex-col shadow-2xl border-l border-asphalt-200 dark:border-asphalt-800">

              {/* Drawer Header */}
              <div className="p-5 border-b border-asphalt-100 dark:border-asphalt-800 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-asphalt-900 dark:text-white">Slot Manager</h3>
                    <p className="text-xs text-asphalt-400">{selectedZone.name} · {slots.length} slots total</p>
                  </div>
                  <button onClick={() => setSelectedZone(null)} className="p-2 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-800 text-asphalt-450"><X className="w-5 h-5" /></button>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                  {[
                    { label: 'Available', val: slots.filter(s => getSlotStatus(s) === 'Available').length, color: 'text-emerald-600' },
                    { label: 'Occupied', val: slots.filter(s => getSlotStatus(s) === 'Occupied').length, color: 'text-red-500' },
                    { label: 'Maintenance', val: slots.filter(s => getSlotStatus(s) === 'Maintenance').length, color: 'text-amber-500' },
                    { label: 'Offline', val: slots.filter(s => getSlotStatus(s) === 'Offline').length, color: 'text-gray-400' },
                  ].map((s, i) => (
                    <div key={i} className="p-2 bg-asphalt-50 dark:bg-asphalt-900/40 rounded-lg">
                      <p className={`text-base font-black ${s.color}`}>{s.val}</p>
                      <p className="text-[9px] font-bold text-asphalt-400 uppercase">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Slot Button */}
              <div className="px-5 py-3 border-b border-asphalt-100 dark:border-asphalt-800 flex gap-2 items-center flex-shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-asphalt-400" />
                  <input value={slotSearch} onChange={e => setSlotSearch(e.target.value)} className="form-input pl-8 py-2 text-xs w-full" placeholder="Search slot ID..." />
                </div>
                <button onClick={() => { setShowSlotForm(!showSlotForm); setEditingSlot(null); setSlotForm(emptySlotForm()); setSlotError(''); }} className="btn-primary py-2 px-3 text-xs font-bold shadow-none flex items-center gap-1 shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add Slot
                </button>
              </div>

              {/* Inline Slot Form */}
              <AnimatePresence>
                {showSlotForm && (
                  <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleSlotFormSubmit}
                    className="px-5 py-4 border-b border-asphalt-100 dark:border-asphalt-800 bg-asphalt-50/50 dark:bg-asphalt-900/20 overflow-hidden flex-shrink-0 space-y-3">
                    <h4 className="text-[10px] font-bold text-asphalt-450 uppercase tracking-wider">{editingSlot ? `Editing: ${editingSlot.slotIdentifier}` : 'New Slot'}</h4>
                    {slotError && <div className="p-2 bg-red-50 dark:bg-red-950/20 text-red-700 border border-red-200 rounded text-xs">{slotError}</div>}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-asphalt-400 uppercase">Slot ID *</label>
                        <input value={slotForm.slotIdentifier} onChange={e => setSlotForm(p => ({ ...p, slotIdentifier: e.target.value }))} required disabled={!!editingSlot} className="form-input mt-1 py-2 text-xs uppercase" placeholder="e.g. A-01" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-asphalt-400 uppercase">Vehicle Category</label>
                        <select value={slotForm.vehicleCategory} onChange={e => setSlotForm(p => ({ ...p, vehicleCategory: e.target.value }))} className="form-input mt-1 py-2 text-xs bg-white dark:bg-asphalt-900">
                          {VEHICLE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-asphalt-400 uppercase">Dimensions</label>
                        <input value={slotForm.dimensions} onChange={e => setSlotForm(p => ({ ...p, dimensions: e.target.value }))} className="form-input mt-1 py-2 text-xs" placeholder="5m x 2.5m" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-asphalt-400 uppercase">Floor</label>
                        <input value={slotForm.floor} onChange={e => setSlotForm(p => ({ ...p, floor: e.target.value }))} className="form-input mt-1 py-2 text-xs" placeholder="Ground / B1 / F2" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'isEV', label: '⚡ EV Charger' },
                        { key: 'isReserved', label: '👑 Reserved' },
                        { key: 'isEmergency', label: '🚨 Emergency' },
                        { key: 'isCovered', label: '🏠 Covered' },
                        { key: 'isActive', label: '✅ Active' },
                        { key: 'isBlocked', label: '🔒 Blocked' },
                      ].map(({ key, label }) => (
                        <label key={key} className={`flex items-center gap-1.5 p-2 rounded-lg border cursor-pointer text-[10px] font-bold transition ${slotForm[key] ? 'bg-parking-primary/10 border-parking-primary text-parking-primary' : 'border-asphalt-200 dark:border-asphalt-800 text-asphalt-500'}`}>
                          <input type="checkbox" checked={slotForm[key]} onChange={e => setSlotForm(p => ({ ...p, [key]: e.target.checked }))} className="sr-only" />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowSlotForm(false); setEditingSlot(null); setSlotForm(emptySlotForm()); }} className="flex-1 btn-secondary py-2 text-xs font-bold shadow-none">Cancel</button>
                      <button type="submit" className="flex-1 btn-primary py-2 text-xs font-bold shadow-none">{editingSlot ? 'Update Slot' : 'Create Slot'}</button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Slots List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {loadingSlots ? (
                  <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-parking-primary" /></div>
                ) : (
                  slots
                    .filter(s => !slotSearch || s.slotIdentifier.toLowerCase().includes(slotSearch.toLowerCase()))
                    .map(slot => {
                      const status = getSlotStatus(slot);
                      return (
                        <div key={slot._id} className="p-3 border border-asphalt-200 dark:border-asphalt-800 rounded-xl bg-asphalt-50/50 dark:bg-asphalt-900/20 hover:border-parking-primary/30 transition-all group">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${SLOT_STATUS_COLOR[status] || 'bg-gray-400'}`} />
                              <span className="font-black text-sm text-asphalt-900 dark:text-white">{slot.slotIdentifier}</span>
                              <span className="text-[9px] font-bold text-asphalt-400 bg-asphalt-100 dark:bg-asphalt-900 px-1.5 py-0.5 rounded">{slot.vehicleCategory || 'Sedan'}</span>
                              {slot.isEV && <span className="badge-emerald py-0 px-1.5 text-[8px] font-bold">⚡EV</span>}
                              {slot.isReserved && <span className="badge-yellow py-0 px-1.5 text-[8px] font-bold">VIP</span>}
                              {slot.isEmergency && <span className="badge-red py-0 px-1.5 text-[8px] font-bold">🚨</span>}
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${status === 'Available' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : status === 'Occupied' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' : status === 'Maintenance' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' : 'bg-gray-100 text-gray-600 dark:bg-gray-800'}`}>{status}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-[10px] text-asphalt-400">
                            <span>{slot.floor || 'Ground'}</span>
                            <span>·</span>
                            <span>{slot.dimensions || 'Standard'}</span>
                            {slot.isCovered && <><span>·</span><span>Covered</span></>}
                          </div>
                          {/* Quick action buttons */}
                          <div className="flex gap-1.5 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEditSlot(slot)} className="flex-1 py-1 text-[9px] font-bold border border-asphalt-200 dark:border-asphalt-800 rounded hover:bg-asphalt-100 dark:hover:bg-asphalt-800 text-asphalt-600 dark:text-asphalt-300 flex items-center justify-center gap-1">
                              <Edit2 className="w-3 h-3" /> Edit
                            </button>
                            <button onClick={() => handleToggleSlotFlag(slot, 'isActive')} className={`flex-1 py-1 text-[9px] font-bold border rounded flex items-center justify-center gap-1 ${slot.isActive ? 'border-amber-200 text-amber-600 hover:bg-amber-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                              {slot.isActive ? <><WifiOff className="w-3 h-3" /> Disable</> : <><Wifi className="w-3 h-3" /> Enable</>}
                            </button>
                            <button onClick={() => handleToggleSlotFlag(slot, 'isBlocked')} className={`flex-1 py-1 text-[9px] font-bold border rounded flex items-center justify-center gap-1 ${slot.isBlocked ? 'border-blue-200 text-blue-600 hover:bg-blue-50' : 'border-purple-200 text-purple-600 hover:bg-purple-50'}`}>
                              {slot.isBlocked ? <><Unlock className="w-3 h-3" /> Unblock</> : <><Lock className="w-3 h-3" /> Block</>}
                            </button>
                            <button onClick={() => handleToggleSlotFlag(slot, 'isUnderMaintenance')} className={`flex-1 py-1 text-[9px] font-bold border rounded flex items-center justify-center gap-1 ${slot.isUnderMaintenance ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
                              <Wrench className="w-3 h-3" /> {slot.isUnderMaintenance ? 'Fixed' : 'Maint.'}
                            </button>
                            <button onClick={() => handleDeleteSlot(slot._id)} className="py-1 px-2 text-[9px] font-bold border border-red-200 text-parking-danger hover:bg-red-50 rounded flex items-center">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProviderDashboard;
