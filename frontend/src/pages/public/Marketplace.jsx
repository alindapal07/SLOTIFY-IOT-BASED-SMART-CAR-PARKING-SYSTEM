import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../i18n/index.jsx';
import { 
  Search, SlidersHorizontal, MapPin, Star, Heart, Compass, CheckCircle2, 
  Clock, Shield, ArrowRight, Zap, Info, Loader2, Navigation, MessageSquare, 
  Trash2, Edit2, X, Plus 
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';

const MarketplacePage = () => {
  const { user, updateWalletBalance } = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();

  // Core Data feeds
  const [zones, setZones] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [filterEV, setFilterEV] = useState(false);
  const [filterCovered, setFilterCovered] = useState(false);
  const [filter24x7, setFilter24x7] = useState(false);
  const [maxPrice, setMaxPrice] = useState(150);
  const [minRating, setMinRating] = useState(0);

  // Active Zone Details Modal state
  const [selectedZone, setSelectedZone] = useState(null);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  
  // Review Form state
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewComment, setNewReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState(null);

  // Fetch list feeds on mount
  const fetchMarketplace = async () => {
    try {
      const [zonesRes, favsRes] = await Promise.all([
        api.get('/parking/zones/all'),
        api.get('/parking/favorites').catch(() => ({ data: [] }))
      ]);
      setZones(zonesRes.data || []);
      setFavorites(favsRes.data || []);
    } catch (err) {
      console.error('Failed to load marketplace zones:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketplace();
  }, []);

  // Fetch feedbacks for selected zone
  const handleOpenDetails = async (zone) => {
    setSelectedZone(zone);
    setLoadingFeedbacks(true);
    setEditingReviewId(null);
    setNewReviewComment('');
    setNewReviewRating(5);
    try {
      const { data } = await api.get(`/feedback/zone/${zone._id}`);
      setFeedbacks(data || []);
    } catch {
      setFeedbacks([]);
    } finally {
      setLoadingFeedbacks(false);
    }
  };

  // Toggle Favorite Lot
  const handleToggleFavorite = async (zoneId) => {
    try {
      await api.post('/parking/favorites/toggle', { zoneId });
      // Update favorites in local state
      setFavorites(prev => 
        prev.some(f => f._id === zoneId)
          ? prev.filter(f => f._id !== zoneId)
          : [...prev, { _id: zoneId }]
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Review Form Submit (Add or Edit review)
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!selectedZone) return;
    setSubmittingReview(true);
    try {
      if (editingReviewId) {
        // Edit existing review
        await api.put(`/feedback/${editingReviewId}`, {
          rating: newReviewRating,
          comments: newReviewComment
        });
        setEditingReviewId(null);
      } else {
        // Create new review. Find a valid booking for this zone to bind
        const { data: myBookings } = await api.get('/bookings/my');
        const validBooking = myBookings.find(b => b.zoneId?._id === selectedZone._id);
        
        if (!validBooking) {
          alert('You must have completed or active bookings at this lot to post feedback.');
          setSubmittingReview(false);
          return;
        }

        await api.post('/feedback', {
          bookingId: validBooking._id,
          zoneId: selectedZone._id,
          rating: newReviewRating,
          comments: newReviewComment
        });
      }
      
      // Refresh feedbacks
      setNewReviewComment('');
      const { data } = await api.get(`/feedback/zone/${selectedZone._id}`);
      setFeedbacks(data || []);
    } catch (err) {
      alert(err.response?.data?.message || 'Feedback action failed.');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Delete own review
  const handleDeleteReview = async (reviewId) => {
    if (!confirm('Are you sure you want to delete your feedback?')) return;
    try {
      await api.delete(`/feedback/${reviewId}`);
      setFeedbacks(prev => prev.filter(f => f._id !== reviewId));
    } catch (err) {
      console.error(err);
    }
  };

  const categories = [
    { key: 'ALL', label: 'All Lots' },
    { key: 'Garage', label: 'Garage' },
    { key: 'Mall', label: 'Malls' },
    { key: 'Commercial', label: 'Commercial' },
    { key: 'Apartment', label: 'Residential' },
    { key: 'Office', label: 'Corporate Office' }
  ];

  // Client-side search and filters logic
  const filteredZones = zones.filter(z => {
    const matchesSearch = z.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          z.address.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Simulate category check based on lot name words
    const matchesCategory = selectedCategory === 'ALL' || 
                            z.name.toLowerCase().includes(selectedCategory.toLowerCase());

    const matchesEV = !filterEV || z.vehicleTypesAllowed?.includes('EV') || z.amenities?.includes('EV Charging') || z.name.includes('EV');
    const matchesCovered = !filterCovered || z.amenities?.includes('Covered');
    const matches24x7 = !filter24x7 || z.operatingHours === '24/7';
    
    const matchesPrice = z.basePricePerHour <= maxPrice;
    const matchesRating = z.rating >= minRating;

    return matchesSearch && matchesCategory && matchesEV && matchesCovered && matches24x7 && matchesPrice && matchesRating;
  });

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-parking-primary" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-2 sm:px-4">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-asphalt-200 dark:border-asphalt-800 pb-4 gap-4">
        <div>
          <h1 className="text-3xl font-black text-asphalt-900 dark:text-white tracking-tight">Parking Marketplace</h1>
          <p className="text-sm text-asphalt-500 dark:text-asphalt-400 mt-1">Book trusted neighborhood lots with live slot availability.</p>
        </div>
        <Link to="/map" className="btn-primary py-2.5 px-5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-none self-start md:self-center">
          <Navigation className="w-4 h-4" /> Live Map Explorer
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Side filter drawer */}
        <div className="lg:col-span-3 space-y-5">
          <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
            <h3 className="text-xs font-black uppercase text-asphalt-450 tracking-wider flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-parking-primary" /> Filters
            </h3>

            {/* Keyword Search */}
            <div>
              <label className="text-[10px] font-bold text-asphalt-450 uppercase">Location Search</label>
              <div className="relative mt-1.5">
                <Search className="absolute left-2.5 top-3 w-4 h-4 text-asphalt-400" />
                <input 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  placeholder="Area or lot name..." 
                  className="form-input pl-9"
                />
              </div>
            </div>

            {/* Price Slider */}
            <div>
              <div className="flex justify-between items-center text-[10px] font-bold text-asphalt-450 uppercase">
                <span>Max Hourly Fare</span>
                <span className="font-mono text-parking-primary text-xs">₹{maxPrice}/hr</span>
              </div>
              <input 
                type="range" 
                min="20" 
                max="200" 
                step="10"
                value={maxPrice} 
                onChange={e => setMaxPrice(parseInt(e.target.value))} 
                className="w-full mt-2 accent-parking-primary"
              />
            </div>

            {/* Rating Filter */}
            <div>
              <label className="text-[10px] font-bold text-asphalt-450 uppercase">Minimum Rating</label>
              <div className="grid grid-cols-5 gap-1 mt-1.5">
                {[0, 3, 4, 4.5].map((stars) => (
                  <button 
                    key={stars} 
                    onClick={() => setMinRating(stars)}
                    className={`py-1.5 rounded font-bold text-[10px] border transition ${minRating === stars ? 'bg-parking-primary border-parking-primary text-white shadow-sm' : 'bg-white dark:bg-asphalt-900 border-asphalt-250 dark:border-asphalt-800 text-asphalt-650 hover:bg-asphalt-100'}`}
                  >
                    {stars === 0 ? 'All' : `${stars}★`}
                  </button>
                ))}
              </div>
            </div>

            {/* Amenities Switch */}
            <div className="space-y-2 pt-2 border-t border-asphalt-100 dark:border-asphalt-850">
              <label className="text-[10px] font-bold text-asphalt-450 uppercase tracking-widest">Amenities</label>
              
              <label className="flex items-center gap-2.5 text-xs text-asphalt-650 dark:text-asphalt-200 cursor-pointer">
                <input type="checkbox" checked={filterEV} onChange={e => setFilterEV(e.target.checked)} className="w-3.5 h-3.5 rounded text-parking-primary" />
                ⚡ EV Charger Available
              </label>
              
              <label className="flex items-center gap-2.5 text-xs text-asphalt-650 dark:text-asphalt-200 cursor-pointer">
                <input type="checkbox" checked={filterCovered} onChange={e => setFilterCovered(e.target.checked)} className="w-3.5 h-3.5 rounded text-parking-primary" />
                🛡️ Covered / Shelter
              </label>

              <label className="flex items-center gap-2.5 text-xs text-asphalt-650 dark:text-asphalt-200 cursor-pointer">
                <input type="checkbox" checked={filter24x7} onChange={e => setFilter24x7(e.target.checked)} className="w-3.5 h-3.5 rounded text-parking-primary" />
                🕒 Open 24 Hours
              </label>
            </div>
          </div>
        </div>

        {/* Right 9 Columns: Category select tags & Cards Grid */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* Categories tag ribbon */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition whitespace-nowrap border ${selectedCategory === cat.key ? 'bg-parking-primary border-parking-primary text-white shadow-sm' : 'bg-white dark:bg-asphalt-900 border-asphalt-250 dark:border-asphalt-800 text-asphalt-650 hover:bg-asphalt-100'}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Cards Grid */}
          {filteredZones.length === 0 ? (
            <div className="glass-card p-12 text-center flex flex-col items-center justify-center border-dashed border-2">
              <Compass className="w-12 h-12 text-asphalt-300 mb-3" />
              <h4 className="text-sm font-bold text-asphalt-800 dark:text-white">No parking lots match filters.</h4>
              <p className="text-xs text-asphalt-450 mt-1">Try broadening your search or modifying pricing options.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredZones.map((zone, idx) => {
                const isFav = favorites.some(f => f._id === zone._id);
                return (
                  <div key={zone._id || idx} className="glass-card p-0 border border-asphalt-200 dark:border-asphalt-800 overflow-hidden flex flex-col justify-between group hover:scale-[1.01] transition-transform">
                    {/* Parking Image preview card */}
                    <div className="h-40 bg-asphalt-900 relative">
                      <img 
                        src={idx % 2 === 0 ? '/downtown_parking.jpg' : '/plaza_garage.jpg'} 
                        alt={zone.name}
                        className="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-500" 
                      />
                      
                      {/* Heart Favorite button overlay */}
                      <button 
                        onClick={() => handleToggleFavorite(zone._id)}
                        className="absolute top-3 right-3 p-1.5 bg-white/90 dark:bg-asphalt-900/90 backdrop-blur-[2px] rounded-full border border-asphalt-200/50 text-red-500 hover:scale-105 transition shadow-sm"
                      >
                        <Heart className={`w-4 h-4 ${isFav ? 'fill-red-500 text-red-500' : 'text-asphalt-400'}`} />
                      </button>

                      <span className="absolute bottom-3 left-3 badge-blue border-none text-[9px] py-0.5 px-2 uppercase tracking-wider font-bold">
                        {zone.operatingHours || '24/7'}
                      </span>
                    </div>

                    {/* Card details */}
                    <div className="p-4 space-y-2.5">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-bold text-sm text-asphalt-900 dark:text-white leading-tight">{zone.name}</h3>
                          <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-500 shrink-0"><Star className="w-3.5 h-3.5 fill-amber-500" /> {zone.rating?.toFixed(1) || '4.0'}</span>
                        </div>
                        <p className="text-[10px] text-asphalt-500 mt-1 flex items-center gap-0.5"><MapPin className="w-3 h-3 text-asphalt-400" /> {zone.address || 'Delhi NCT'}</p>
                      </div>

                      <div className="flex justify-between items-center border-t border-asphalt-100 dark:border-asphalt-800/80 pt-3 text-xs font-bold">
                        <div>
                          <p className="text-[9px] text-asphalt-450 uppercase">Rate</p>
                          <p className="font-mono text-parking-accent text-sm mt-0.5">₹{zone.basePricePerHour}/hr</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-asphalt-450 uppercase">Available</p>
                          <p className="text-asphalt-800 dark:text-white font-mono mt-0.5">{zone.availableSlots} Slots</p>
                        </div>
                      </div>

                      <button onClick={() => handleOpenDetails(zone)} className="w-full btn-secondary py-2 text-xs font-bold border border-asphalt-250 dark:border-asphalt-800 flex items-center justify-center gap-1.5 shadow-none mt-1 group-hover:bg-asphalt-100 dark:group-hover:bg-asphalt-900 transition-colors">
                        View Slots & Details <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* DETAIL MODAL WITH REVIEWS & ADD FEEDBACK FORM */}
      <AnimatePresence>
        {selectedZone && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-asphalt-950/40 dark:bg-asphalt-950/70 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setSelectedZone(null)}>
            <motion.div 
              initial={{scale:0.97}} 
              animate={{scale:1}} 
              exit={{scale:0.97}} 
              onClick={e => e.stopPropagation()} 
              className="bg-white dark:bg-parking-card rounded-card border border-asphalt-200 dark:border-asphalt-800 p-6 w-full max-w-2xl shadow-2xl relative my-8"
            >
              {/* Close Modal Trigger */}
              <button onClick={() => setSelectedZone(null)} className="absolute top-4 right-4 p-1 hover:bg-asphalt-100 dark:hover:bg-asphalt-800 rounded-lg text-asphalt-450 transition"><X className="w-5 h-5" /></button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                
                {/* Left Side: Images & Info Details */}
                <div className="space-y-4">
                  <div className="h-44 bg-asphalt-900 rounded-xl overflow-hidden relative border border-asphalt-200 dark:border-asphalt-800">
                    <img src="/downtown_parking.jpg" className="w-full h-full object-cover" alt="Parking lot" />
                    <div className="absolute inset-0 bg-gradient-to-t from-asphalt-950/40 to-transparent"></div>
                  </div>

                  <div>
                    <h3 className="text-xl font-black text-asphalt-900 dark:text-white tracking-tight">{selectedZone.name}</h3>
                    <p className="text-xs text-asphalt-500 mt-1 flex items-center gap-0.5"><MapPin className="w-3.5 h-3.5" /> {selectedZone.address}</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold text-asphalt-450 uppercase">Amenities & Features</h4>
                    <div className="flex gap-2 flex-wrap text-xs">
                      {selectedZone.amenities?.map((a, i) => (
                        <span key={i} className="badge-blue border-none py-0.5 px-2 bg-asphalt-50 dark:bg-asphalt-900/60 font-semibold">{a}</span>
                      ))}
                      {selectedZone.vehicleTypesAllowed?.map((vt, i) => (
                        <span key={i} className="badge-yellow border-none py-0.5 px-2 font-bold">{vt}</span>
                      ))}
                    </div>
                  </div>

                  {/* Free coordinates map placeholder to prevent billing limits */}
                  <div className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-850 rounded-xl">
                    <h4 className="text-[10px] font-bold text-asphalt-450 uppercase flex items-center gap-1"><Navigation className="w-3 h-3 text-parking-primary" /> Location Coordinates</h4>
                    <p className="text-xs font-mono font-bold text-asphalt-750 dark:text-asphalt-250 mt-1">Lat: {selectedZone.location.coordinates[1]} • Lng: {selectedZone.location.coordinates[0]}</p>
                    <p className="text-[10px] text-asphalt-400 mt-1.5">Free Leaflet spatial navigation engine active.</p>
                  </div>

                  <Link to="/map" className="w-full btn-primary py-3 text-xs font-bold flex items-center justify-center gap-1.5 shadow-none mt-2">
                    Reserve Spot Now — ₹{selectedZone.basePricePerHour}/hr
                  </Link>
                </div>

                {/* Right Side: Reviews feeds */}
                <div className="space-y-4 flex flex-col justify-between h-[450px]">
                  
                  {/* List stream */}
                  <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                    <h4 className="text-[10px] font-bold text-asphalt-450 uppercase tracking-wider">Driver Feedback & Reviews</h4>
                    {loadingFeedbacks ? (
                      <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
                    ) : feedbacks.length === 0 ? (
                      <p className="text-xs text-asphalt-500 italic py-6 text-center">No reviews submitted yet.</p>
                    ) : (
                      feedbacks.map((f, i) => (
                        <div key={f._id || i} className="p-3 bg-asphalt-50 dark:bg-asphalt-900/40 border border-asphalt-200/50 dark:border-asphalt-800/50 rounded-xl space-y-1.5 relative">
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-asphalt-850 dark:text-white flex items-center gap-1"><User className="w-3 h-3 text-asphalt-400" /> {f.userId?.fullName || 'Anonymous'}</span>
                            <span className="text-amber-500 flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-500" /> {f.rating}★</span>
                          </div>
                          <p className="text-xs text-asphalt-650 dark:text-asphalt-300 leading-normal">"{f.comments}"</p>
                          
                          {/* Own review check actions */}
                          {user && f.userId?._id === user._id && (
                            <div className="flex justify-end gap-2 text-[9px] pt-1">
                              <button onClick={() => { setEditingReviewId(f._id); setNewReviewComment(f.comments); setNewReviewRating(f.rating); }} className="text-parking-primary hover:underline flex items-center gap-0.5 font-bold"><Edit2 className="w-2.5 h-2.5" /> Edit</button>
                              <button onClick={() => handleDeleteReview(f._id)} className="text-parking-danger hover:underline flex items-center gap-0.5 font-bold"><Trash2 className="w-2.5 h-2.5" /> Delete</button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add feedback form */}
                  {user && (
                    <form onSubmit={handleReviewSubmit} className="pt-4 border-t border-asphalt-100 dark:border-asphalt-850 space-y-3 flex-shrink-0">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-asphalt-450 uppercase">{editingReviewId ? 'Edit Your Review' : 'Rate Your Parking Experience'}</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button 
                              key={star} 
                              type="button" 
                              onClick={() => setNewReviewRating(star)}
                              className="text-amber-500 hover:scale-110 transition-transform"
                            >
                              <Star className={`w-4.5 h-4.5 ${newReviewRating >= star ? 'fill-amber-500' : 'text-asphalt-300'}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <input 
                          value={newReviewComment} 
                          onChange={e => setNewReviewComment(e.target.value)} 
                          required 
                          placeholder="Type review comments..." 
                          className="form-input py-2 text-xs flex-1"
                        />
                        <button type="submit" disabled={submittingReview} className="btn-primary py-2 px-3 text-xs font-bold shrink-0 shadow-none">
                          {submittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : editingReviewId ? 'Update' : 'Post'}
                        </button>
                      </div>
                    </form>
                  )}

                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MarketplacePage;
