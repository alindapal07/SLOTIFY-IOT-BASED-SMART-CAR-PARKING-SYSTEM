import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  QrCode, RefreshCw, CheckCircle2, AlertTriangle, Play, MapPin, 
  Car, Clock, User, ChevronRight, Server, ShieldCheck, HelpCircle
} from 'lucide-react';
import api from '../../services/api';

const GateSimulator = ({ onRefresh }) => {
  const [zones, setZones] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedGate, setSelectedGate] = useState('GATE-MAIN-01');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Manual scanner inputs
  const [manualPayload, setManualPayload] = useState('');
  const [manualAction, setManualAction] = useState('ENTRY');
  
  // Scan result state
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const [scanningId, setScanningId] = useState(null);

  const loadData = async () => {
    try {
      const [zonesRes, bookingsRes] = await Promise.all([
        api.get('/parking/zones/me'),
        api.get('/bookings/provider')
      ]);
      setZones(zonesRes.data || []);
      setBookings(bookingsRes.data || []);
      
      // Auto select first zone if none selected
      if (zonesRes.data?.length > 0 && !selectedZoneId) {
        setSelectedZoneId(zonesRes.data[0]._id);
      }
    } catch (err) {
      console.error('Failed to load data for Gate Simulator:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setScanResult(null);
    setScanError('');
    loadData();
  };

  const selectedZone = zones.find(z => z._id === selectedZoneId);

  // Entry Simulator: bookings with status === 'Confirmed' or 'ENTERING'
  // Exit Simulator: bookings with any active/in-progress status
  const zoneBookings = bookings.filter(b => b.zoneId?._id === selectedZoneId);
  const entryBookings = zoneBookings.filter(b => ['Confirmed', 'ENTERING'].includes(b.status));
  const exitBookings = zoneBookings.filter(b => ['Active', 'PARKED', 'ENTERING', 'EXITING'].includes(b.status));

  const executeScan = async (booking, action) => {
    if (!booking?.qrCodeData) {
      setScanError('This booking does not have valid QR code data generated.');
      return;
    }

    setScanningId(booking._id);
    setScanResult(null);
    setScanError('');

    try {
      // Decode base64 to retrieve the raw AES encrypted payload
      let rawPayload = '';
      try {
        rawPayload = window.atob(booking.qrCodeData);
      } catch (e) {
        rawPayload = booking.qrCodeData; // fallback if already raw
      }

      // Mock coordinates near the zone to bypass GPS radius validation
      const lat = selectedZone?.location?.coordinates?.[1] || 28.5355;
      const lng = selectedZone?.location?.coordinates?.[0] || 77.3910;

      const payload = {
        gateId: selectedGate,
        zoneId: selectedZoneId,
        qrPayload: rawPayload,
        action: action, // 'ENTRY' or 'EXIT'
        driverLat: lat,
        driverLng: lng
      };

      const { data } = await api.post('/iot/scan-qr', payload);
      setScanResult({
        success: true,
        command: data.command,
        displayMessage: data.displayMessage,
        autoCloseSeconds: data.autoCloseSeconds || 10,
        action: action,
        booking: booking
      });

      // Reload data to reflect state change
      await loadData();
      if (onRefresh) onRefresh();

    } catch (err) {
      console.error(err);
      setScanError(err.response?.data?.displayMessage || err.response?.data?.message || 'Verification rejected by gate logic.');
    } finally {
      setScanningId(null);
    }
  };

  const executeManualScan = async (e) => {
    e.preventDefault();
    if (!manualPayload.trim()) return;

    setScanningId('manual');
    setScanResult(null);
    setScanError('');

    try {
      // Decode base64 to retrieve raw payload if user input is base64 encoded
      let rawPayload = manualPayload.trim();
      try {
        if (!rawPayload.includes(':') && rawPayload.length > 20) {
          rawPayload = window.atob(rawPayload);
        }
      } catch (e) {}

      const lat = selectedZone?.location?.coordinates?.[1] || 28.5355;
      const lng = selectedZone?.location?.coordinates?.[0] || 77.3910;

      const payload = {
        gateId: selectedGate,
        zoneId: selectedZoneId,
        qrPayload: rawPayload,
        action: manualAction,
        driverLat: lat,
        driverLng: lng
      };

      const { data } = await api.post('/iot/scan-qr', payload);
      setScanResult({
        success: true,
        command: data.command,
        displayMessage: data.displayMessage,
        autoCloseSeconds: data.autoCloseSeconds || 10,
        action: manualAction,
        booking: { vehiclePlate: 'Manual Entry' }
      });

      setManualPayload('');
      await loadData();
      if (onRefresh) onRefresh();

    } catch (err) {
      console.error(err);
      setScanError(err.response?.data?.displayMessage || err.response?.data?.message || 'Manual QR Verification failed.');
    } finally {
      setScanningId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mr-2" />
        <span>Loading Simulator Data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Panel */}
      <div className="glass-card p-5 border border-slate-800 bg-slate-900/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-4 mb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" /> Gate QR & Barrier Simulator
            </h2>
            <p className="text-xs text-slate-400 mt-1">Simulate physical check-ins and check-outs by scanning QR codes.</p>
          </div>
          <button 
            onClick={handleRefresh} 
            disabled={refreshing}
            className="p-2 border border-slate-700 bg-slate-800 rounded-lg hover:bg-slate-700 hover:text-white transition text-slate-400 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Select Parking Zone</label>
            <select
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-xs font-medium focus:outline-none focus:border-indigo-500"
            >
              {zones.length === 0 && <option value="">No Zones Registered</option>}
              {zones.map(z => (
                <option key={z._id} value={z._id}>{z.name} (Price: ₹{z.hourlyPrice || z.basePricePerHour}/hr)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Select Scanner Gate ID</label>
            <select
              value={selectedGate}
              onChange={(e) => setSelectedGate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-xs font-medium focus:outline-none focus:border-indigo-500"
            >
              <option value="GATE-MAIN-01">GATE-MAIN-01 (Entry Barrier)</option>
              <option value="GATE-MAIN-02">GATE-MAIN-02 (Exit Barrier)</option>
              <option value="GATE-SOUTH-01">GATE-SOUTH-01 (Side Entrance)</option>
              <option value="GATE-EMG-01">GATE-EMG-01 (Emergency Bypass)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Live Feedback Board */}
      <AnimatePresence>
        {(scanResult || scanError) && (
          <motion.div 
            initial={{ opacity: 0, y: -8 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -8 }}
            className="p-5 rounded-2xl border"
          >
            {scanResult && (
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full shrink-0 ${
                  scanResult.command === 'OPEN_BARRIER' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-450'
                }`}>
                  {scanResult.command === 'OPEN_BARRIER' ? <ShieldCheck className="w-8 h-8 text-emerald-400" /> : <AlertTriangle className="w-8 h-8 text-rose-400" />}
                </div>
                <div className="space-y-1 flex-1">
                  <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                    <span>Gate Instruction:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-black tracking-widest ${
                      scanResult.command === 'OPEN_BARRIER' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-450'
                    }`}>
                      {scanResult.command}
                    </span>
                  </h4>
                  <p className="text-sm text-slate-200 font-semibold">{scanResult.displayMessage}</p>
                  <p className="text-xs text-slate-500">
                    Booking: <span className="font-mono font-bold text-indigo-400">{scanResult.booking.vehiclePlate}</span> · 
                    Action: <span className="font-bold text-slate-300">{scanResult.action}</span> · 
                    Barrier holds open for <span className="font-bold text-slate-300">{scanResult.autoCloseSeconds}s</span>
                  </p>
                </div>
              </div>
            )}

            {scanError && (
              <div className="flex items-start gap-4">
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-full shrink-0">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-rose-400">Scanner Rejected / Check Failure</h4>
                  <p className="text-sm text-slate-200 font-semibold leading-relaxed">{scanError}</p>
                  <p className="text-xs text-slate-500">Ensure the GPS coordinates are correct, slot is empty, and user has sufficient wallet balance.</p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid: Entry and Exit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Entry Simulator Section */}
        <div className="glass-card p-5 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Play className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider">Entry Scanner (Confirm Arrivals)</h3>
          </div>
          <p className="text-xs text-slate-450">These drivers have confirmed bookings and are traveling to the zone. Scanning confirms their physical arrival, opens the entry barrier, and sets their presence status to <strong>PARKED</strong>.</p>
          
          {entryBookings.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-600 border border-dashed border-slate-850 rounded-xl">
              No pending driver arrivals for this lot.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {entryBookings.map(b => (
                <div key={b._id} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between gap-4 text-xs hover:border-slate-700 transition">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-indigo-405 shrink-0" />
                      <span className="font-bold text-slate-200 truncate">{b.userId?.fullName || 'Driver'}</span>
                      <span className="font-mono text-[10px] text-slate-400">({b.userId?.phone || '—'})</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1"><Car className="w-3 h-3 text-sky-400" /><strong className="text-slate-400 font-mono">{b.vehiclePlate || 'N/A'}</strong></span>
                      <span>Slot: <strong className="text-slate-400 font-mono">{b.slotId?.slotIdentifier}</strong></span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{b.hours} hrs</span>
                    </div>
                  </div>
                  <button
                    onClick={() => executeScan(b, 'ENTRY')}
                    disabled={scanningId !== null}
                    className="btn-primary py-2 px-3 text-[10px] font-black uppercase tracking-wider shadow-none shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white border-none flex items-center gap-1 disabled:opacity-50"
                  >
                    {scanningId === b._id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <span>Confirm Entry</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Exit Simulator Section */}
        <div className="glass-card p-5 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <ChevronRight className="w-4 h-4 text-indigo-400 rotate-90" />
            <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider">Exit Scanner (Complete Sessions)</h3>
          </div>
          <p className="text-xs text-slate-455">These vehicles are currently parked. Scanning their exit QR code calculates overstay fees (if any), charges them, opens the exit barrier, frees the slot, and sets presence status to <strong>EXITED</strong>.</p>

          {exitBookings.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-600 border border-dashed border-slate-850 rounded-xl">
              No active vehicle sessions in this lot.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {exitBookings.map(b => {
                const isOvertime = new Date(b.endTime) < new Date();
                return (
                  <div key={b._id} className={`p-3 border rounded-xl flex items-center justify-between gap-4 text-xs hover:border-slate-700 transition ${
                    isOvertime ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-900/60 border-slate-800'
                  }`}>
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="font-bold text-slate-200 truncate">{b.userId?.fullName || 'Driver'}</span>
                        {isOvertime && <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 text-[9px] font-black rounded-md uppercase animate-pulse">OVERTIME</span>}
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1"><Car className="w-3 h-3 text-sky-400" /><strong className="text-slate-400 font-mono">{b.vehiclePlate || 'N/A'}</strong></span>
                        <span>Slot: <strong className="text-slate-400 font-mono">{b.slotId?.slotIdentifier}</strong></span>
                        <span>End Time: <strong className="text-slate-400">{new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
                      </div>
                    </div>
                    <button
                      onClick={() => executeScan(b, 'EXIT')}
                      disabled={scanningId !== null}
                      className="btn-primary py-2 px-3 text-[10px] font-black uppercase tracking-wider shadow-none shrink-0 bg-indigo-650 hover:bg-indigo-600 text-white border-none flex items-center gap-1 disabled:opacity-50"
                    >
                      {scanningId === b._id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>Approve Exit</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Manual Payload Scanner */}
      <div className="glass-card p-5 border border-slate-800 bg-slate-900/40">
        <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-2">
          <QrCode className="w-4 h-4 text-indigo-400" /> Manual Token Scanner
        </h3>
        <p className="text-xs text-slate-400 mb-4">Paste the raw token or base64 string from a driver's QR ticket here to run a manual validation check.</p>
        
        <form onSubmit={executeManualScan} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text"
              value={manualPayload}
              onChange={e => setManualPayload(e.target.value)}
              placeholder="Paste secure QR token string..."
              required
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 font-mono placeholder:font-sans"
            />
            
            <div className="flex gap-2">
              <select
                value={manualAction}
                onChange={e => setManualAction(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-500 shrink-0"
              >
                <option value="ENTRY">ENTRY Action</option>
                <option value="EXIT">EXIT Action</option>
              </select>

              <button
                type="submit"
                disabled={scanningId !== null || !manualPayload.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center space-x-1.5 transition disabled:opacity-50 shrink-0"
              >
                {scanningId === 'manual' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Scan Token</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GateSimulator;
