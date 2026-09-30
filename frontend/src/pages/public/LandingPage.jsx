import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import api from '../../services/api';
import { 
  MapPin, Zap, ShieldCheck, Car, Bike, Star, ArrowRight, CheckCircle2, 
  HelpCircle, Sparkles, Navigation, Compass, Landmark, User, Building, 
  LocateFixed, Loader2, Search, SlidersHorizontal, Eye, Info
} from 'lucide-react';

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

const MapController = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 13, { duration: 1.2 });
    }
  }, [position, map]);
  return null;
};

const MapEventsHandler = ({ onZoomChange, onMoveEnd }) => {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
    moveend: () => {
      onMoveEnd(map.getCenter());
    }
  });
  return null;
};

const createLandingZoneIcon = (availableSlots, totalSlots, isSelected) => {
  const ratio = totalSlots > 0 ? availableSlots / totalSlots : 0;
  let bg, border;
  if (isSelected) { bg = '#2563eb'; border = '#1d4ed8'; }
  else if (availableSlots === 0) { bg = '#dc2626'; border = '#b91c1c'; }
  else if (ratio <= 0.3) { bg = '#eab308'; border = '#ca8a04'; }
  else { bg = '#16a34a'; border = '#15803d'; }

  return L.divIcon({
    className: 'landing-zone-marker',
    html: `<div style="
      background:${bg};color:white;padding:3px 7px;border-radius:6px;
      font-weight:800;font-size:10px;text-align:center;
      box-shadow:0 1.5px 7px rgba(0,0,0,0.18);white-space:nowrap;
      border:1.5px solid ${border};min-width:32px;
      transform:${isSelected ? 'scale(1.12)' : 'scale(1)'};
      transition:transform 0.15s;
    ">${availableSlots}/${totalSlots}</div>`,
    iconSize: [45, 25],
    iconAnchor: [22, 25],
    popupAnchor: [0, -27]
  });
};

const createClusterIcon = (count, availableSlots, totalSlots) => {
  return L.divIcon({
    className: 'landing-cluster-marker',
    html: `<div style="
      background:#1e293b;color:white;padding:5px 8px;border-radius:18px;
      font-weight:900;font-size:10px;text-align:center;
      box-shadow:0 3px 12px rgba(0,0,0,0.25);white-space:nowrap;
      border:2.5px solid #2563eb;min-width:40px;
    ">🌐 ${count} (${availableSlots} free)</div>`,
    iconSize: [60, 32],
    iconAnchor: [30, 32]
  });
};

