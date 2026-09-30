import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, Trash2, Edit2, Power, RefreshCw, CheckCircle, AlertTriangle,
  MapPin, Battery, Wifi, Activity, Download, QrCode, X, Search, Link as LinkIcon,
  Clock, Signal
} from 'lucide-react';
import api from '../../services/api';
import { socket } from '../../services/socket';
import { useStore } from '../../store/useStore';

const STATUS_CONFIG = {
  Online:       { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500 animate-pulse', row: 'border-emerald-200/60' },
  Offline:      { badge: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400',                row: '' },
  Disconnected: { badge: 'bg-gray-100 text-gray-600 border-gray-200',         dot: 'bg-gray-400',                 row: '' },
  Connecting:   { badge: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500 animate-bounce', row: '' },
  Disabled:     { badge: 'bg-gray-100 text-gray-500 border-gray-200',         dot: 'bg-gray-300',                 row: '' },
  Maintenance:  { badge: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-400',                  row: '' },
  Error:        { badge: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500 animate-pulse',    row: 'border-red-200/60' },
};

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[2px]">
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-xl relative overflow-hidden"
    >
      {/* Modal Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-bold text-gray-900 text-base">{title}</h2>
        <button onClick={onClose} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </motion.div>
  </div>
);

const FormField = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
    {children}
  </div>
);

const inputCls = "w-full border border-gray-200 bg-white rounded-lg px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:opacity-50 disabled:bg-gray-50";
const selectCls = inputCls;

const IoTDeviceManagement = () => {
  const { user } = useStore();
  const [devices, setDevices] = useState([]);
  const [zones, setZones] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedDeviceCreds, setSelectedDeviceCreds] = useState(null);

  const [regForm, setRegForm] = useState({ name: '', zoneId: '', slotId: '', firmwareVersion: '1.0.0' });
  const [editForm, setEditForm] = useState({ deviceId: '', name: '', zoneId: '', slotId: '', firmwareVersion: '', isActive: true });

  const [registering, setRegistering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testStatus, setTestStatus] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const [devicesRes, zonesRes] = await Promise.all([
        api.get('/iot/provider-devices'),
        api.get('/parking/zones/me')
      ]);
      setDevices(devicesRes.data || []);
      setZones(zonesRes.data || []);
    } catch (err) {
      console.error('Failed to load devices/zones:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (!socket.connected) socket.connect();
    if (user?._id) socket.emit('JOIN_PROVIDER_ROOM', user._id);

    const handleDeviceUpdate = (updatedDevice) => {
      setDevices(prev => {
        const idx = prev.findIndex(d => d.deviceId === updatedDevice.deviceId);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...updatedDevice };
          return next;
        }
        return prev;
      });
    };

    socket.on('PROVIDER_DEVICE_UPDATED', handleDeviceUpdate);
    socket.on('ADMIN_DEVICE_UPDATED', handleDeviceUpdate);
    return () => {
      socket.off('PROVIDER_DEVICE_UPDATED', handleDeviceUpdate);
      socket.off('ADMIN_DEVICE_UPDATED', handleDeviceUpdate);
    };
  }, [user, fetchData]);

  const handleZoneChange = async (zoneId) => {
    if (!zoneId) { setSlots([]); return; }
    try {
      const { data } = await api.get(`/parking/zones/${zoneId}/slots`);
      setSlots(data || []);
    } catch (err) { console.error(err); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const { data } = await api.post('/iot/register-device', regForm);
      setSelectedDeviceCreds(data);
      setShowRegisterModal(false);
      setShowQrModal(true);
      await fetchData();
      setRegForm({ name: '', zoneId: '', slotId: '', firmwareVersion: '1.0.0' });
    } catch (err) {
      alert(err.response?.data?.message || 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const handleEditOpen = async (dev) => {
    setEditForm({
      deviceId: dev.deviceId, name: dev.name,
      zoneId: dev.zoneId?._id || '', slotId: dev.slotId?._id || '',
      firmwareVersion: dev.firmwareVersion, isActive: dev.isActive
    });
    if (dev.zoneId?._id) await handleZoneChange(dev.zoneId._id);
    setShowEditModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/iot/device', editForm);
      setShowEditModal(false);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (deviceId) => {
    if (!confirm('Are you sure you want to deregister this device?')) return;
    try {
      await api.delete(`/iot/device?deviceId=${deviceId}`);
      await fetchData();
    } catch { alert('Delete failed'); }
  };

  const handleTestDevice = async (deviceId) => {
    setTestingId(deviceId);
    try {
      const { data } = await api.post('/iot/test-connection', { deviceId });
      setTestStatus(prev => ({ ...prev, [deviceId]: data.success ? 'online' : 'error' }));
    } catch {
      setTestStatus(prev => ({ ...prev, [deviceId]: 'error' }));
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleActive = async (dev) => {
    const newActive = !dev.isActive;
    setDevices(prev => prev.map(d =>
      d.deviceId === dev.deviceId ? { ...d, isActive: newActive, status: newActive ? 'Offline' : 'Disabled' } : d
    ));
    try {
      const { data } = await api.put('/iot/device', { deviceId: dev.deviceId, isActive: newActive });
      setDevices(prev => prev.map(d => d.deviceId === dev.deviceId ? { ...d, ...data } : d));
      setActionMsg(newActive ? 'Device enabled successfully.' : 'Device disabled.');
      setTimeout(() => setActionMsg(''), 3500);
    } catch {
      setDevices(prev => prev.map(d =>
        d.deviceId === dev.deviceId ? { ...d, isActive: dev.isActive, status: dev.status } : d
      ));
      alert('Failed to toggle device state');
    }
  };

  const downloadConfigFile = (devId, token) => {
    const baseUrl = api.defaults.baseURL || `http://localhost:5000/api/v1`;
    window.open(`${baseUrl}/iot/download-config?deviceId=${devId}&deviceToken=${encodeURIComponent(token || '')}`);
  };

  const filteredDevices = devices.filter(d =>
    d.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.deviceId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.zoneId?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onlineCount = devices.filter(d => d.status === 'Online').length;
  const offlineCount = devices.filter(d => d.status !== 'Online' && d.isActive).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 py-1">

      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">IoT Device Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Register, map, and monitor your physical parking sensors.</p>
        </div>
        <button
          onClick={() => { setSlots([]); setShowRegisterModal(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition self-start shrink-0"
        >
          <Plus className="w-4 h-4" />
          Register Device
        </button>
      </div>

      {/* Stats Bar */}
      {devices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Devices', value: devices.length, color: 'text-gray-800', bg: 'bg-white' },
            { label: 'Online', value: onlineCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Offline / Error', value: offlineCount, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border border-gray-200 rounded-xl px-4 py-3`}>
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs font-medium text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {actionMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium"
          >
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            {actionMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      {devices.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, ID, or zone..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
      )}

      {/* Device Table / Grid */}
      {filteredDevices.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl py-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Activity className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="font-semibold text-gray-800 text-base">
            {searchQuery ? 'No devices match your search' : 'No devices registered'}
          </h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1.5">
            {searchQuery ? 'Try a different keyword.' : 'Register an ESP32 or simulated sensor node to start monitoring parking slots in real time.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => { setSlots([]); setShowRegisterModal(true); }}
              className="mt-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Register Your First Device
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div className="col-span-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Device</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</div>
            <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</div>
            <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</div>
          </div>

          {/* Device Rows */}
          <div className="divide-y divide-gray-100">
            {filteredDevices.map((dev) => {
              const sc = STATUS_CONFIG[dev.status] || STATUS_CONFIG.Disconnected;
              return (
                <div
                  key={dev.deviceId}
                  className={`grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 px-5 py-4 items-center hover:bg-gray-50/80 transition ${!dev.isActive ? 'opacity-50' : ''}`}
                >
                  {/* Device info */}
                  <div className="sm:col-span-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                        dev.isActive ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-gray-100 border-gray-200 text-gray-400'
                      }`}>
                        <Signal className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{dev.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{dev.deviceId} · v{dev.firmwareVersion}</p>
                      </div>
                    </div>
                  </div>

                  {/* Zone/Slot */}
                  <div className="sm:col-span-3">
                    <p className="text-sm text-gray-700 font-medium flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {dev.zoneId?.name || <span className="text-gray-400 italic">Unmapped</span>}
                    </p>
                    <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                      <LinkIcon className="w-3 h-3 shrink-0" />
                      {dev.slotId ? `${dev.slotId.slotIdentifier} (${dev.slotId.floor})` : <span className="italic">No slot</span>}
                    </p>
                    {(dev.lastHeartbeat || dev.battery != null) && (
                      <p className="text-[10px] text-gray-400 flex items-center gap-2.5 mt-1">
                        {dev.battery != null && <span className="flex items-center gap-0.5"><Battery className="w-3 h-3" />{dev.battery}%</span>}
                        {dev.lastHeartbeat && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{new Date(dev.lastHeartbeat).toLocaleTimeString()}</span>}
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className="sm:col-span-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${sc.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      {dev.status}
                    </span>
                    {testStatus[dev.deviceId] && (
                      <p className={`text-[10px] font-bold mt-1 ${testStatus[dev.deviceId] === 'online' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {testStatus[dev.deviceId] === 'online' ? '✓ Reachable' : '✗ Unreachable'}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="sm:col-span-3 flex items-center gap-1.5 justify-start sm:justify-end">
                    <button
                      onClick={() => handleToggleActive(dev)}
                      title={dev.isActive ? 'Disable' : 'Enable'}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm transition ${
                        dev.isActive
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                          : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleEditOpen(dev)}
                      title="Edit"
                      className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 flex items-center justify-center transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleTestDevice(dev.deviceId)}
                      disabled={testingId === dev.deviceId}
                      title="Ping test"
                      className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 flex items-center justify-center transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingId === dev.deviceId ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => downloadConfigFile(dev.deviceId, '')}
                      title="Download config"
                      className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-blue-600 hover:bg-blue-50 flex items-center justify-center transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(dev.deviceId)}
                      title="Delete"
                      className="w-8 h-8 rounded-lg border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: Register Device */}
      <AnimatePresence>
        {showRegisterModal && (
          <Modal title="Register IoT Node" onClose={() => setShowRegisterModal(false)}>
            <form onSubmit={handleRegister} className="space-y-4">
              <FormField label="Device Nickname">
                <input
                  type="text" required value={regForm.name}
                  onChange={e => setRegForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. ESP32-SUV-01"
                  className={inputCls}
                />
              </FormField>
              <FormField label="Parking Zone">
                <select
                  value={regForm.zoneId}
                  onChange={e => { setRegForm(p => ({ ...p, zoneId: e.target.value, slotId: '' })); handleZoneChange(e.target.value); }}
                  className={selectCls}
                >
                  <option value="">Select a zone</option>
                  {zones.map(z => <option key={z._id} value={z._id}>{z.name}</option>)}
                </select>
              </FormField>
              <FormField label="Parking Slot">
                <select
                  value={regForm.slotId}
                  onChange={e => setRegForm(p => ({ ...p, slotId: e.target.value }))}
                  disabled={!regForm.zoneId}
                  className={selectCls}
                >
                  <option value="">Select a slot</option>
                  {slots.map(s => <option key={s._id} value={s._id}>{s.slotIdentifier} ({s.floor})</option>)}
                </select>
              </FormField>
              <FormField label="Firmware Version">
                <input
                  type="text" value={regForm.firmwareVersion}
                  onChange={e => setRegForm(p => ({ ...p, firmwareVersion: e.target.value }))}
                  className={inputCls}
                />
              </FormField>
              <button
                type="submit" disabled={registering}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {registering ? 'Provisioning...' : 'Provision Device'}
              </button>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* MODAL: Provisioning QR */}
      <AnimatePresence>
        {showQrModal && selectedDeviceCreds && (
          <Modal title="Device Provisioned" onClose={() => setShowQrModal(false)}>
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-sm text-gray-600 mb-5">Scan this QR code to flash credentials to your ESP32.</p>

              <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl inline-block mb-5">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                    JSON.stringify({
                      deviceId: selectedDeviceCreds.deviceId,
                      deviceToken: selectedDeviceCreds.deviceToken,
                      apiEndpoint: `${api.defaults.baseURL}/iot/update-slot`,
                      heartbeatEndpoint: `${api.defaults.baseURL}/iot/heartbeat`
                    })
                  )}`}
                  alt="Provisioning QR"
                  className="w-44 h-44"
                />
              </div>

              <div className="space-y-3 text-left mb-5">
                {[
                  { label: 'Device ID', value: selectedDeviceCreds.deviceId },
                  { label: 'Device Token (shown once)', value: selectedDeviceCreds.deviceToken }
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                    <div className="bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg text-xs text-gray-800 font-mono select-all break-all">{value}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => downloadConfigFile(selectedDeviceCreds.deviceId, selectedDeviceCreds.deviceToken)}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-lg transition"
                >
                  <Download className="w-4 h-4" />
                  Download config.json
                </button>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm py-2.5 rounded-lg transition"
                >
                  Done
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* MODAL: Edit Device */}
      <AnimatePresence>
        {showEditModal && (
          <Modal title="Edit Device" onClose={() => setShowEditModal(false)}>
            <form onSubmit={handleUpdate} className="space-y-4">
              <FormField label="Nickname">
                <input
                  type="text" required value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Parking Zone">
                <select
                  value={editForm.zoneId}
                  onChange={e => { setEditForm(p => ({ ...p, zoneId: e.target.value, slotId: '' })); handleZoneChange(e.target.value); }}
                  className={selectCls}
                >
                  <option value="">Select zone</option>
                  {zones.map(z => <option key={z._id} value={z._id}>{z.name}</option>)}
                </select>
              </FormField>
              <FormField label="Parking Slot">
                <select
                  value={editForm.slotId}
                  onChange={e => setEditForm(p => ({ ...p, slotId: e.target.value }))}
                  disabled={!editForm.zoneId}
                  className={selectCls}
                >
                  <option value="">Select slot</option>
                  {slots.map(s => <option key={s._id} value={s._id}>{s.slotIdentifier} ({s.floor})</option>)}
                </select>
              </FormField>
              <FormField label="Firmware Version">
                <input
                  type="text" value={editForm.firmwareVersion}
                  onChange={e => setEditForm(p => ({ ...p, firmwareVersion: e.target.value }))}
                  className={inputCls}
                />
              </FormField>
              <div className="flex gap-3 pt-1">
                <button
                  type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-lg transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm py-2.5 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>

    </div>
  );
};

export default IoTDeviceManagement;
