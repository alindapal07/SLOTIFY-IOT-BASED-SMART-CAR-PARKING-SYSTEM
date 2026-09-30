import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { 
  MapPin, Trophy, Navigation2, QrCode, Clock, Zap, History, Car, Wallet, 
  AlertTriangle, Crown, Loader2, ArrowRight, Star, Heart, CheckCircle2, 
  Bell, BellOff, Compass, Plus, Sparkles, ShieldCheck, Radar, WifiOff,
  ShieldAlert, CheckCircle, CircleDot, LogOut, Timer
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { socket } from '../../services/socket';
import { useI18n } from '../../i18n/index.jsx';
import api from '../../services/api';

const DriverDashboard = () => {
  const { user, updateWalletBalance } = useStore();
  const { t } = useI18n();
  const navigate = useNavigate();

  // Primary Data states
  const [activeBooking, setActiveBooking] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  
  // Phase 17: Vehicle Presence Engine state
  const [vehiclePresence, setVehiclePresence] = useState(null);
  // Shape: { bookingId, vehicleStatus, lastSensorUpdate, slotIdentifier, sensorHealth }

  // Loading & Submitting UI states
  const [loading, setLoading] = useState(true);
  const [extending, setExtending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendHours, setExtendHours] = useState(1);
  const [gateMsg, setGateMsg] = useState('');
  
  // Phase 23E: Waiting Queue State
  const [queueStatus, setQueueStatus] = useState(null);

  // Fetch all necessary driver dashboard feeds
  const fetchData = async () => {
    try {
      const [activeRes, bookingsRes, walletRes, favRes, notifRes, vehicleRes, queueRes] = await Promise.all([
        api.get('/bookings/active'),
        api.get('/bookings/my'),
        api.get('/wallet'),
        api.get('/parking/favorites').catch(() => ({ data: [] })),
        api.get('/notifications').catch(() => ({ data: [] })),
        api.get('/vehicles').catch(() => ({ data: [] })),
        api.get('/queue/status').catch(() => ({ data: null }))
      ]);

      setActiveBooking(activeRes.data);
      setRecentBookings(bookingsRes.data || []);
      if (walletRes.data) updateWalletBalance(walletRes.data.balance);
      setFavorites(favRes.data || []);
      setNotifications(notifRes.data || []);
      setVehicles(vehicleRes.data || []);
      setQueueStatus(queueRes.data || null);

      // Phase 17: restore vehiclePresence from active booking fields
      if (activeRes.data && activeRes.data.vehicleStatus) {
        setVehiclePresence({
          bookingId: activeRes.data._id,
          vehicleStatus: activeRes.data.vehicleStatus,
          lastSensorUpdate: activeRes.data.lastSensorUpdate,
          slotIdentifier: activeRes.data.slotId?.slotIdentifier || null,
          sensorHealth: activeRes.data.sensorHealth || 'OK'
        });
      } else {
        setVehiclePresence(null);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Phase 23E: Offered reservation timer state & countdown
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (queueStatus && queueStatus.status === 'Offered' && queueStatus.expiresAt) {
      const calcSec = () => Math.max(0, Math.floor((new Date(queueStatus.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsRemaining(calcSec());
      const interval = setInterval(() => {
        const sec = calcSec();
        setSecondsRemaining(sec);
        if (sec <= 0) {
          clearInterval(interval);
          fetchData(); // reload when timer expires
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [queueStatus]);

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  // Set up socket listeners for barrier logs, confirmation updates, and live push notifications
  useEffect(() => {
    if (user?._id) {
      if (!socket.connected) socket.connect();
      socket.emit('JOIN_USER_ROOM', user._id);
      
      const onBarrier = (data) => {
        setGateMsg(`Gate ${data.gateId} Opened at ${new Date(data.time).toLocaleTimeString()}`);
        fetchData();
      };
      
      const onBooking = () => {
        fetchData();
      };

      const onNewNotification = (notif) => {
        setNotifications(prev => [notif, ...prev]);
        // Trigger native HTML5 desktop browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(notif.title, {
            body: notif.message
          });
        }
      };

      // Phase 17: Vehicle Presence Engine real-time updates
      const onVehicleStatus = (data) => {
        setVehiclePresence(data);
        // If vehicle went MISSING, also push a notification into local state
        if (data.vehicleStatus === 'MISSING') {
          setNotifications(prev => [{
            _id: `theft_${Date.now()}`,
            title: '⚠️ Theft Alert: Vehicle Missing!',
            message: `Your vehicle is no longer detected at slot ${data.slotIdentifier}.`,
            type: 'ALERT',
            isRead: false,
            createdAt: new Date().toISOString()
          }, ...prev]);
        }
      };

      // Phase 17: Booking cancelled for no-show
      const onBookingCancelled = (data) => {
        if (data.reason === 'NO_SHOW') {
          setActiveBooking(null);
          setVehiclePresence(null);
          setGateMsg('⚠️ Your booking was cancelled — No Show. A full refund has been issued.');
        }
        fetchData();
      };

      // Phase 23E: Waiting queue state change
      const onQueueStateChanged = () => {
        fetchData();
      };

      const onQueueOffered = () => {
        fetchData();
      };

      socket.on('BARRIER_OPENED', onBarrier);
      socket.on('BOOKING_CONFIRMED', onBooking);
      socket.on('NEW_NOTIFICATION', onNewNotification);
      socket.on('VEHICLE_STATUS_UPDATE', onVehicleStatus);
      socket.on('BOOKING_CANCELLED', onBookingCancelled);
      socket.on('QUEUE_OFFERED', onQueueOffered);
      socket.on('QUEUE_STATE_CHANGED', onQueueStateChanged);

      return () => {
        socket.off('BARRIER_OPENED', onBarrier);
        socket.off('BOOKING_CONFIRMED', onBooking);
        socket.off('NEW_NOTIFICATION', onNewNotification);
        socket.off('VEHICLE_STATUS_UPDATE', onVehicleStatus);
        socket.off('BOOKING_CANCELLED', onBookingCancelled);
        socket.off('QUEUE_OFFERED', onQueueOffered);
        socket.off('QUEUE_STATE_CHANGED', onQueueStateChanged);
      };
    }
  }, [user?._id]);

  // Handle active session extensions
  const handleExtend = async () => {
    if (!activeBooking) return;
    setExtending(true);
    try {
      await api.post(`/bookings/${activeBooking._id}/extend`, { hours: extendHours });
      setShowExtendModal(false);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Extension failed');
    } finally {
      setExtending(false);
    }
  };

  // Handle checking out / completing active parking
  const handleEndSession = async () => {
    if (!activeBooking) return;
    setEnding(true);
    try {
      await api.post(`/bookings/${activeBooking._id}/complete`);
      setActiveBooking(null);
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setEnding(false);
    }
  };

  // Handle cancelling booking before entry QR is scanned
  const handleCancelBooking = async () => {
    if (!activeBooking) return;
    if (!window.confirm('Are you sure you want to cancel this booking? A full refund will be processed to your wallet.')) return;
    setEnding(true);
    try {
      await api.post(`/bookings/${activeBooking._id}/cancel`);
      setActiveBooking(null);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Cancellation failed');
    } finally {
      setEnding(false);
    }
  };

  // Phase 23E: Accept slot offer from waiting queue
  const handleAcceptOffer = async () => {
    if (!queueStatus) return;
    setEnding(true); // reuse loading state
    try {
      const { data } = await api.post('/queue/accept', { queueId: queueStatus._id });
      setQueueStatus(null);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to accept offer');
    } finally {
      setEnding(false);
    }
  };

  // Phase 23E: Decline slot offer from waiting queue
  const handleDeclineOffer = async () => {
    if (!queueStatus) return;
    if (!window.confirm('Are you sure you want to decline this offer? You will be removed from the queue.')) return;
    setEnding(true);
    try {
      await api.post('/queue/decline', { queueId: queueStatus._id });
      setQueueStatus(null);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to decline offer');
    } finally {
      setEnding(false);
    }
  };

  // Phase 23E: Leave waiting queue
  const handleLeaveQueue = async () => {
    if (!queueStatus) return;
    if (!window.confirm('Are you sure you want to leave the waiting queue?')) return;
    setEnding(true);
    try {
      await api.post('/queue/leave', { queueId: queueStatus._id });
      setQueueStatus(null);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to leave queue');
    } finally {
      setEnding(false);
    }
  };

  // Handle removing a lot from favorites
  const handleRemoveFavorite = async (zoneId) => {
    try {
      await api.post('/parking/favorites/toggle', { zoneId });
      setFavorites(prev => prev.filter(f => f._id !== zoneId));
    } catch (err) {
      console.error(err);
    }
  };

  // Mark notification as read
  const handleMarkRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };

  // Compute parking stats dynamically from user bookings
  const completedBookings = recentBookings.filter(b => b.status === 'Completed');
  const totalMoneySpent = completedBookings.reduce((sum, b) => sum + b.totalCost, 0);
  const totalHoursParked = completedBookings.reduce((sum, b) => sum + (b.hours || 1), 0);
  const totalSpotsVisited = new Set(completedBookings.map(b => b.zoneId?._id)).size;

  // Upcoming bookings whose startTime is in the future
  const upcomingBookings = recentBookings.filter(b => 
    b.status === 'Confirmed' && new Date(b.startTime) > new Date()
  );

  const score = 850;
  const tier = score >= 900 ? 'Platinum' : score >= 700 ? 'Gold' : score >= 400 ? 'Silver' : 'Bronze';
  const progressPercent = (score / 1000) * 100;
  const timeRemaining = activeBooking ? Math.max(0, Math.floor((new Date(activeBooking.endTime) - Date.now()) / 60000)) : 0;
const canEnd = vehiclePresence && vehiclePresence.vehicleStatus === 'EXITED';

  // Skeletons when fetching initial load
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 px-4 py-8">
        <div className="h-8 bg-asphalt-200 dark:bg-asphalt-900 rounded w-1/4 animate-pulse"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-44 bg-asphalt-200 dark:bg-asphalt-900 rounded-xl animate-pulse"></div>
            <div className="h-64 bg-asphalt-200 dark:bg-asphalt-900 rounded-xl animate-pulse"></div>
          </div>
          <div className="h-80 bg-asphalt-200 dark:bg-asphalt-900 rounded-xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 sm:px-4">
      {/* 🚧 Real-time Barrier alerts */}
      <AnimatePresence>
        {gateMsg && (
          <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} className="bg-parking-accent text-white p-4 rounded-xl shadow-sm font-semibold flex justify-between items-center text-sm border border-green-700/20 z-40 relative">
            <span>🚧 {gateMsg}</span>
            <button onClick={() => setGateMsg('')} className="underline text-xs hover:opacity-90">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cockpit Welcoming Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-2 border-b border-asphalt-200 dark:border-asphalt-800">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-asphalt-900 dark:text-white">{t('dashboard.welcome')} {user?.fullName?.split(' ')[0] || 'Driver'}!</h1>
          <p className="text-sm text-asphalt-500 dark:text-asphalt-400 mt-1">{t('dashboard.welcomeSub')}</p>
        </div>
        {user?.isPremium && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-full text-xs font-bold self-start sm:self-center">
            <Crown className="w-3.5 h-3.5" /> Premium Member
          </div>
        )}
      </div>

{/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 8 Columns: Active Parking, Stats, Favorites, Bookings */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Active Parking Session Display */}
          {activeBooking ? (
            <div className="glass-card p-6 border-l-4 border-l-parking-primary space-y-5">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <span className="badge-blue inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Active Reservation
                  </span>
                  <h2 className="text-2xl font-black tracking-tight text-asphalt-900 dark:text-white mt-3">{activeBooking.zoneId?.name || 'Parking Zone'}</h2>
                  <p className="flex items-center gap-1.5 text-xs text-asphalt-500 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-asphalt-400" /> 
                    Slot <span className="font-bold text-asphalt-700 dark:text-asphalt-300">{activeBooking.slotId?.slotIdentifier || 'N/A'}</span>
                    {activeBooking.slotId?.isEV && <span className="badge-emerald py-0.5 px-2 text-[10px] ml-1.5">⚡ EV CHARGER</span>}
                  </p>
                </div>
                <Link to={`/driver/booking-confirmation/${activeBooking._id}`} className="p-2.5 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-lg text-center flex flex-col items-center hover:bg-asphalt-100 dark:hover:bg-asphalt-800 transition-colors cursor-pointer group">
                  <QrCode className="w-9 h-9 text-parking-primary group-hover:scale-105 transition-transform" />
                  <span className="text-[8px] font-bold text-parking-primary uppercase mt-1 tracking-wider">View QR</span>
                </Link>
              </div>

              {/* ─── PHASE 17: VEHICLE STATUS PANEL ──────────────────────── */}
              {vehiclePresence && (() => {
                const vs = vehiclePresence.vehicleStatus;
                const statusConfig = {
                  WAITING_FOR_ENTRY: {
                    icon: <Timer className="w-4 h-4" />,
                    label: 'Waiting For Arrival',
                    sub: 'Drive to your slot and scan QR at the gate to confirm entry.',
                    color: 'text-amber-600 dark:text-amber-400',
                    bg: 'bg-amber-50 dark:bg-amber-950/20',
                    border: 'border-amber-200 dark:border-amber-800/40',
                    dot: 'bg-amber-400 animate-pulse',
                    badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  },
                  PARKED: {
                    icon: <CheckCircle className="w-4 h-4" />,
                    label: 'Vehicle Parked ✓',
                    sub: 'IR sensor confirms your vehicle is safely in the slot.',
                    color: 'text-emerald-600 dark:text-emerald-400',
                    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
                    border: 'border-emerald-200 dark:border-emerald-800/40',
                    dot: 'bg-emerald-400',
                    badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  },
                  MISSING: {
                    icon: <ShieldAlert className="w-4 h-4" />,
                    label: '⚠️ THEFT ALERT — Vehicle Missing!',
                    sub: 'IR sensor no longer detects your vehicle. Booking stays active. Verify immediately.',
                    color: 'text-red-600 dark:text-red-400',
                    bg: 'bg-red-50 dark:bg-red-950/20',
                    border: 'border-red-300 dark:border-red-700/60',
                    dot: 'bg-red-500 animate-ping',
                    badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  },
                  EXITED: {
                    icon: <LogOut className="w-4 h-4" />,
                    label: 'Session Completed',
                    sub: 'Your vehicle has exited the parking zone.',
                    color: 'text-asphalt-500 dark:text-asphalt-400',
                    bg: 'bg-asphalt-50 dark:bg-asphalt-900/40',
                    border: 'border-asphalt-200 dark:border-asphalt-800',
                    dot: 'bg-asphalt-400',
                    badge: 'bg-asphalt-100 dark:bg-asphalt-800 text-asphalt-600 dark:text-asphalt-300'
                  },
                  EXITING: {
                    icon: <LogOut className="w-4 h-4" />,
                    label: 'Exiting — Awaiting Sensor',
                    sub: 'Exit QR scanned. Slot will be freed once IR sensor detects vehicle absence.',
                    color: 'text-blue-600 dark:text-blue-400',
                    bg: 'bg-blue-50 dark:bg-blue-950/20',
                    border: 'border-blue-200 dark:border-blue-800/40',
                    dot: 'bg-blue-400 animate-pulse',
                    badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  },
                  NO_SHOW: {
                    icon: <WifiOff className="w-4 h-4" />,
                    label: 'Booking Cancelled — No Show',
                    sub: 'You did not arrive within 30 minutes. A full refund has been issued.',
                    color: 'text-asphalt-500',
                    bg: 'bg-asphalt-50 dark:bg-asphalt-900/40',
                    border: 'border-asphalt-200 dark:border-asphalt-800',
                    dot: 'bg-asphalt-400',
                    badge: 'bg-asphalt-100 dark:bg-asphalt-800 text-asphalt-600'
                  }
                };
                const cfg = statusConfig[vs] || statusConfig.WAITING_FOR_ENTRY;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-xl border p-4 space-y-3 ${cfg.bg} ${cfg.border}`}
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center gap-2 font-bold text-sm ${cfg.color}`}>
                        {cfg.icon}
                        <span>{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${cfg.dot} relative`}></span>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${cfg.badge}`}>
                          IR SENSOR
                        </span>
                      </div>
                    </div>

                    {/* Sub message */}
                    <p className="text-[11px] text-asphalt-500 dark:text-asphalt-400 leading-relaxed">{cfg.sub}</p>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <p className="text-[9px] font-bold text-asphalt-400 uppercase tracking-wider">Last Sensor Update</p>
                        <p className="text-xs font-semibold text-asphalt-700 dark:text-asphalt-200 mt-0.5">
                          {vehiclePresence.lastSensorUpdate
                            ? new Date(vehiclePresence.lastSensorUpdate).toLocaleTimeString()
                            : 'Awaiting signal...'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-asphalt-400 uppercase tracking-wider">Sensor Health</p>
                        <p className={`text-xs font-semibold mt-0.5 ${
                          vehiclePresence.sensorHealth === 'OK' ? 'text-emerald-500' :
                          vehiclePresence.sensorHealth === 'DEGRADED' ? 'text-amber-500' : 'text-red-500'
                        }`}>
                          {vehiclePresence.sensorHealth || 'Unknown'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-asphalt-400 uppercase tracking-wider">Parking Zone</p>
                        <p className="text-xs font-semibold text-asphalt-700 dark:text-asphalt-200 mt-0.5">
                          {activeBooking.zoneId?.name || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-asphalt-400 uppercase tracking-wider">Slot Number</p>
                        <p className="text-xs font-semibold text-asphalt-700 dark:text-asphalt-200 mt-0.5">
                          {vehiclePresence.slotIdentifier || activeBooking.slotId?.slotIdentifier || '—'}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
              {/* ─── END PHASE 17 VEHICLE STATUS PANEL ──────────────────── */}

              {/* Remaining time strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-asphalt-50 dark:bg-asphalt-900/60 border border-asphalt-200/60 dark:border-asphalt-800/60 rounded-xl">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-parking-primary" />
                  <div>
                    <p className="text-[10px] text-asphalt-550 font-bold uppercase tracking-wider">Remaining Duration</p>
                    <p className="text-base font-bold text-asphalt-850 dark:text-asphalt-100 mt-0.5">
                      {timeRemaining > 0 ? `${Math.floor(timeRemaining / 60)}h ${timeRemaining % 60}m` : <span className="text-parking-danger">Expired! Fines apply</span>}
                    </p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <p className="text-[10px] text-asphalt-550 font-bold uppercase tracking-wider">Total Rate Paid</p>
                  <p className="text-base font-black text-asphalt-850 dark:text-asphalt-100 mt-0.5">₹{activeBooking.totalCost} <span className="text-xs text-asphalt-400 font-normal">/ {activeBooking.hours} hrs</span></p>
                </div>
              </div>

              <div className="flex gap-2">
                {activeBooking.entryStatus !== 'Entered' ? (
                  <button onClick={handleCancelBooking} disabled={ending} className="flex-1 btn-secondary py-2.5 text-xs font-bold text-parking-danger hover:bg-red-50 dark:hover:bg-red-950/15 border border-red-200/50 dark:border-red-900/20 shadow-none">
                    {ending ? 'Cancelling...' : 'Cancel Reservation'}
                  </button>
                ) : (
                  <>
                    <button onClick={() => setShowExtendModal(true)} className="flex-1 btn-primary py-2.5 text-xs font-bold shadow-none">
                      Extend Booking
                    </button>
                    <button onClick={handleEndSession} disabled={ending || !canEnd} className="flex-1 btn-secondary py-2.5 text-xs font-bold text-parking-danger hover:bg-red-50 dark:hover:bg-red-950/15 border border-red-200/50 dark:border-red-900/20 shadow-none">
                      {ending ? 'Checking out...' : 'End Parking Session'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : queueStatus ? (
            <div className="glass-card p-6 border-l-4 border-l-amber-500 space-y-5">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                    queueStatus.status === 'Offered' ? 'bg-amber-100 text-amber-700 animate-pulse' : 'bg-blue-100 text-blue-700'
                  }`}>
                    <Clock className="w-3.5 h-3.5" />
                    {queueStatus.status === 'Offered' ? 'Waiting Queue Offer!' : 'Waiting Queue Joined'}
                  </span>
                  <h2 className="text-2xl font-black tracking-tight text-asphalt-900 dark:text-white mt-3">
                    {queueStatus.zoneId?.name || 'Parking Space'}
                  </h2>
                  <p className="flex items-center gap-1.5 text-xs text-asphalt-500 mt-1">
                    <Car className="w-3.5 h-3.5 text-asphalt-400" />
                    Category: <span className="font-bold text-asphalt-700 dark:text-asphalt-300">{queueStatus.vehicleType}</span>
                    {queueStatus.vehiclePlate && (
                      <span className="text-asphalt-400">&bull; {queueStatus.vehiclePlate}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Waiting status specs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-asphalt-50/50 dark:bg-asphalt-900/40 border border-asphalt-200/60 dark:border-asphalt-800/60 rounded-xl">
                <div>
                  <p className="text-[10px] text-asphalt-550 font-bold uppercase tracking-wider">Queue Position</p>
                  <p className="text-lg font-black text-asphalt-850 dark:text-white mt-0.5">
                    {queueStatus.status === 'Offered' ? (
                      <span className="text-amber-600 dark:text-amber-400">Offered!</span>
                    ) : (
                      `#${queueStatus.queuePosition}`
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-asphalt-550 font-bold uppercase tracking-wider">Estimated Wait Time</p>
                  <p className="text-lg font-black text-asphalt-850 dark:text-white mt-0.5">
                    {queueStatus.status === 'Offered' ? '0 mins' : `~${queueStatus.waitTimeMinutes} mins`}
                  </p>
                </div>
              </div>

              {/* Offered Details */}
              {queueStatus.status === 'Offered' && (
                <div className="bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-asphalt-500 font-medium">Offered Slot:</span>
                    <span className="font-bold text-amber-600">{queueStatus.offeredSlotId?.slotIdentifier || 'Free slot'}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-asphalt-500 font-medium">Time to Accept:</span>
                    <span className="font-bold text-red-650 font-mono text-base">
                      {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {queueStatus.status === 'Offered' ? (
                  <>
                    <button onClick={handleAcceptOffer} disabled={ending} className="flex-1 btn-primary py-2.5 text-xs font-bold shadow-none">
                      {ending ? 'Accepting...' : 'Accept Offer (₹40)'}
                    </button>
                    <button onClick={handleDeclineOffer} disabled={ending} className="flex-1 btn-secondary py-2.5 text-xs font-bold text-parking-danger hover:bg-red-50 dark:hover:bg-red-950/15 border border-red-200/50 dark:border-red-900/20 shadow-none">
                      Decline
                    </button>
                  </>
                ) : (
                  <button onClick={handleLeaveQueue} disabled={ending} className="w-full btn-secondary py-2.5 text-xs font-bold text-parking-danger hover:bg-red-50 dark:hover:bg-red-950/15 border border-red-200/50 dark:border-red-900/20 shadow-none">
                    {ending ? 'Leaving...' : 'Leave Waiting Queue'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <Link to="/map" className="block glass-card p-8 border-dashed border-2 hover:border-parking-primary hover:bg-asphalt-50/50 dark:hover:bg-asphalt-900/20 text-center flex flex-col items-center justify-center transition-all group">
              <div className="w-12 h-12 rounded-full bg-asphalt-100 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 flex items-center justify-center mb-3.5 group-hover:scale-105 transition-transform">
                <Compass className="w-6 h-6 text-parking-primary" />
              </div>
              <h3 className="text-sm font-bold text-asphalt-850 dark:text-white mb-1">No Active Parking Reservation</h3>
              <p className="text-xs text-asphalt-500 max-w-sm">Tap here to view local slots on the parking search map.</p>
            </Link>
          )}

          {/* Dynamic Parking Stats Panel */}
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card p-4 border border-asphalt-200 dark:border-asphalt-800">
              <span className="text-[10px] font-bold text-asphalt-450 uppercase tracking-widest block">Hours Saved</span>
              <h4 className="text-xl font-black text-asphalt-850 dark:text-white mt-1.5 font-mono">{totalHoursParked} hrs</h4>
            </div>
            <div className="glass-card p-4 border border-asphalt-200 dark:border-asphalt-800">
              <span className="text-[10px] font-bold text-asphalt-450 uppercase tracking-widest block">Spots Visited</span>
              <h4 className="text-xl font-black text-asphalt-850 dark:text-white mt-1.5 font-mono">{totalSpotsVisited} lots</h4>
            </div>
            <div className="glass-card p-4 border border-asphalt-200 dark:border-asphalt-800">
              <span className="text-[10px] font-bold text-asphalt-450 uppercase tracking-widest block">Money Spent</span>
              <h4 className="text-xl font-black text-asphalt-850 dark:text-white mt-1.5 font-mono">₹{totalMoneySpent}</h4>
            </div>
          </div>

          {/* Upcoming bookings list */}
          {upcomingBookings.length > 0 && (
            <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-asphalt-450">Upcoming Bookings</h3>
              <div className="space-y-2">
                {upcomingBookings.map((b, i) => (
                  <div key={b._id || i} className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200/60 dark:border-asphalt-800/60 rounded-lg flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs text-asphalt-850 dark:text-white">{b.zoneId?.name || 'Parking Zone'}</p>
                      <p className="text-[10px] text-asphalt-450 mt-0.5">Starts: {new Date(b.startTime).toLocaleString()} • Slot: {b.slotId?.slotIdentifier || 'N/A'}</p>
                    </div>
                    <span className="badge-blue uppercase tracking-wider text-[9px] border-none font-bold">Confirmed</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Favorite Lots */}
          <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 space-y-3">
            <div className="flex justify-between items-center border-b border-asphalt-100 dark:border-asphalt-800 pb-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-asphalt-450 flex items-center gap-1"><Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" /> Favorites</h3>
              <Link to="/map" className="text-[10px] text-parking-primary font-bold hover:underline">Find more</Link>
            </div>
            {favorites.length === 0 ? (
              <p className="text-center text-xs text-asphalt-450 py-4">Save parking lots on the map to see them here.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {favorites.map((fav, i) => (
                  <div key={fav._id || i} className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-850 rounded-lg flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-bold text-xs text-asphalt-850 dark:text-white leading-snug">{fav.name}</h4>
                        <button onClick={() => handleRemoveFavorite(fav._id)} className="text-red-500 hover:opacity-80 shrink-0"><Heart className="w-3.5 h-3.5 fill-red-500" /></button>
                      </div>
                      <p className="text-[10px] text-asphalt-500 mt-1">{fav.address || 'Address not listed'}</p>
                    </div>
                    <div className="flex justify-between items-center border-t border-asphalt-100 dark:border-asphalt-800/60 pt-2.5 mt-3 text-[10px]">
                      <span className="font-bold text-parking-primary font-mono">₹{fav.basePricePerHour}/hr</span>
                      <Link to="/map" className="text-parking-accent hover:underline font-bold">Reserve</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Booking History Table */}
          <div className="glass-card p-0 border border-asphalt-200 dark:border-asphalt-800">
            <div className="p-5 border-b border-asphalt-200 dark:border-asphalt-800">
              <h3 className="font-bold text-xs uppercase tracking-wider text-asphalt-450">Recent History</h3>
            </div>
            {recentBookings.length === 0 ? (
              <div className="p-8 text-center text-xs text-asphalt-500">No transactions recorded yet.</div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-asphalt-50 dark:bg-asphalt-900/40 border-b border-asphalt-200 dark:border-asphalt-800">
                      <th className="py-2.5 px-4 font-bold text-asphalt-500 uppercase">Lot</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-500 uppercase">Slot</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-500 uppercase">Cost</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-500 uppercase">Date</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-500 uppercase text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.slice(0, 5).map((b, i) => (
                      <tr key={b._id || i} className="border-b border-asphalt-100 dark:border-asphalt-800/50 hover:bg-asphalt-50/50 dark:hover:bg-asphalt-900/10 transition-colors last:border-none">
                        <td className="py-3.5 px-4 font-semibold text-asphalt-900 dark:text-white">{b.zoneId?.name || 'Parking Lot'}</td>
                        <td className="py-3.5 px-4 text-asphalt-600 dark:text-asphalt-300 font-medium">{b.slotId?.slotIdentifier || 'Slot'}</td>
                        <td className="py-3.5 px-4 font-bold font-mono">₹{b.totalCost}</td>
                        <td className="py-3.5 px-4 text-[10px] text-asphalt-400">{new Date(b.createdAt).toLocaleDateString()}</td>
                        <td className="py-3.5 px-4 text-right">
                          <button onClick={() => {
                            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(b, null, 2));
                            const dlAnchorElem = document.createElement('a');
                            dlAnchorElem.setAttribute("href",     dataStr     );
                            dlAnchorElem.setAttribute("download", `receipt_${b._id || i}.json`);
                            dlAnchorElem.click();
                          }} className="text-parking-primary font-bold hover:underline text-[10px] uppercase tracking-wider">Receipt</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Columns: Gamification, AI Recommendations, Vehicle summaries, Notifications */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Rewards Gamification */}
          <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
            <span className="badge-yellow inline-flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" /> Rewards Level
            </span>
            <div className="pt-1">
              <h3 className="text-3xl font-black text-yellow-600 dark:text-yellow-400 font-mono">{score}</h3>
              <p className="font-bold text-xs text-asphalt-800 dark:text-asphalt-200 mt-1">{tier} Driver Level</p>
              <p className="text-[10px] text-asphalt-500 leading-relaxed mt-1">Safely park and unlock up to 15% discount on surge rates.</p>
            </div>
            <div className="relative w-full bg-asphalt-200 dark:bg-asphalt-900 rounded-full h-1.5 mt-4">
              <div className="bg-parking-surge h-1.5 rounded-full" style={{ width: `${progressPercent}%` }}></div>
            </div>
          </div>

          {/* In-App Notifications Alert Box */}
          <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
            <div className="flex justify-between items-center border-b border-asphalt-100 dark:border-asphalt-800 pb-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-asphalt-450 flex items-center gap-1.5"><Bell className="w-4 h-4 text-parking-primary" /> Notifications</h3>
              {notifications.some(n => !n.isRead) && (
                <button onClick={handleMarkAllRead} className="text-[9px] font-bold text-parking-primary hover:underline uppercase tracking-wider">Read all</button>
              )}
            </div>
            <div className="space-y-3.5 max-h-56 overflow-y-auto pr-1">
              {notifications.length === 0 ? (
                <p className="text-center text-xs text-asphalt-500 py-6">No notifications yet.</p>
              ) : (
                notifications.map((n, i) => (
                  <div key={n._id || i} onClick={() => !n.isRead && handleMarkRead(n._id)} className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors relative ${n.isRead ? 'bg-asphalt-50/50 dark:bg-asphalt-900/20 border-asphalt-200/50 dark:border-asphalt-850' : 'bg-blue-50/30 dark:bg-blue-950/15 border-blue-200/40 dark:border-blue-900/30'}`}>
                    {!n.isRead && <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-parking-primary rounded-full"></span>}
                    <h4 className="font-bold text-asphalt-850 dark:text-white leading-tight">{n.title}</h4>
                    <p className="text-[10px] text-asphalt-500 mt-1 leading-normal">{n.message}</p>
                    <span className="text-[8px] text-asphalt-400 font-bold block mt-1.5 uppercase font-mono">{new Date(n.createdAt).toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AI Recommended Parking */}
          <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
            <span className="badge-blue inline-flex items-center gap-1 px-2.5 py-0.5 border-none font-black text-[9px] uppercase tracking-wider bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400">
              <Sparkles className="w-3 h-3" /> AI Recommended Spot
            </span>
            <div className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200/80 dark:border-asphalt-800/80 rounded-lg space-y-2">
              <h4 className="font-bold text-xs text-asphalt-900 dark:text-white">Connaught Plaza Block-A</h4>
              <p className="text-[10px] text-asphalt-500">Based on your daily routing habits. 94% probability of free slot upon arrival.</p>
              <div className="flex justify-between items-center border-t border-asphalt-200/40 dark:border-asphalt-800/50 pt-2 mt-2">
                <span className="text-[10px] font-bold text-parking-accent">9 slots free</span>
                <Link to="/map" className="text-[10px] font-bold text-parking-primary hover:underline">Reserve Spot</Link>
              </div>
            </div>
          </div>

          {/* Vehicles Summary */}
          <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 space-y-3">
            <div className="flex justify-between items-center border-b border-asphalt-100 dark:border-asphalt-800 pb-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-asphalt-450 flex items-center gap-1.5"><Car className="w-4 h-4 text-purple-500" /> Vehicles</h3>
              <Link to="/driver/vehicles" className="text-[10px] text-parking-primary font-bold hover:underline">Manage</Link>
            </div>
            {vehicles.length === 0 ? (
              <p className="text-center text-xs text-asphalt-400 py-2">No vehicles added.</p>
            ) : (
              <div className="space-y-2">
                {vehicles.map((v, i) => (
                  <div key={v._id || i} className="p-2.5 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200/50 dark:border-asphalt-850 rounded-lg flex items-center justify-between text-xs">
                    <span className="font-bold text-asphalt-850 dark:text-white">{v.make} {v.model}</span>
                    <span className="font-mono font-black text-asphalt-500 tracking-wider text-[10px] uppercase">{v.licensePlate}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Active Session Extension Modal */}
      <AnimatePresence>
        {showExtendModal && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-asphalt-950/40 dark:bg-asphalt-950/70 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setShowExtendModal(false)}>
            <motion.div 
              initial={{scale:0.97}} 
              animate={{scale:1}} 
              exit={{scale:0.97}} 
              onClick={e => e.stopPropagation()} 
              className="bg-white dark:bg-parking-card rounded-card border border-asphalt-200 dark:border-asphalt-800 p-6 w-full max-w-sm shadow-lg space-y-4 text-center"
            >
              <h3 className="text-lg font-black text-asphalt-900 dark:text-white">Extend Parking Session</h3>
              <p className="text-xs text-asphalt-500 leading-relaxed">Choose the additional duration you wish to extend the slot for. Fares will be debited from your wallet.</p>
              
              <div className="grid grid-cols-4 gap-2 py-2">
                {[1, 2, 3, 4].map(h => (
                  <button 
                    key={h} 
                    onClick={() => setExtendHours(h)} 
                    className={`py-2 rounded font-bold text-xs border ${extendHours === h ? 'bg-parking-primary border-parking-primary text-white' : 'bg-white dark:bg-asphalt-900 border-asphalt-250 dark:border-asphalt-800 text-asphalt-800 dark:text-asphalt-200'}`}
                  >
                    +{h}h
                  </button>
                ))}
              </div>

              {activeBooking?.zoneId && (
                <p className="text-sm font-bold text-asphalt-800 dark:text-white pt-1">
                  Extension Cost: ₹{Math.round(activeBooking.zoneId.basePricePerHour * extendHours)}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={handleExtend} disabled={extending} className="flex-1 btn-primary py-2.5 text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-none">
                  {extending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Confirm
                </button>
                <button onClick={() => setShowExtendModal(false)} className="flex-1 btn-secondary py-2.5 text-xs font-bold border border-asphalt-250 dark:border-asphalt-800 shadow-none">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DriverDashboard;