const landingUserLocationIcon = L.divIcon({
  className: 'landing-user-marker',
  html: `<div style="position:relative;width:14px;height:14px;">
    <div style="position:absolute;inset:0;background:rgba(37,99,235,0.25);border-radius:50%;animation:pulse 2s infinite;"></div>
    <div style="position:absolute;inset:2px;background:#2563eb;border:2px solid white;border-radius:50%;"></div>
  </div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const LandingPage = () => {
  const navigate = useNavigate();
  const [vehicleType, setVehicleType] = useState('Car');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  
  // Real Map Geolocation and Fallback states
  const [userPos, setUserPos] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('locating');
  const [radius, setRadius] = useState(10); // default 10 km
  const [zones, setZones] = useState([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [mapZoom, setMapZoom] = useState(13);
  const [mapCenter, setMapCenter] = useState(null);
  
  const [searchQueryMap, setSearchQueryMap] = useState('');
  const [selectedZone, setSelectedZone] = useState(null);
  const [geocoding, setGeocoding] = useState(false);

  // Fallback to IP Geolocation
  const fallbackToIPGeo = async () => {
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (response.ok) {
        const data = await response.json();
        if (data.latitude && data.longitude) {
          const coords = [data.latitude, data.longitude];
          setUserPos(coords);
          setMapCenter(coords);
          setGpsStatus('fallback');
          console.log(`IP Geo fallback success: ${data.city}`);
          return;
        }
      }
    } catch (err) {
      console.warn('IP Geo fallback failed:', err);
    }
    const defaultCoords = [28.6139, 77.2090];
    setUserPos(defaultCoords);
    setMapCenter(defaultCoords);
    setGpsStatus('denied');
  };

  // Browser Geolocation on load
  useEffect(() => {
    if (!navigator.geolocation) {
      fallbackToIPGeo();
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(coords);
        setMapCenter(coords);
        setGpsStatus('found');
      },
      (error) => {
        console.warn('Geolocation denied or failed. Trying IP Geo fallback...');
        fallbackToIPGeo();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // Fetch nearby parking zones using public search API
  const fetchNearbyZones = useCallback(async () => {
    if (!userPos) return;
    try {
      const { data } = await api.get(`/parking/search?lat=${userPos[0]}&lng=${userPos[1]}&radius=${radius * 1000}`);
      setZones(data || []);
    } catch (err) {
      console.error('Failed to load zones on landing page:', err);
    } finally {
      setLoadingZones(false);
    }
  }, [userPos, radius]);

  useEffect(() => {
    if (userPos) {
      fetchNearbyZones();
    }
  }, [userPos, radius, fetchNearbyZones]);

  // Auto-refresh parking availability every 10 seconds
  useEffect(() => {
    if (!userPos) return;
    const interval = setInterval(() => {
      fetchNearbyZones();
    }, 10000);
    return () => clearInterval(interval);
  }, [userPos, fetchNearbyZones]);

  // Geocode location using Nominatim API (mini-map search box)
  const handleMapSearch = async (e) => {
    e.preventDefault();
    if (!searchQueryMap.trim()) return;
    setGeocoding(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchQueryMap)}`);
      if (response.ok) {
        const results = await response.json();
        if (results && results.length > 0) {
          const coords = [parseFloat(results[0].lat), parseFloat(results[0].lon)];
          setUserPos(coords);
          setMapCenter(coords);
          setSelectedZone(null);
        } else {
          alert('Location not found. Please try a different search.');
        }
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    } finally {
      setGeocoding(false);
    }
  };

  // Live marker clustering computation
  const clusteredItems = useMemo(() => {
    if (zones.length === 0) return [];
    
    const zoom = mapZoom;
    const gridSize = zoom > 15 ? 0.0015 :
                     zoom > 13 ? 0.006 :
                     zoom > 11 ? 0.025 :
                     zoom > 9 ? 0.1 : 0.3;
                     
    const items = [];
    const visited = new Set();
    
    for (let i = 0; i < zones.length; i++) {
      if (visited.has(zones[i]._id)) continue;
      
      const lat1 = zones[i].location.coordinates[1];
      const lng1 = zones[i].location.coordinates[0];
      
      const clusterMembers = [zones[i]];
      visited.add(zones[i]._id);
      
      for (let j = i + 1; j < zones.length; j++) {
        if (visited.has(zones[j]._id)) continue;
        
        const lat2 = zones[j].location.coordinates[1];
        const lng2 = zones[j].location.coordinates[0];
        
        if (Math.abs(lat1 - lat2) < gridSize && Math.abs(lng1 - lng2) < gridSize) {
          clusterMembers.push(zones[j]);
          visited.add(zones[j]._id);
        }
      }
      
      if (clusterMembers.length === 1) {
        items.push({
          isCluster: false,
          zone: clusterMembers[0],
          lat: lat1,
          lng: lng1
        });
      } else {
        const avgLat = clusterMembers.reduce((sum, z) => sum + z.location.coordinates[1], 0) / clusterMembers.length;
        const avgLng = clusterMembers.reduce((sum, z) => sum + z.location.coordinates[0], 0) / clusterMembers.length;
        const totalSlots = clusterMembers.reduce((sum, z) => sum + z.totalSlots, 0);
        const availableSlots = clusterMembers.reduce((sum, z) => sum + z.availableSlots, 0);
        
        items.push({
          isCluster: true,
          id: `cluster-${i}`,
          lat: avgLat,
          lng: avgLng,
          count: clusterMembers.length,
          totalSlots,
          availableSlots,
          members: clusterMembers
        });
      }
    }
    return items;
  }, [zones, mapZoom]);

  // Main hero search: geocodes typed text via Nominatim, or falls back to
  // the already-detected userPos when the field is left blank.
  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    setSearchLoading(true);

    try {
      const query = searchQuery.trim();

      // Case 1: user typed a location -> geocode it for real coordinates
      if (query) {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
        );
        if (response.ok) {
          const results = await response.json();
          if (results && results.length > 0) {
            const lat = parseFloat(results[0].lat);
            const lng = parseFloat(results[0].lon);
            navigate(`/map?lat=${lat}&lng=${lng}&q=${encodeURIComponent(query)}&type=${vehicleType}`);
            return;
          }
        }
        // Geocoding failed / no results
        alert('Location not found. Please try a different search, or leave it blank to use your current location.');
        return;
      }

      // Case 2: no text entered -> use the already-detected geolocation
      if (userPos) {
        navigate(`/map?lat=${userPos[0]}&lng=${userPos[1]}&type=${vehicleType}`);
      } else {
        // Still detecting location, fall back gracefully
        navigate(`/map?type=${vehicleType}`);
      }
    } catch (err) {
      console.error('Search geocoding error:', err);
      alert('Something went wrong finding that location. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Footer quick-link handler: smooth-scrolls to an in-page anchor if
  // already on the landing page, otherwise navigates there first.
  const handleMenuClick = (path) => {
    const [base, hash] = path.split('#');
    const targetId = hash;

    if ((base === '/' || base === '') && window.location.pathname === '/') {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    navigate(path);
  };

  return (
    <div className="relative overflow-x-hidden space-y-20 pb-16">
      
      {/* 2. HERO SECTION & SEARCH BAR (First Fold) */}
      <section className="max-w-7xl mx-auto px-4 pt-8 md:pt-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center relative">
        {/* Subtle Asphalt/Parking Road Marking background grid */}
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04] pointer-events-none z-0">
          <div className="w-full h-full bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] bg-[size:40px_40px]"></div>
        </div>

        {/* Hero Left Content */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:col-span-6 space-y-6 z-10"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-asphalt-200 dark:bg-asphalt-900 text-asphalt-750 dark:text-asphalt-300 font-bold text-xs tracking-wider border border-asphalt-300 dark:border-asphalt-800">
            <Sparkles className="w-3.5 h-3.5 text-parking-primary" /> AI Smart Parking Marketplace
          </span>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-asphalt-900 dark:text-white leading-tight">
            Smart Parking. <br/>
            Seamless City. <br/>
            <span className="text-parking-primary font-black">Better Tomorrow.</span>
          </h1>
          <p className="text-sm md:text-base text-asphalt-500 dark:text-asphalt-400 max-w-xl leading-relaxed">
            AI-powered parking marketplace that connects you to the nearest available spots in real-time. Save time, fuel and reduce urban congestion.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-4 max-w-md">
            <Link to="/map" className="w-full sm:w-auto flex-1 btn-primary py-3.5 flex items-center justify-center gap-2 text-sm shadow-none">
              <Navigation className="w-4.5 h-4.5" /> Find Parking Now
            </Link>
            <Link to="/provider" className="w-full sm:w-auto flex-1 btn-secondary py-3.5 flex items-center justify-center gap-2 text-sm border border-asphalt-250 dark:border-asphalt-800 shadow-none">
              <Building className="w-4.5 h-4.5" /> List My Space
            </Link>
          </div>

          {/* Trust Badges */}
          <div className="pt-6 border-t border-asphalt-200 dark:border-asphalt-800 grid grid-cols-3 gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-asphalt-450">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-parking-accent" /> Real-time Availability
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-parking-primary" /> Secure Payments
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-parking-surge" /> 24/7 Support
            </div>
          </div>
        </motion.div>

        {/* Hero Right: Real Geolocated Leaflet Map */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="lg:col-span-6 z-10"
        >
          <div className="w-full h-[360px] md:h-[420px] bg-asphalt-100 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl relative overflow-hidden shadow-soft flex flex-col">
            
            {/* Map Header Overlay */}
            <div className="absolute top-2 left-2 right-2 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
              <form onSubmit={handleMapSearch} className="flex gap-1.5 bg-white/95 dark:bg-asphalt-900/95 backdrop-blur-sm border border-asphalt-200 dark:border-asphalt-700/80 p-1.5 rounded-lg shadow-sm">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-asphalt-450" />
                  <input 
                    type="text" 
                    value={searchQueryMap} 
                    onChange={e => setSearchQueryMap(e.target.value)} 
                    placeholder="Search city/area on map..."
                    className="w-full pl-8 pr-2 py-1.5 text-xs bg-transparent outline-none text-asphalt-900 dark:text-white font-bold"
                  />
                </div>
                <button type="submit" disabled={geocoding} className="btn-primary py-1.5 px-3 text-[10px] font-bold shadow-none shrink-0 flex items-center gap-1">
                  {geocoding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Compass className="w-3 h-3" />} Go
                </button>
              </form>
              
              {/* Geolocation Status Alert */}
              {gpsStatus === 'locating' && (
                <div className="bg-parking-primary/95 text-white py-1 px-3 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm">
                  <Loader2 className="w-3 h-3 animate-spin" /> Detecting location...
                </div>
              )}
              {gpsStatus === 'fallback' && (
                <div className="bg-emerald-600/95 text-white py-1 px-3 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm">
                  <CheckCircle2 className="w-3 h-3" /> Location set by IP geo-estimate
                </div>
              )}
              {gpsStatus === 'denied' && (
                <div className="bg-amber-600/95 text-white py-1 px-3 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm">
                  <Info className="w-3 h-3" /> GPS blocked. Defaulting to Delhi
                </div>
              )}
            </div>

            {/* Map Area */}
            <div className="flex-1 w-full relative z-0">
              {userPos ? (
                <MapContainer
                  center={userPos}
                  zoom={mapZoom}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
                  />
                  <MapController position={userPos} />
                  <MapEventsHandler onZoomChange={setMapZoom} onMoveEnd={setMapCenter} />

                  {/* User location pin */}
                  <Marker position={userPos} icon={landingUserLocationIcon}>
                    <Popup><strong className="text-xs">📍 Detected Center</strong></Popup>
                  </Marker>

                  {/* Clustered Parking Zone pins */}
                  {clusteredItems.map(item => {
                    if (item.isCluster) {
                      return (
                        <Marker 
                          key={item.id} 
                          position={[item.lat, item.lng]} 
                          icon={createClusterIcon(item.count, item.availableSlots, item.totalSlots)}
                          eventHandlers={{
                            click: () => {
                              setUserPos([item.lat, item.lng]);
                              setMapZoom(prev => Math.min(prev + 2, 18));
                            }
                          }}
                        />
                      );
                    } else {
                      const zone = item.zone;
                      const isSelected = selectedZone?._id === zone._id;
                      return (
                        <Marker
                          key={zone._id}
                          position={[item.lat, item.lng]}
                          icon={createLandingZoneIcon(zone.availableSlots, zone.totalSlots, isSelected)}
                          eventHandlers={{
                            click: () => setSelectedZone(zone)
                          }}
                        />
                      );
                    }
                  })}
                </MapContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-parking-primary" />
                  <p className="text-xs text-asphalt-400 font-bold">Initializing live maps...</p>
                </div>
              )}
            </div>

            {/* Radius and Info Footer Overlay */}
            <div className="bg-white dark:bg-asphalt-900 border-t border-asphalt-200 dark:border-asphalt-800 p-2.5 z-[1000] relative flex items-center justify-between gap-3 text-xs flex-shrink-0">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-[10px] font-black text-asphalt-450 uppercase shrink-0">Radius</span>
                <input 
                  type="range" 
                  min="1" 
                  max="50" 
                  value={radius} 
                  onChange={e => setRadius(parseInt(e.target.value))} 
                  className="w-full max-w-[120px] accent-parking-primary cursor-pointer"
                />
                <span className="font-bold text-parking-primary font-mono text-[11px] shrink-0">{radius} km</span>
              </div>
              
              <div className="text-[10px] font-bold text-asphalt-400 text-right shrink-0">
                {zones.length} spots nearby
              </div>
            </div>

            {/* Detailed Selected Lot Modal inside right map */}
            <AnimatePresence>
              {selectedZone && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: 15 }}
                  className="absolute bottom-12 left-2 right-2 z-[1000] bg-white dark:bg-parking-card border border-asphalt-200 dark:border-asphalt-800 p-3 rounded-lg shadow-2xl flex flex-col gap-2 pointer-events-auto"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-xs text-asphalt-900 dark:text-white truncate max-w-[220px]">{selectedZone.name}</h4>
                      <p className="text-[10px] text-asphalt-455 truncate max-w-[220px] mt-0.5">{selectedZone.address}</p>
                    </div>
                    <button onClick={() => setSelectedZone(null)} className="text-[10px] text-asphalt-400 font-bold hover:text-asphalt-700 uppercase shrink-0">Dismiss</button>
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-asphalt-100 dark:border-asphalt-850 pt-2 text-[11px]">
                    <div className="flex gap-3 font-mono font-bold">
                      <span className="text-parking-accent">₹{selectedZone.basePricePerHour}/hr</span>
                      <span className={selectedZone.availableSlots > 0 ? 'text-green-500' : 'text-red-500'}>
                        {selectedZone.availableSlots}/{selectedZone.totalSlots} free
                      </span>
                    </div>
                    
                    <button 
                      onClick={() => navigate(`/map?lat=${selectedZone.location.coordinates[1]}&lng=${selectedZone.location.coordinates[0]}&zone=${selectedZone._id}`)} 
                      className="btn-primary py-1 px-3 text-[10px] font-bold shadow-none"
                    >
                      Reserve Spot
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </section>

      {/* 3. SEARCH BAR / QUICK FIND (Nested Below Hero fold) */}
      <section className="max-w-5xl mx-auto px-4 z-20 relative">
        <form onSubmit={handleSearchSubmit} className="glass-card p-4 sm:p-5 border border-asphalt-200 dark:border-asphalt-800 grid grid-cols-1 md:grid-cols-12 gap-4 items-center shadow-soft">
          {/* Destination Location Search */}
          <div className="md:col-span-5 relative">
            <label className="block text-[10px] font-bold text-asphalt-450 uppercase tracking-widest mb-1.5">Where to park?</label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-asphalt-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={userPos ? "Current location detected" : "Enter a location"}
                className="form-input pl-10 py-2.5 text-sm" 
              />
            </div>
          </div>

          {/* Vehicle Type Choice */}
          <div className="md:col-span-4">
            <label className="block text-[10px] font-bold text-asphalt-450 uppercase tracking-widest mb-1.5">Vehicle Type</label>
            <div className="flex bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 p-1 rounded-lg">
              {['Car', 'Bike', 'SUV'].map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setVehicleType(type)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded font-bold text-xs uppercase transition-all ${
                    vehicleType === type 
                      ? 'bg-white dark:bg-asphalt-800 text-parking-primary shadow-sm' 
                      : 'text-asphalt-500 hover:text-asphalt-700 dark:hover:text-asphalt-300'
                  }`}
                >
                  {type === 'Car' ? <Car className="w-3.5 h-3.5" /> : type === 'Bike' ? <Bike className="w-3.5 h-3.5" /> : <Compass className="w-3.5 h-3.5" />}
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Action Trigger */}
          <div className="md:col-span-3 pt-4 md:pt-4">
            <button
              type="submit"
              disabled={searchLoading}
              className="w-full btn-primary py-3 text-xs font-bold flex items-center justify-center gap-1 shadow-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              {searchLoading ? 'Searching...' : 'Find Parking Space'}
            </button>
          </div>
        </form>
      </section>

      {/* 4. FEATURE HIGHLIGHTS (4 Cards) */}
      <section className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-asphalt-900 dark:text-white tracking-tight">Marketplace Capabilities</h2>
          <p className="text-xs sm:text-sm text-asphalt-500 dark:text-asphalt-400 mt-1.5">Modern features optimized for next-generation urban travel.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { title: 'AI Surge Pricing', text: 'Prices adapt to demand in real-time for best value.', icon: Zap, iconColor: 'text-parking-surge', bg: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200/40 dark:border-yellow-900/10' },
            { title: 'Live IoT Telemetry', text: 'Sensors update availability instantly, no false spots.', icon: Compass, iconColor: 'text-parking-primary', bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200/40 dark:border-blue-900/10' },
            { title: 'Guaranteed Escrow', text: 'Secure wallet payments, QR verification, automated entry/exit.', icon: ShieldCheck, iconColor: 'text-parking-accent', bg: 'bg-green-50 dark:bg-green-950/20 border-green-200/40 dark:border-green-900/10' },
            { title: 'Earn Reward Points', text: 'Park smart, park responsibly and unlock rewards.', icon: Star, iconColor: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200/40 dark:border-amber-800/10' }
          ].map((feat, idx) => (
            <div key={idx} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 hover:shadow-card-hover transition-all duration-200">
              <div className={`p-2.5 rounded-lg border ${feat.bg} w-10 h-10 flex items-center justify-center mb-4`}>
                <feat.icon className={`w-5 h-5 ${feat.iconColor}`} />
              </div>
              <h3 className="font-bold text-sm text-asphalt-900 dark:text-white mb-1.5">{feat.title}</h3>
              <p className="text-xs text-asphalt-500 dark:text-asphalt-400 leading-relaxed">{feat.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. STATS SECTION (Numbers with Icons) */}
      <section className="max-w-6xl mx-auto px-4 bg-asphalt-50 dark:bg-asphalt-900/40 py-8 rounded-xl border border-asphalt-250 dark:border-asphalt-800/80">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { val: '10,000+', label: 'Parking Spots', icon: MapPin, color: 'text-blue-500' },
            { val: '25,500+', label: 'Happy Drivers', icon: User, color: 'text-green-500' },
            { val: '4.7/5', label: 'User Rating', icon: Star, color: 'text-amber-500' },
            { val: '1.2M kg', label: 'CO₂ Saved', icon: Sparkles, color: 'text-purple-500' }
          ].map((s, idx) => (
            <div key={idx} className="space-y-1">
              <s.icon className={`w-5 h-5 mx-auto ${s.color}`} />
              <h4 className="text-2xl sm:text-3xl font-black text-asphalt-900 dark:text-white font-mono tracking-tight pt-1">{s.val}</h4>
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-asphalt-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 6. HOW IT WORKS (4 Steps) */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 space-y-8 scroll-mt-20">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-asphalt-900 dark:text-white tracking-tight">How AIParkAI Works</h2>
          <p className="text-xs sm:text-sm text-asphalt-500 dark:text-asphalt-400 mt-1.5">Get your parking spot booked and secured in four straightforward steps.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {[
            { step: '01', title: 'Find Spot', desc: 'Choose the best parking near you.' },
            { step: '02', title: 'Book & Pay', desc: 'Book securely with wallet or cards.' },
            { step: '03', title: 'Park & Enter', desc: 'Scan QR, enter and park easily.' },
            { step: '04', title: 'Exit & Rate', desc: 'Exit smoothly and earn rewards.' }
          ].map((s, idx) => (
            <div key={idx} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 relative space-y-3">
              <span className="text-4xl font-black font-mono text-asphalt-200 dark:text-asphalt-800 absolute top-4 right-4">{s.step}</span>
              <h3 className="font-bold text-base text-asphalt-900 dark:text-white pt-2">{s.title}</h3>
              <p className="text-xs text-asphalt-500 dark:text-asphalt-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 7. FOR EVERYONE (Drivers & Providers) */}
      <section className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* For Drivers */}
        <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/20 text-parking-primary border border-blue-200 dark:border-blue-800/40 rounded-lg">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-lg text-asphalt-900 dark:text-white">For Drivers</h3>
              <p className="text-[10px] text-asphalt-500 uppercase font-bold tracking-wider mt-0.5">Find & Reserve Parking</p>
            </div>
          </div>
          <ul className="space-y-3 pt-2">
            {[
              'Find nearby parking in seconds.',
              'Real-time availability & pricing.',
              'Secure QR entry/exit.',
              'Save time, fuel & money.'
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-asphalt-700 dark:text-asphalt-300">
                <CheckCircle2 className="w-4 h-4 text-parking-accent mt-0.5 shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <Link to="/map" className="w-full btn-primary py-2.5 text-xs font-bold text-center block shadow-none">Find Spot Now</Link>
        </div>

        {/* For Providers */}
        <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-50 dark:bg-green-950/20 text-parking-accent border border-green-200 dark:border-green-800/40 rounded-lg">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-lg text-asphalt-900 dark:text-white">For Parking Providers</h3>
              <p className="text-[10px] text-asphalt-500 uppercase font-bold tracking-wider mt-0.5">Monetize Space</p>
            </div>
          </div>
          <ul className="space-y-3 pt-2">
            {[
              'List your space and earn more.',
              'Smart analytics & insights.',
              'Flexible pricing & control.',
              'Trusted by thousands.'
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-asphalt-700 dark:text-asphalt-300">
                <CheckCircle2 className="w-4 h-4 text-parking-primary mt-0.5 shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <Link to="/provider" className="w-full btn-secondary py-2.5 text-xs font-bold text-center block border border-asphalt-250 dark:border-asphalt-800 shadow-none">Register Lot</Link>
        </div>
      </section>

      {/* 8. POPULAR PARKING SPOTS (Horizontal List / Cards) */}
      <section className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="flex justify-between items-end pb-2 border-b border-asphalt-200 dark:border-asphalt-850">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-asphalt-900 dark:text-white tracking-tight">Popular Parking Locations</h2>
            <p className="text-xs text-asphalt-500 mt-1">Book highly rated slots in popular demand zones.</p>
          </div>
          <Link to="/map" className="text-xs font-bold text-parking-primary hover:underline flex items-center gap-1">
            View All Spots <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: 'Connaught Grand Garage', rating: 4.8, distance: '0.8 km', price: 50, img: '/downtown_parking.jpg', ev: true },
            { name: 'Noida Sec 62 Plaza', rating: 4.5, distance: '1.2 km', price: 40, img: '/plaza_garage.jpg', ev: false },
            { name: 'Indiranagar Tech Square', rating: 4.7, distance: '2.4 km', price: 60, img: '/downtown_parking.jpg', ev: true },
            { name: 'Mumbai Airport Terminal 2', rating: 4.9, distance: '4.5 km', price: 80, img: '/plaza_garage.jpg', ev: true }
          ].map((spot, idx) => (
            <div key={idx} className="glass-card border border-asphalt-200 dark:border-asphalt-800 flex flex-col group hover:shadow-card-hover transition-all duration-200">
              <div className="h-40 bg-asphalt-100 dark:bg-asphalt-900 relative overflow-hidden shrink-0">
                <img 
                  src={spot.img} 
                  alt={spot.name} 
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
                <span className="absolute top-2.5 left-2.5 badge-blue text-[9px] border-none font-bold">24/7 Available</span>
                {spot.ev && <span className="absolute top-2.5 right-2.5 badge-emerald text-[9px] border-none font-bold">⚡ EV</span>}
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <h4 className="font-bold text-sm text-asphalt-900 dark:text-white leading-snug">{spot.name}</h4>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-asphalt-450 font-bold">
                    <span className="flex items-center gap-0.5 text-amber-500"><Star className="w-3 h-3 fill-amber-500" /> {spot.rating}</span>
                    <span>•</span>
                    <span>{spot.distance} away</span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-asphalt-100 dark:border-asphalt-900 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-asphalt-450 uppercase block">Hourly Fee</span>
                    <span className="font-black text-asphalt-850 dark:text-white font-mono">₹{spot.price}/hr</span>
                  </div>
                  <Link to="/map" className="btn-primary py-1.5 px-3 text-[10px] font-bold shadow-none">Reserve</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 9. TESTIMONIALS */}
      <section className="max-w-4xl mx-auto px-4 space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-black text-asphalt-900 dark:text-white tracking-tight">Driver Testimonials</h2>
          <p className="text-xs text-asphalt-500 mt-1">What users say about their AIParkAI experience.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: 'Aarav Mehta', role: 'Daily Driver', text: 'Saved 20 minutes of parking search every single day. The wallet integration is super convenient!', rating: 5 },
            { name: 'Priya Sharma', role: 'IT Manager', text: 'I only book EV slots. Real-time availability is 100% accurate, no fake spots!', rating: 5 },
            { name: 'Karan Malhotra', role: 'Lot Operator', text: 'Listing our office parking spaces has generated a great secondary stream of revenue. Fantastic service!', rating: 5 }
          ].map((t, idx) => (
            <div key={idx} className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 flex flex-col justify-between gap-4">
              <p className="text-xs text-asphalt-600 dark:text-asphalt-350 leading-relaxed italic">"{t.text}"</p>
              <div className="flex justify-between items-center border-t border-asphalt-100 dark:border-asphalt-900 pt-2.5">
                <div>
                  <h4 className="font-bold text-xs text-asphalt-850 dark:text-white">{t.name}</h4>
                  <p className="text-[10px] text-asphalt-500">{t.role}</p>
                </div>
                <div className="flex gap-0.5 text-amber-500"><Star className="w-3.5 h-3.5 fill-amber-500" /></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 10. CTA BANNER */}
      <section className="max-w-6xl mx-auto px-4">
        <div className="bg-asphalt-900 dark:bg-parking-card text-white p-8 md:p-12 rounded-xl text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-6 border border-asphalt-800 shadow-soft">
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">Join the smart parking revolution</h2>
            <p className="text-xs sm:text-sm text-asphalt-400 mt-1">List your space or find the best spot today.</p>
          </div>
          <Link to="/login?mode=register" className="btn-primary py-3 px-6 text-sm font-bold bg-white text-asphalt-900 hover:bg-asphalt-100 shadow-none shrink-0">
            Get Started
          </Link>
        </div>
      </section>

      {/* 11. FOOTER */}
      <footer id="about" className="w-full bg-white dark:bg-parking-dark border-t border-asphalt-200 dark:border-asphalt-800/80 pt-12 pb-6 text-xs text-asphalt-500 dark:text-asphalt-400 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
          <div className="col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-2 group shrink-0">
              <div className="bg-parking-primary p-2 rounded-lg transition-colors">
                <Compass className="text-white w-4 h-4" />
              </div>
              <span className="text-base font-bold tracking-tight text-asphalt-900 dark:text-white">
                AIPark<span className="text-parking-primary">AI</span>
              </span>
            </Link>
            <p className="text-xs text-asphalt-450 leading-relaxed max-w-sm">AIParkAI is a next-generation decentralized smart parking marketplace leveraging AI and real-time IoT status integrations.</p>
          </div>
          <div>
            <h4 className="font-bold text-asphalt-850 dark:text-white uppercase tracking-wider text-[10px] mb-3">Quick Links</h4>
            <ul className="space-y-2 text-xs">
              <li><button onClick={() => handleMenuClick('/#how-it-works')} className="hover:text-parking-primary text-left">How It Works</button></li>
              <li><button onClick={() => handleMenuClick('/#pricing')} className="hover:text-parking-primary text-left">Pricing Models</button></li>
              <li><button onClick={() => handleMenuClick('/#about')} className="hover:text-parking-primary text-left">About Team</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-asphalt-850 dark:text-white uppercase tracking-wider text-[10px] mb-3">For Partners</h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/provider" className="hover:text-parking-primary">List Lot Spaces</Link></li>
              <li><Link to="/provider" className="hover:text-parking-primary">Analytics</Link></li>
              <li><Link to="/login" className="hover:text-parking-primary">Partner Portal</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-asphalt-850 dark:text-white uppercase tracking-wider text-[10px] mb-3">Contact Support</h4>
            <p className="text-xs text-asphalt-450">support@aiparkai.com</p>
            <p className="text-xs text-asphalt-450 mt-1">1800-PARK-SMART</p>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto px-4 pt-6 border-t border-asphalt-200 dark:border-asphalt-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>&copy; 2025 AIParkAI. All rights reserved.</p>
          <div className="flex gap-6 font-bold uppercase tracking-wider text-[10px] text-asphalt-450">
            <a href="#" className="hover:text-parking-primary transition">Privacy Policy</a>
            <a href="#" className="hover:text-parking-primary transition">Terms of Service</a>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default LandingPage;