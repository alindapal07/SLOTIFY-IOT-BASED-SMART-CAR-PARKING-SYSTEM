import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { Wrench, Zap, Check, ParkingSquare } from 'lucide-react';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/index.jsx';
import { useStore } from '../../store/useStore';
import {
  MapPin, Clock, CheckCircle2, XCircle, Loader2, Navigation, AlertCircle,
  Heart, Search, Filter, X, LocateFixed, Star, Car, Bike, Shield, Wifi, ChevronDown,
  CalendarCheck, ArrowRight, Timer
} from 'lucide-react';
import api from '../../services/api';
import { socket } from '../../services/socket';

// ── Utility: calculate distance between two lat/lng points (Haversine) ──
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Utility: format distance ──
const formatDistance = (km) => {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
};

// ── Utility: estimate driving ETA at ~30 km/h city speed ──
const formatETA = (km) => {
  const minutes = Math.round((km / 30) * 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

// ── Marker icon factory (memoizable) ──
const createZoneIcon = (availableSlots, totalSlots, isSelected) => {
  const ratio = totalSlots > 0 ? availableSlots / totalSlots : 0;
  let bg, border;
  if (isSelected) { bg = '#2563eb'; border = '#1d4ed8'; }
  else if (availableSlots === 0) { bg = '#dc2626'; border = '#b91c1c'; }
  else if (ratio <= 0.3) { bg = '#eab308'; border = '#ca8a04'; }
  else { bg = '#16a34a'; border = '#15803d'; }

  return L.divIcon({
    className: 'zone-marker',
    html: `<div style="
      background:${bg};color:white;padding:5px 10px;border-radius:8px;
      font-weight:800;font-size:11px;text-align:center;
      box-shadow:0 2px 10px rgba(0,0,0,0.18);white-space:nowrap;
      border:2px solid ${border};min-width:40px;
      transform:${isSelected ? 'scale(1.15)' : 'scale(1)'};
      transition:transform 0.2s;
    ">${availableSlots}/${totalSlots}</div>`,
    iconSize: [60, 32],
    iconAnchor: [30, 32],
    popupAnchor: [0, -34]
  });
};

const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div style="position:relative;width:18px;height:18px;">
    <div style="position:absolute;inset:0;background:rgba(37,99,235,0.15);border-radius:50%;animation:pulse 2s infinite;"></div>
    <div style="position:absolute;inset:3px;background:#2563eb;border:2.5px solid white;border-radius:50%;box-shadow:0 0 8px rgba(37,99,235,0.5);"></div>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

// ── Sub-component: handles map invalidation, centering, and resize ──
const MapController = ({ position, selectedZonePos }) => {
  const map = useMap();

  // Fix Leaflet sizing glitch: watch the actual container element for real
  // size changes (layout reflows, sidebar animating in, etc.), not just
  // window resize events. This is what prevents the grey "half-rendered
  // map" bug when Leaflet mounts before its parent has settled to full size.
  useEffect(() => {
    const container = map.getContainer();

    // Catch the common case immediately and shortly after mount
    map.invalidateSize();
    const initialTimer = setTimeout(() => map.invalidateSize(), 300);

    // Debounced ResizeObserver: fires on ANY real size change of the map's
    // own container, regardless of what caused it.
    let debounceTimer = null;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => map.invalidateSize(), 100);
    });
    resizeObserver.observe(container);

    // Keep the window listener too, as a cheap extra safety net
    const handleWindowResize = () => map.invalidateSize();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(debounceTimer);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [map]);

  // Fly to selected zone if one is clicked
  useEffect(() => {
    if (selectedZonePos) {
      map.flyTo(selectedZonePos, 15, { duration: 0.8 });
    } else if (position) {
      map.flyTo(position, 13, { duration: 1 });
    }
  }, [selectedZonePos, position, map]);

  return null;
};

// ── Sub-component: "Locate Me" button ──
const LocateButton = ({ onLocate }) => (
  <button
    onClick={onLocate}
    className="absolute bottom-4 right-4 z-[1000] bg-white dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-700 rounded-lg p-2.5 shadow-md hover:shadow-lg transition-all hover:bg-asphalt-50 dark:hover:bg-asphalt-800"
    title="Center on my location"
  >
    <LocateFixed className="w-4.5 h-4.5 text-parking-primary" />
  </button>
);

// ── Filter/Search constants ──
const FILTER_OPTIONS = {
  sortBy: [
    { value: 'distance', label: 'Distance' },
    { value: 'price_low', label: 'Price: Low → High' },
    { value: 'price_high', label: 'Price: High → Low' },
    { value: 'rating', label: 'Rating' },
    { value: 'availability', label: 'Availability' }
  ],
  amenities: ['CCTV', 'Covered', 'EV Charging', 'Security Camera', 'Valet'],
};

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════
const ParkingMap = () => {
  const { t } = useI18n();
  const { user, updateWalletBalance } = useStore();
  const navigate = useNavigate();

  // ── Core state ──
  const [userPos, setUserPos] = useState(null);
  const [zones, setZones] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [hours, setHours] = useState(1);
  const [bookingState, setBookingState] = useState('idle');
  const [bookingResult, setBookingResult] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('locating');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingZones, setLoadingZones] = useState(true);
  const [savedVehicles, setSavedVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  // Phase 23C: Active booking detection
  const [activeBooking, setActiveBooking] = useState(null);
  const [showActiveBookingBanner, setShowActiveBookingBanner] = useState(true);
  const [loadingActiveBooking, setLoadingActiveBooking] = useState(true);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const { data } = await api.get('/vehicles');
        setSavedVehicles(data || []);
        if (data && data.length > 0) {
          setSelectedVehicleId(data[0]._id);
        }
      } catch (err) {
        console.error('Failed to fetch vehicles:', err);
      }
    };
    fetchVehicles();
  }, []);

  // Phase 23C: Fetch active booking on mount
  useEffect(() => {
    const fetchActiveBooking = async () => {
      setLoadingActiveBooking(true);
      try {
        const { data } = await api.get('/bookings/active');
        setActiveBooking(data && data._id ? data : null);
      } catch {
        setActiveBooking(null);
      } finally {
        setLoadingActiveBooking(false);
      }
    };
    fetchActiveBooking();
  }, []);

  // Phase 23C: Auto-redirect driver to dashboard 5 seconds after success
  useEffect(() => {
    if (showConfirmModal && bookingResult) {
      const timer = setTimeout(() => {
        setShowConfirmModal(false);
        navigate('/driver');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showConfirmModal, bookingResult, navigate]);

  // ── Search & Filter state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('distance');
  const [filterEV, setFilterEV] = useState(false);
  const [filterCovered, setFilterCovered] = useState(false);
  const [filter247, setFilter247] = useState(false);
  const [maxPrice, setMaxPrice] = useState(500);
  const [minRating, setMinRating] = useState(0);

  // ── Real-time place search suggestions (Nominatim) ──
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const debounceRef = useRef(null);
  const suggestionBoxRef = useRef(null);

  const mapRef = useRef(null);

  // ═══════════════════════════════════════
  // STEP 3: GEOLOCATION
  // ═══════════════════════════════════════
  useEffect(() => {
    const fallbackIPGeolocation = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        if (response.ok) {
          const data = await response.json();
          if (data && data.latitude && data.longitude) {
            setUserPos([data.latitude, data.longitude]);
            setGpsStatus('ip_fallback');
            return;
          }
        }
      } catch (err) {
        console.warn('IP Geolocation fallback failed:', err);
      }
      setUserPos([22.5726, 88.3639]); // Fallback: Kolkata
      setGpsStatus('unsupported');
    };

    if (!navigator.geolocation) {
      fallbackIPGeolocation();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
        setGpsStatus('found');
      },
      (error) => {
        console.warn('Geolocation error:', error.message);
        fallbackIPGeolocation();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, []);

  // ═══════════════════════════════════════
  // STEP 4: LOAD PARKING DATA
  // ═══════════════════════════════════════
  useEffect(() => {
    if (!userPos) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoadingZones(true);
      try {
        let zonesData = [];
        const [searchRes, favsRes] = await Promise.all([
          api.get(`/parking/search?lat=${userPos[0]}&lng=${userPos[1]}&radius=50000`).catch(() => null),
          api.get('/parking/favorites').catch(() => ({ data: [] }))
        ]);

        if (searchRes && searchRes.data && searchRes.data.length > 0) {
          zonesData = searchRes.data;
        } else {
          const allRes = await api.get('/parking/zones/all').catch(() => ({ data: [] }));
          zonesData = allRes.data || [];
        }

        if (!cancelled) {
          setZones(zonesData);
          setFavorites(favsRes.data || []);
        }
      } catch {
        if (!cancelled) { setZones([]); setFavorites([]); }
      } finally {
        if (!cancelled) setLoadingZones(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [userPos]);

  // ═══════════════════════════════════════
  // STEP 5: REAL-TIME PLACE SEARCH SUGGESTIONS
  // ═══════════════════════════════════════
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = searchQuery.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestionLoading(false);
      return;
    }

    setSuggestionLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`
        );
        if (response.ok) {
          const results = await response.json();
          setSuggestions(results);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error('Suggestion fetch failed:', err);
        setSuggestions([]);
      } finally {
        setSuggestionLoading(false);
      }
    }, 350); // debounce so we don't hammer Nominatim on every keystroke

    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  // Close suggestion dropdown when clicking outside the search box
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // When a suggestion is picked, recenter the map on that real place
  const handleSuggestionSelect = useCallback((place) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      setUserPos([lat, lng]);
      setGpsStatus('found');
    }
    setSearchQuery(place.display_name.split(',')[0]);
    setShowSuggestions(false);
    setSuggestions([]);
  }, []);

  // ═══════════════════════════════════════
  // STEP 6: REAL-TIME SOCKET UPDATES
  // ═══════════════════════════════════════
  useEffect(() => {
    if (!selectedZone?._id) return;
    if (!socket.connected) socket.connect();

    socket.emit('JOIN_ZONE_ROOM', selectedZone._id);

    const handleSlotOccupied = (data) => {
      setSlots(prev => prev.map(s =>
        (s._id === data.slotId || s.slotIdentifier === data.slot)
          ? { ...s, isOccupied: true } : s
      ));
    };

    const handleSlotFreed = (data) => {
      setSlots(prev => prev.map(s =>
        (s._id === data.slotId || s.slotIdentifier === data.slot)
          ? { ...s, isOccupied: false } : s
      ));
    };

    // Listen to all relevant events the backend emits
    socket.on('SLOT_OCCUPIED', handleSlotOccupied);
    socket.on('SLOT_FREED', handleSlotFreed);
    socket.on('BOOKING_CREATED', handleSlotOccupied);
    socket.on('BOOKING_CANCELLED', handleSlotFreed);

    return () => {
      socket.emit('LEAVE_ZONE_ROOM', selectedZone._id);
      socket.off('SLOT_OCCUPIED', handleSlotOccupied);
      socket.off('SLOT_FREED', handleSlotFreed);
      socket.off('BOOKING_CREATED', handleSlotOccupied);
      socket.off('BOOKING_CANCELLED', handleSlotFreed);
    };
  }, [selectedZone?._id]);

  // ── Real-time new zone updates + Phase 23C booking events ──
  useEffect(() => {
    if (!socket.connected) socket.connect();
    const handleZoneCreated = (zone) => {
      setZones(prev => [zone, ...prev]);
    };
    const handleZoneUpdated = (zone) => {
      // Remove closed/archived zones from map immediately
      if (zone.status !== 'Active' || zone.isArchived) {
        setZones(prev => prev.filter(z => z._id !== zone._id));
      } else {
        setZones(prev => prev.map(z => z._id === zone._id ? { ...z, ...zone } : z));
      }
    };
    // Phase 23C: Sync active booking on real-time events
    const refreshActiveBooking = async () => {
      try {
        const { data } = await api.get('/bookings/active');
        setActiveBooking(data && data._id ? data : null);
      } catch { setActiveBooking(null); }
    };
    socket.on('ZONE_CREATED', handleZoneCreated);
    socket.on('ZONE_UPDATED', handleZoneUpdated);
    socket.on('BOOKING_CREATED', refreshActiveBooking);
    socket.on('BOOKING_CANCELLED', refreshActiveBooking);
    socket.on('BOOKING_COMPLETED', refreshActiveBooking);
    socket.on('BOOKING_EXTENDED', refreshActiveBooking);
    return () => {
      socket.off('ZONE_CREATED', handleZoneCreated);
      socket.off('ZONE_UPDATED', handleZoneUpdated);
      socket.off('BOOKING_CREATED', refreshActiveBooking);
      socket.off('BOOKING_CANCELLED', refreshActiveBooking);
      socket.off('BOOKING_COMPLETED', refreshActiveBooking);
      socket.off('BOOKING_EXTENDED', refreshActiveBooking);
    };
  }, []);

  // ═══════════════════════════════════════
  // STEP 7: SEARCH & FILTER (computed)
  // ═══════════════════════════════════════
  const processedZones = useMemo(() => {
    let result = zones.map(z => {
      const lat = z.location?.coordinates?.[1];
      const lng = z.location?.coordinates?.[0];
      const dist = userPos ? haversineDistance(userPos[0], userPos[1], lat, lng) : 999;
      return { ...z, _dist: dist, _eta: formatETA(dist), _distLabel: formatDistance(dist) };
    });

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(z =>
        z.name?.toLowerCase().includes(q) ||
        z.address?.toLowerCase().includes(q)
      );
    }

    // Filters
    if (filterEV) result = result.filter(z => z.amenities?.includes('EV Charging') || z.vehicleTypesAllowed?.includes('EV'));
    if (filterCovered) result = result.filter(z => z.amenities?.includes('Covered'));
    if (filter247) result = result.filter(z => z.operatingHours === '24/7');
    result = result.filter(z => z.basePricePerHour <= maxPrice);
    if (minRating > 0) result = result.filter(z => (z.rating || 0) >= minRating);

    // Sort
    switch (sortBy) {
      case 'distance': result.sort((a, b) => a._dist - b._dist); break;
      case 'price_low': result.sort((a, b) => a.basePricePerHour - b.basePricePerHour); break;
      case 'price_high': result.sort((a, b) => b.basePricePerHour - a.basePricePerHour); break;
      case 'rating': result.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case 'availability': result.sort((a, b) => b.availableSlots - a.availableSlots); break;
    }

    return result;
  }, [zones, searchQuery, filterEV, filterCovered, filter247, maxPrice, minRating, sortBy, userPos]);

  // ═══════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════
  const handleZoneClick = useCallback(async (zone) => {
    setSelectedZone(zone);
    setSelectedSlot(null);
    setBookingState('idle');
    setBookingResult(null);
    setLoadingSlots(true);
    try {
      const { data } = await api.get(`/parking/zones/${zone._id}/slots`);
      setSlots(data || []);
    } catch { setSlots([]); }
    finally { setLoadingSlots(false); }
  }, []);

  const handleToggleFavorite = useCallback(async () => {
    if (!selectedZone) return;
    try {
      await api.post('/parking/favorites/toggle', { zoneId: selectedZone._id });
      setFavorites(prev =>
        prev.some(f => f._id === selectedZone._id)
          ? prev.filter(f => f._id !== selectedZone._id)
          : [...prev, selectedZone]
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }, [selectedZone]);

  const handleBook = useCallback(async () => {
    if (!selectedSlot || !selectedZone || !selectedVehicleId) return;
    setBookingState('booking');
    try {
      const { data } = await api.post('/bookings/initiate', {
        zoneId: selectedZone._id,
        slotId: selectedSlot._id,
        hours,
        vehicleId: selectedVehicleId
      });
      setBookingState('success');
      setBookingResult(data);
      updateWalletBalance(data.newBalance);
      setActiveBooking(data.booking || data);
      setShowConfirmModal(true);  // Phase 23C: show rich confirmation popup

      // Refresh zone and slot data
      const [zonesRes, slotsRes] = await Promise.all([
        userPos
          ? api.get(`/parking/search?lat=${userPos[0]}&lng=${userPos[1]}&radius=50000`)
              .catch(() => api.get('/parking/zones/all'))
          : api.get('/parking/zones/all'),
        api.get(`/parking/zones/${selectedZone._id}/slots`)
      ]);
      setZones(zonesRes.data || []);
      setSlots(slotsRes.data || []);
      setSelectedSlot(null);
    } catch (err) {
      setBookingState('error');
      setBookingResult({ message: err.response?.data?.message || 'Booking failed' });
    }
  }, [selectedSlot, selectedZone, hours, userPos, updateWalletBalance, selectedVehicleId]);

  const handleJoinQueue = useCallback(async () => {
    if (!selectedZone || !selectedVehicleId) return;
    setBookingState('booking');
    try {
      await api.post('/queue/join', {
        zoneId: selectedZone._id,
        vehicleId: selectedVehicleId
      });
      setBookingState('idle');
      alert('Successfully joined the waiting queue! You can track your real-time position on your dashboard.');
      navigate('/driver');
    } catch (err) {
      setBookingState('error');
      setBookingResult({ message: err.response?.data?.message || 'Failed to join queue' });
    }
  }, [selectedZone, selectedVehicleId, navigate]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(newPos);
        setGpsStatus('found');
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedZone(null);
    setSlots([]);
    setSelectedSlot(null);
    setBookingState('idle');
    setBookingResult(null);
  }, []);

  // ── Derived values ──
  const defaultCenter = userPos || [28.6139, 77.2090];
  const isFavorite = selectedZone && favorites.some(f => f._id === selectedZone._id);
  const selectedZonePos = useMemo(() => {
    if (!selectedZone?.location?.coordinates) return null;
    return [selectedZone.location.coordinates[1], selectedZone.location.coordinates[0]];
  }, [selectedZone]);

  const freeSlots = useMemo(() => slots.filter(s => !s.isOccupied), [slots]);
  const occupiedSlots = useMemo(() => slots.filter(s => s.isOccupied), [slots]);

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  // ── Phase 23C: Booking Confirmation Modal ──────────────────────────────────
  const ConfirmationModal = () => {
    if (!showConfirmModal || !bookingResult) return null;
    const b = bookingResult.booking || bookingResult;
    const startTime = b.startTime ? new Date(b.startTime) : new Date();
    const endTime = b.endTime ? new Date(b.endTime) : new Date(startTime.getTime() + (b.hours || hours) * 3600000);
    const fmt = (d) => d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    
    // Auto redirect setup inside a useEffect in the parent component, but we also can handle actions here.
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          className="bg-white dark:bg-asphalt-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-asphalt-100 dark:border-asphalt-800"
        >
          {/* Header */}
          <div className="bg-gradient-to-br from-parking-primary to-blue-600 p-5 text-white text-center relative">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <CalendarCheck className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Booking Confirmed! 🎉</h2>
            <p className="text-blue-100 text-xs mt-1">Redirecting to dashboard in a few seconds...</p>
          </div>
          {/* Details */}
          <div className="p-5 space-y-3 max-h-[350px] overflow-y-auto">
            {[
              { label: 'Booking ID', value: `#${(b._id || '').slice(-8).toUpperCase()}` },
              { label: 'Parking', value: b.zoneId?.name || selectedZone?.name || '—' },
              { label: 'Slot', value: b.slotId?.slotIdentifier || selectedSlot?.slotIdentifier || '—' },
              { label: 'Vehicle', value: savedVehicles.find(v => v._id === selectedVehicleId)?.licensePlate || '—' },
              { label: 'Entry Time', value: fmt(startTime) },
              { label: 'Exit Time', value: fmt(endTime) },
              { label: 'Duration', value: `${b.hours || hours} hour${(b.hours || hours) > 1 ? 's' : ''}` },
              { label: 'Amount Paid', value: `₹${(b.totalCost || 0).toLocaleString()}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center text-sm border-b border-asphalt-100 dark:border-asphalt-805 pb-2 last:border-0">
                <span className="text-asphalt-500 dark:text-asphalt-400 font-medium">{label}</span>
                <span className="font-bold text-asphalt-900 dark:text-white">{value}</span>
              </div>
            ))}
          </div>
          {/* Actions */}
          <div className="px-5 pb-5 flex flex-col gap-2">
            <button
              onClick={() => { setShowConfirmModal(false); navigate(`/driver/booking-confirmation/${b._id}`); }}
              className="w-full btn-primary py-2.5 text-sm font-bold flex items-center justify-center gap-2"
            >
              View Booking Ticket
            </button>
            <button
              onClick={() => { setShowConfirmModal(false); navigate('/driver'); }}
              className="w-full btn-secondary py-2.5 text-sm font-bold flex items-center justify-center gap-2 border border-asphalt-200 dark:border-asphalt-800"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => { setShowConfirmModal(false); navigate('/driver'); }}
              className="w-full py-2 text-xs font-semibold text-asphalt-500 hover:text-asphalt-700 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <>
    {/* Phase 23C: Booking Confirmation Modal */}
    <ConfirmationModal />

    <div className="flex flex-col lg:flex-row gap-3 lg:h-[calc(100vh-120px)] min-h-[500px] -mt-2 px-1 sm:px-3">

      {/* ════════════ LEFT: MAP ════════════ */}
      <div className="h-[380px] lg:h-full lg:flex-1 rounded-xl overflow-hidden border border-asphalt-200 dark:border-asphalt-800/80 relative shadow-soft">

        {/* Phase 23C: Active Booking Banner */}
        <AnimatePresence>
          {!loadingActiveBooking && activeBooking && showActiveBookingBanner && (() => {
            const coordinates = activeBooking.zoneId?.location?.coordinates || [];
            const lat = coordinates[1];
            const lng = coordinates[0];
            const timeRemaining = Math.max(0, Math.floor((new Date(activeBooking.endTime) - Date.now()) / 60000));
            const remainingText = timeRemaining > 0 
              ? `${Math.floor(timeRemaining / 60)}h ${timeRemaining % 60}m remaining` 
              : 'Expired';

            return (
              <motion.div
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -60, opacity: 0 }}
                className="absolute top-3 left-3 right-3 z-[1100] bg-white dark:bg-asphalt-900 border border-parking-primary/30 dark:border-asphalt-800 rounded-xl shadow-lg overflow-hidden text-asphalt-900 dark:text-white"
              >
                <div className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-parking-primary/10 text-parking-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Car className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-parking-primary bg-parking-primary/10 px-2 py-0.5 rounded">
                          My Active Booking
                        </span>
                        <span className="text-[10px] font-bold text-asphalt-400">
                          {activeBooking.status}
                        </span>
                      </div>
                      <p className="font-bold text-sm truncate mt-1">{activeBooking.zoneId?.name || 'Parking Zone'}</p>
                      <p className="text-xs text-asphalt-500 dark:text-asphalt-400 mt-0.5">
                        Slot: <span className="font-bold">{activeBooking.slotId?.slotIdentifier || '—'}</span> &bull; {remainingText}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={() => navigate(`/driver/booking-confirmation/${activeBooking._id}`)}
                      className="bg-parking-primary text-white font-bold text-xs px-3.5 py-1.5 rounded-lg hover:bg-parking-primary-hover transition-colors"
                    >
                      View Booking
                    </button>
                    {lat && lng && (
                      <button
                        onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank')}
                        className="bg-asphalt-100 dark:bg-asphalt-800 text-asphalt-700 dark:text-asphalt-200 font-bold text-xs px-3.5 py-1.5 rounded-lg hover:bg-asphalt-200 dark:hover:bg-asphalt-700 transition-colors flex items-center gap-1"
                      >
                        <Navigation className="w-3 h-3" /> Navigate
                      </button>
                    )}
                    <button
                      onClick={() => setShowActiveBookingBanner(false)}
                      className="text-xs font-semibold text-asphalt-450 hover:text-asphalt-600 transition-colors px-2 py-1.5"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>


        {/* GPS Status Banner */}
        <AnimatePresence>
          {gpsStatus === 'locating' && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-parking-primary text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Detecting your location...
            </motion.div>
          )}
          {gpsStatus === 'denied' && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Location permission denied — showing Delhi
            </motion.div>
          )}
          {(gpsStatus === 'timeout' || gpsStatus === 'unavailable') && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Could not detect location — using fallback
            </motion.div>
          )}
        </AnimatePresence>

        {/* Zone count badge */}
        <div className="absolute top-3 right-3 z-[1000] bg-white/95 dark:bg-asphalt-900/95 backdrop-blur-sm border border-asphalt-200 dark:border-asphalt-700 px-3 py-1.5 rounded-lg shadow-sm">
          <span className="text-[11px] font-bold text-asphalt-700 dark:text-asphalt-300">
            {loadingZones ? '...' : `${processedZones.length} zones`}
          </span>
        </div>

        {/* Leaflet Map */}
        <MapContainer
          center={defaultCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapController position={userPos} selectedZonePos={selectedZonePos} />

          {/* User location pulse marker */}
          {userPos && (
            <Marker position={userPos} icon={userLocationIcon}>
              <Popup><strong>📍 Your Location</strong></Popup>
            </Marker>
          )}

          {/* Zone markers with availability-based colors — guard against missing coords */}
          {processedZones.filter(zone =>
            Array.isArray(zone.location?.coordinates) &&
            zone.location.coordinates.length >= 2 &&
            !isNaN(zone.location.coordinates[0]) &&
            !isNaN(zone.location.coordinates[1])
          ).map(zone => {
            const pos = [zone.location.coordinates[1], zone.location.coordinates[0]];
            const isSelected = selectedZone?._id === zone._id;
            return (
              <Marker
                key={zone._id}
                position={pos}
                icon={createZoneIcon(zone.availableSlots, zone.totalSlots, isSelected)}
                eventHandlers={{ click: () => handleZoneClick(zone) }}
              >
                <Popup>
                  <div className="min-w-[180px] p-1">
                    <strong className="text-sm font-bold block text-asphalt-900 dark:text-white">{zone.name}</strong>
                    <p className="text-xs text-asphalt-500 mt-0.5">{zone.address}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className="font-bold text-parking-primary">₹{zone.basePricePerHour}/hr</span>
                      <span className={`font-bold ${zone.availableSlots > 0 ? 'text-parking-accent' : 'text-parking-danger'}`}>
                        {zone.availableSlots}/{zone.totalSlots} free
                      </span>
                    </div>
                    {zone._distLabel && (
                      <p className="text-[10px] text-asphalt-400 mt-1">
                        📍 {zone._distLabel} · ~{zone._eta}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Locate Me button */}
        <LocateButton onLocate={handleLocateMe} />
      </div>

      {/* ════════════ RIGHT: SIDE PANEL ════════════ */}
      <motion.div
        initial={{ x: 15, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-full lg:w-[420px] glass-card border border-asphalt-200 dark:border-asphalt-800 p-0 flex flex-col h-[520px] lg:h-full overflow-hidden"
      >
        {selectedZone ? (
          /* ──────────── ZONE DETAIL PANEL ──────────── */
          <>
            {/* Header */}
            <div className="p-4 bg-asphalt-900 text-white flex-shrink-0">
              <div className="flex justify-between items-start mb-2">
                <button onClick={handleClosePanel}
                  className="text-xs text-asphalt-400 hover:text-white font-bold flex items-center gap-1 transition-colors">
                  <X className="w-3.5 h-3.5" /> Close
                </button>
                <button onClick={handleToggleFavorite}
                  className="text-red-500 hover:scale-110 transition-transform" title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                  <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-500' : 'text-asphalt-500'}`} />
                </button>
              </div>
              <h3 className="text-lg font-black tracking-tight leading-tight">{selectedZone.name}</h3>
              <p className="text-xs text-asphalt-400 mt-0.5">{selectedZone.address}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-asphalt-300 font-semibold">
                <span className="text-white font-bold">₹{selectedZone.basePricePerHour}/hr</span>
                <span>•</span>
                <span className={selectedZone.availableSlots > 0 ? 'text-green-400' : 'text-red-400'}>
                  {selectedZone.availableSlots}/{selectedZone.totalSlots} available
                </span>
                {selectedZone.rating > 0 && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {selectedZone.rating}
                    </span>
                  </>
                )}
                {selectedZone._distLabel && (
                  <>
                    <span>•</span>
                    <span>📍 {selectedZone._distLabel} · ~{selectedZone._eta || formatETA(selectedZone._dist || 0)}</span>
                  </>
                )}
                {(selectedZone.dynamicPricingMultiplier || 1) > 1.3 && (
                  <span className="badge-yellow text-[9px] py-0.5 px-2 font-bold flex items-center gap-0.5 border-none">
                    <Zap className="w-2.5 h-2.5" /> Surge
                  </span>
                )}
              </div>
              {/* Amenities pills */}
              {selectedZone.amenities?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selectedZone.amenities.map((a, i) => (
                    <span key={i} className="text-[9px] px-2 py-0.5 rounded bg-asphalt-800 text-asphalt-300 font-bold">{a}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Booking Toasts */}
            <AnimatePresence>
              {bookingState === 'success' && bookingResult && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="p-3 bg-green-50 dark:bg-green-950/20 border-b border-green-200 dark:border-green-800/40 flex-shrink-0">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" /> Booking confirmed!
                  </div>
                  <p className="text-[11px] text-green-600 dark:text-green-300 mt-0.5">Check your dashboard for the QR ticket.</p>
                </motion.div>
              )}
              {bookingState === 'error' && bookingResult && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="p-3 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-800/40 flex-shrink-0">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-xs">
                    <XCircle className="w-4 h-4" /> {bookingResult.message}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Duration Selector */}
            <div className="p-4 border-b border-asphalt-200 dark:border-asphalt-800 bg-asphalt-50/50 dark:bg-asphalt-900/30 flex-shrink-0">
              <label className="text-[10px] font-bold text-asphalt-500 uppercase tracking-wider">Select Duration</label>
              <div className="grid grid-cols-6 gap-1.5 mt-2">
                {[1, 2, 3, 4, 6, 8].map(h => (
                  <button key={h} onClick={() => setHours(h)}
                    className={`py-1.5 rounded-md font-bold text-xs border transition-all ${
                      hours === h
                        ? 'bg-parking-primary border-parking-primary text-white shadow-sm'
                        : 'bg-white dark:bg-asphalt-900 border-asphalt-200 dark:border-asphalt-800 hover:border-asphalt-300 dark:hover:border-asphalt-700 text-asphalt-700 dark:text-asphalt-300'
                    }`}>
                    {h}h
                  </button>
                ))}
              </div>
              <p className="text-right mt-2 text-sm font-bold text-asphalt-800 dark:text-white">
                Total: ₹{Math.round(selectedZone.basePricePerHour * (selectedZone.dynamicPricingMultiplier || 1) * hours)}
              </p>
            </div>

            {/* Scrollable Slots */}
<div className="flex-1 overflow-y-auto p-4">
 
  {/* Stats header */}
  <div className="flex items-center justify-between mb-4">
    <h4 className="text-[10px] font-bold uppercase tracking-wider text-asphalt-500">
      Parking Slots
    </h4>
    <div className="flex items-center gap-3.5 text-[10px] font-bold text-asphalt-500">
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-parking-accent"></span>
        {freeSlots.length} Available
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-parking-danger"></span>
        {occupiedSlots.length} Occupied
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        {slots.filter(s => s.isUnderMaintenance).length} Maintenance
      </span>
      {selectedSlot && (
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-parking-primary"></span>
          1 Selected
        </span>
      )}
    </div>
  </div>
 
  {loadingSlots ? (
    // Skeleton cards while loading
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border-2 border-asphalt-150 dark:border-asphalt-900 p-4 animate-pulse"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="h-3.5 w-10 bg-asphalt-150 dark:bg-asphalt-800 rounded" />
            <div className="h-3.5 w-14 bg-asphalt-150 dark:bg-asphalt-800 rounded" />
          </div>
          <div className="flex justify-center py-3">
            <div className="w-9 h-9 bg-asphalt-150 dark:bg-asphalt-800 rounded-full" />
          </div>
          <div className="h-2.5 w-16 bg-asphalt-150 dark:bg-asphalt-800 rounded mx-auto mt-3" />
        </div>
      ))}
    </div>
  ) : slots.length === 0 ? (
    // Empty state
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-full bg-asphalt-100 dark:bg-asphalt-900 flex items-center justify-center mb-3">
        <ParkingSquare className="w-5 h-5 text-asphalt-350" strokeWidth={1.5} />
      </div>
      <p className="text-xs font-bold text-asphalt-600 dark:text-asphalt-300">No slots found</p>
      <p className="text-[11px] text-asphalt-400 mt-1 max-w-[220px] leading-relaxed">
        All parking spaces are currently unavailable.
      </p>
    </div>
  ) : (
    // Slot grid
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {slots.map(slot => (
        <button
          key={slot._id}
          onClick={() => !slot.isOccupied && !slot.isUnderMaintenance && setSelectedSlot(slot)}
          disabled={slot.isOccupied || slot.isUnderMaintenance}
          className={`group relative flex flex-col rounded-xl border-2 p-4 text-left transition-all duration-200 ${
            slot.isOccupied || slot.isUnderMaintenance
              ? 'border-asphalt-150 dark:border-asphalt-900 bg-asphalt-50/60 dark:bg-asphalt-900/30 opacity-60 cursor-not-allowed'
              : selectedSlot?._id === slot._id
                ? 'border-parking-primary bg-blue-50/60 dark:bg-blue-950/20 shadow-md scale-[1.02]'
                : 'border-asphalt-200 dark:border-asphalt-800 hover:border-asphalt-350 dark:hover:border-asphalt-700 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer'
          }`}
        >
          {/* Selected marker */}
          {selectedSlot?._id === slot._id && (
            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-parking-primary flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </div>
          )}
 
          {/* Top: slot number + status badge */}
          <div className="w-full flex items-center justify-between mb-3">
            <span className="font-bold text-sm text-asphalt-900 dark:text-white tracking-tight">
              {slot.slotIdentifier}
            </span>
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                slot.isUnderMaintenance
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
                  : slot.isOccupied
                    ? 'bg-red-50 text-parking-danger dark:bg-red-950/20'
                    : 'bg-emerald-50 text-parking-accent dark:bg-emerald-950/20'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  slot.isUnderMaintenance
                    ? 'bg-amber-400'
                    : slot.isOccupied
                      ? 'bg-parking-danger'
                      : 'bg-parking-accent'
                }`}
              ></span>
              {slot.isUnderMaintenance ? 'Maint.' : slot.isOccupied ? 'Occupied' : 'Free'}
            </span>
          </div>
 
          {/* Center: bay illustration */}
          <div className="flex items-center justify-center w-full py-3">
            {slot.isUnderMaintenance ? (
              <Wrench className="w-7 h-7 text-amber-400" strokeWidth={1.5} />
            ) : (
              <Car
                className={`w-9 h-9 transition-colors ${
                  slot.isOccupied
                    ? 'text-asphalt-400 dark:text-asphalt-600'
                    : 'text-asphalt-300 dark:text-asphalt-700 group-hover:text-parking-primary/50'
                }`}
                strokeWidth={1.25}
              />
            )}
          </div>
 
          {/* Bottom: feature badge */}
          <div className="w-full flex items-center justify-center pt-2.5 border-t border-asphalt-100 dark:border-asphalt-850">
            {slot.isEV ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold uppercase tracking-wider">
                <Zap className="w-2.5 h-2.5" /> EV
              </span>
            ) : (
              <span className="text-[10px] text-asphalt-400 font-medium">Standard bay</span>
            )}
          </div>
        </button>
      ))}
    </div>
  )}
</div>
 

            {/* Book Now Button & Vehicle Selection */}
            {selectedSlot && bookingState !== 'success' && (
              <div className="p-4 border-t border-asphalt-200 dark:border-asphalt-800 bg-white dark:bg-parking-card flex-shrink-0 space-y-3">
                {savedVehicles.length === 0 ? (
                  <div className="space-y-2 text-center p-2 border border-dashed border-red-300 dark:border-red-800 bg-red-50/20 dark:bg-red-950/10 rounded-lg">
                    <p className="text-xs font-bold text-red-650 dark:text-red-400">No vehicles registered. Add a vehicle first to reserve parking.</p>
                    <a href="/driver/vehicles" className="w-full btn-primary py-2 text-xs font-bold text-center block bg-red-600 hover:bg-red-750 border-none">
                      Add Vehicle
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-asphalt-450 uppercase tracking-wider block">Vehicle for Booking</label>
                      <select 
                        value={selectedVehicleId} 
                        onChange={e => setSelectedVehicleId(e.target.value)} 
                        className="form-input text-xs bg-white dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 py-2 px-3 rounded-lg w-full font-semibold"
                      >
                        {savedVehicles.map(v => (
                          <option key={v._id} value={v._id}>
                            {v.make} {v.model} {v.licensePlate ? `(${v.licensePlate})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button onClick={handleBook} disabled={bookingState === 'booking' || !selectedVehicleId}
                      className="w-full btn-primary py-3 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                      {bookingState === 'booking' && <Loader2 className="w-4 h-4 animate-spin" />}
                      Book {selectedSlot.slotIdentifier} — ₹{Math.round(selectedZone.basePricePerHour * (selectedZone.dynamicPricingMultiplier || 1) * hours)}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Phase 23E: Join queue when parking is full */}
            {(!selectedSlot || selectedZone.availableSlots === 0) && (selectedZone.availableSlots === 0 || freeSlots.length === 0) && bookingState !== 'success' && (
              <div className="p-4 border-t border-asphalt-200 dark:border-asphalt-800 bg-amber-50/20 dark:bg-amber-950/5 flex-shrink-0 space-y-3">
                <div className="text-center p-2 bg-amber-500/10 rounded-lg">
                  <p className="text-xs font-bold text-amber-600">Parking is currently full. Join the Waiting Queue to reserve the next released slot.</p>
                </div>
                {savedVehicles.length === 0 ? (
                  <div className="space-y-2 text-center p-2 border border-dashed border-red-300 dark:border-red-800 bg-red-50/20 dark:bg-red-950/10 rounded-lg">
                    <p className="text-xs font-bold text-red-650 dark:text-red-400">No vehicles registered. Add a vehicle first to join the queue.</p>
                    <a href="/driver/vehicles" className="w-full btn-primary py-2 text-xs font-bold text-center block bg-red-600 hover:bg-red-750 border-none">
                      Add Vehicle
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-asphalt-450 uppercase tracking-wider block">Vehicle Type for Queue</label>
                      <select 
                        value={selectedVehicleId} 
                        onChange={e => setSelectedVehicleId(e.target.value)} 
                        className="form-input text-xs bg-white dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 py-2 px-3 rounded-lg w-full font-semibold"
                      >
                        {savedVehicles.map(v => (
                          <option key={v._id} value={v._id}>
                            {v.make} {v.model} ({v.isEV ? 'EV' : (v.vehicleType === 'Motorcycle' ? 'Bike' : v.vehicleType)}) {v.licensePlate ? `-[${v.licensePlate}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button onClick={handleJoinQueue} disabled={bookingState === 'booking' || !selectedVehicleId}
                      className="w-full btn-primary py-3 text-sm font-bold bg-amber-500 hover:bg-amber-600 border-none flex items-center justify-center gap-2">
                      {bookingState === 'booking' && <Loader2 className="w-4 h-4 animate-spin" />}
                      Join Waiting Queue
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          /* ──────────── SEARCH / BROWSE PANEL ──────────── */
          <div className="flex flex-col h-full">
            {/* Search Bar */}
            <div className="p-4 border-b border-asphalt-200 dark:border-asphalt-800 flex-shrink-0" ref={suggestionBoxRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-asphalt-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  placeholder="Search by name or area..."
                  className="form-input pl-10 pr-10 py-2.5 text-sm"
                />
                {suggestionLoading && (
                  <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-asphalt-400 animate-spin" />
                )}
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-asphalt-400 hover:text-asphalt-600">
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Real-time place suggestions dropdown */}
                <AnimatePresence>
                  {showSuggestions && suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
                    >
                      {suggestions.map((place, idx) => (
                        <button
                          key={place.place_id ?? idx}
                          onClick={() => handleSuggestionSelect(place)}
                          className="w-full text-left px-3 py-2.5 hover:bg-asphalt-50 dark:hover:bg-asphalt-800 flex items-start gap-2 border-b border-asphalt-100 dark:border-asphalt-800/50 last:border-b-0"
                        >
                          <MapPin className="w-3.5 h-3.5 text-parking-primary mt-0.5 shrink-0" />
                          <span className="text-xs text-asphalt-700 dark:text-asphalt-300 truncate">
                            {place.display_name}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <button onClick={() => setShowFilters(f => !f)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    showFilters
                      ? 'bg-parking-primary text-white border-parking-primary'
                      : 'bg-white dark:bg-asphalt-900 border-asphalt-200 dark:border-asphalt-800 text-asphalt-600 dark:text-asphalt-300 hover:border-asphalt-300'
                  }`}>
                  <Filter className="w-3.5 h-3.5" /> Filters
                </button>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  className="text-xs font-bold bg-white dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-lg px-2.5 py-1.5 text-asphalt-600 dark:text-asphalt-300 outline-none">
                  {FILTER_OPTIONS.sortBy.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter Panel */}
            <AnimatePresence>
              {showFilters && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex-shrink-0">
                  <div className="p-4 bg-asphalt-50 dark:bg-asphalt-900/50 border-b border-asphalt-200 dark:border-asphalt-800 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { state: filterEV, set: setFilterEV, label: '⚡ EV Charging', icon: Zap },
                        { state: filterCovered, set: setFilterCovered, label: '🏢 Covered', icon: Shield },
                        { state: filter247, set: setFilter247, label: '🕐 24/7', icon: Clock },
                      ].map(({ state, set, label }) => (
                        <button key={label} onClick={() => set(!state)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            state
                              ? 'bg-parking-primary/10 border-parking-primary text-parking-primary'
                              : 'bg-white dark:bg-asphalt-900 border-asphalt-200 dark:border-asphalt-800 text-asphalt-500'
                          }`}>{label}</button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] font-bold text-asphalt-500 uppercase w-20 flex-shrink-0">Max ₹/hr</label>
                      <input type="range" min={10} max={500} value={maxPrice}
                        onChange={e => setMaxPrice(Number(e.target.value))}
                        className="flex-1 accent-parking-primary" />
                      <span className="text-xs font-bold text-asphalt-700 dark:text-asphalt-300 w-10 text-right">₹{maxPrice}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] font-bold text-asphalt-500 uppercase w-20 flex-shrink-0">Min Rating</label>
                      <div className="flex gap-1">
                        {[0, 3, 3.5, 4, 4.5].map(r => (
                          <button key={r} onClick={() => setMinRating(r)}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                              minRating === r
                                ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                                : 'bg-white dark:bg-asphalt-900 border-asphalt-200 dark:border-asphalt-800 text-asphalt-500'
                            }`}>{r === 0 ? 'All' : `${r}+`}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Zone List */}
            <div className="flex-1 overflow-y-auto">
              {loadingZones ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-parking-primary" />
                  <p className="text-xs text-asphalt-400 font-medium">Loading nearby parking...</p>
                </div>
              ) : processedZones.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-asphalt-100 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-asphalt-400" />
                  </div>
                  <p className="text-sm font-bold text-asphalt-700 dark:text-asphalt-300">No parking zones found</p>
                  <p className="text-xs text-asphalt-400">Try adjusting your search or filters.</p>
                </div>
              ) : (
                processedZones.map(zone => {
                  const occupancyRatio = zone.totalSlots > 0 ? zone.availableSlots / zone.totalSlots : 0;
                  return (
                    <button
                      key={zone._id}
                      onClick={() => handleZoneClick(zone)}
                      className="w-full text-left p-4 border-b border-asphalt-100 dark:border-asphalt-800/50 hover:bg-asphalt-50 dark:hover:bg-asphalt-900/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-asphalt-900 dark:text-white truncate">{zone.name}</h4>
                          <p className="text-[11px] text-asphalt-400 mt-0.5 truncate">{zone.address}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px]">
                            <span className="font-bold text-parking-primary">₹{zone.basePricePerHour}/hr</span>
                            <span className={`font-bold ${
                              zone.availableSlots === 0 ? 'text-red-500' :
                              occupancyRatio <= 0.3 ? 'text-amber-500' : 'text-green-500'
                            }`}>
                              {zone.availableSlots} free
                            </span>
                            {zone.rating > 0 && (
                              <span className="flex items-center gap-0.5 text-asphalt-500">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> {zone.rating}
                              </span>
                            )}
                            <span className="text-asphalt-400">📍 {zone._distLabel}</span>
                            <span className="text-asphalt-400">~{zone._eta}</span>
                          </div>
                          {/* Amenity pills */}
                          {zone.amenities?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {zone.amenities.slice(0, 4).map((a, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 bg-asphalt-100 dark:bg-asphalt-800 rounded text-asphalt-500 dark:text-asphalt-400 font-medium">{a}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Availability indicator dot */}
                        <div className="flex-shrink-0 mt-1">
                          <div className={`w-3 h-3 rounded-full ${
                            zone.availableSlots === 0 ? 'bg-red-500' :
                            occupancyRatio <= 0.3 ? 'bg-amber-400' : 'bg-green-500'
                          }`}></div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
    </>
  );
};

export default ParkingMap;