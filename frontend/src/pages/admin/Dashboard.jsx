import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../../i18n/index.jsx';
import { 
  ShieldAlert, Users, Layers, Activity, Banknote, CheckCircle, XCircle, 
  Settings, BookOpen, Loader2, Search, Trash2, Eye, FileText, AlertCircle, 
  HelpCircle, CheckCircle2, UserMinus, UserCheck, Play, Pause, Save,
  Building2, Clock, BadgeCheck, BadgeX,
  Cpu, Wifi, Battery, Power, RefreshCw, Plus, X, Download, AlertTriangle
} from 'lucide-react';
import api from '../../services/api';
import { socket } from '../../services/socket';

const AdminDashboard = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data states
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [pendingZones, setPendingZones] = useState([]);
  const [pendingProviders, setPendingProviders] = useState([]);
  const [allZones, setAllZones] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [actionMsg, setActionMsg] = useState('');
  const [complaints, setComplaints] = useState([
    { id: '1', user: 'Amit K.', subject: 'Refund delay', status: 'Pending', desc: 'Active booking ended early but wallet not credited.' },
    { id: '2', user: 'Vikas S.', subject: 'Barrier issue', status: 'Resolved', desc: 'Exit gate A did not scan. Manual override resolved.' }
  ]);

  // IoT Device States
  const [iotDevices, setIotDevices] = useState([]);
  const [iotLogs, setIotLogs] = useState([]);
  const [iotProviders, setIotProviders] = useState([]);
  const [iotSlots, setIotSlots] = useState([]);
  const [showIotRegisterModal, setShowIotRegisterModal] = useState(false);
  const [showIotCredsModal, setShowIotCredsModal] = useState(false);
  const [iotQuery, setIotQuery] = useState('');
  const [iotStatusFilter, setIotStatusFilter] = useState('ALL');
  const [iotRegCreds, setIotRegCreds] = useState(null);
  const [iotRegForm, setIotRegForm] = useState({
    name: '',
    providerId: '',
    zoneId: '',
    slotId: '',
    firmwareVersion: '1.0.0'
  });

  // Provider details modal states
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerDetailLoading, setProviderDetailLoading] = useState(false);
  const [providerZones, setProviderZones] = useState([]);
  const [providerAudits, setProviderAudits] = useState([]);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [adminRemarksInput, setAdminRemarksInput] = useState('');
  const [showActionModal, setShowActionModal] = useState(null); // 'approve' | 'reject' | 'suspend' | 'review' | 'reactivate' | null

  // Filters & Search
  const [userQuery, setUserQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL');
  
  // Platform config settings states
  const [config, setConfig] = useState({
    surgeThreshold: 1.3,
    minWalletDeposit: 100,
    hourlyPenaltyRate: 50,
    baseFine: 200,
    systemAlerts: true
  });
  const [configSuccess, setConfigSuccess] = useState('');

  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [
        statsRes, usersRes, pendingZonesRes, pendingProvidersRes, zonesRes, 
        bookingsRes, logsRes, iotDevicesRes, iotLogsRes, iotProvidersRes
      ] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/zones/pending'),
        api.get('/admin/providers/pending').catch(() => ({ data: [] })),
        api.get('/admin/zones'),
        api.get('/admin/bookings').catch(() => ({ data: [] })),
        api.get('/admin/audit-logs').catch(() => ({ data: [] })),
        api.get('/admin/iot/devices').catch(() => ({ data: [] })),
        api.get('/admin/iot/logs').catch(() => ({ data: [] })),
        api.get('/admin/iot/providers').catch(() => ({ data: [] }))
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data || []);
      setPendingZones(pendingZonesRes.data || []);
      setPendingProviders(pendingProvidersRes.data || []);
      setAllZones(zonesRes.data || []);
      setBookings(bookingsRes.data || []);
      setAuditLogs(logsRes.data || []);
      setIotDevices(iotDevicesRes.data || []);
      setIotLogs(iotLogsRes.data || []);
      setIotProviders(iotProvidersRes.data || []);

    } catch (err) { 
      console.error(err); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchAll();

    // Establish WebSocket Connection
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('JOIN_ADMIN_ROOM');

    // Subscribe to live events
    socket.on('ADMIN_DEVICE_UPDATED', (updatedDevice) => {
      setIotDevices(prev => {
        const index = prev.findIndex(d => d.deviceId === updatedDevice.deviceId);
        if (index !== -1) {
          const next = [...prev];
          next[index] = { ...next[index], ...updatedDevice };
          return next;
        }
        return [updatedDevice, ...prev];
      });
      // Refresh logs
      api.get('/admin/iot/logs').then(res => setIotLogs(res.data || [])).catch(() => {});
    });

    socket.on('ZONE_UPDATED', (updatedZone) => {
      setAllZones(prev => prev.map(z => z._id === updatedZone._id ? { ...z, ...updatedZone } : z));
    });

    return () => {
      socket.off('ADMIN_DEVICE_UPDATED');
      socket.off('ZONE_UPDATED');
    };
  }, []);

  // IoT Handlers
  const handleIotToggle = async (deviceId) => {
    try {
      const { data } = await api.put(`/admin/iot/devices/${deviceId}/toggle`);
      setIotDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, ...data } : d));
      // Refresh logs
      const logsRes = await api.get('/admin/iot/logs');
      setIotLogs(logsRes.data || []);
    } catch (err) {
      console.error('Failed to toggle device active status:', err);
    }
  };

  const handleIotSync = async (deviceId) => {
    try {
      const { data } = await api.post(`/admin/iot/devices/${deviceId}/sync`);
      setActionMsg(`Sync command dispatched to device: ${deviceId}`);
      setTimeout(() => setActionMsg(''), 3000);
      setIotDevices(prev => prev.map(d => d.deviceId === deviceId ? { ...d, ...data.device } : d));
    } catch (err) {
      console.error('Failed to sync device:', err);
    }
  };

  const handleIotRestart = async (deviceId) => {
    try {
      await api.post(`/admin/iot/devices/${deviceId}/restart`);
      setActionMsg(`Restart command dispatched to device: ${deviceId}`);
      setTimeout(() => setActionMsg(''), 3000);
    } catch (err) {
      console.error('Failed to restart device:', err);
    }
  };

  const handleIotDelete = async (deviceId) => {
    if (!confirm(`Are you sure you want to delete/deregister device ${deviceId}?`)) return;
    try {
      await api.delete(`/admin/iot/devices/${deviceId}`);
      setIotDevices(prev => prev.filter(d => d.deviceId !== deviceId));
      setActionMsg('Device deleted successfully.');
      setTimeout(() => setActionMsg(''), 3000);
    } catch (err) {
      console.error('Failed to delete device:', err);
    }
  };

  const handleIotProviderChange = (providerId) => {
    setIotRegForm(prev => ({ ...prev, providerId, zoneId: '', slotId: '' }));
    setIotSlots([]);
  };

  const handleIotZoneChange = async (zoneId) => {
    setIotRegForm(prev => ({ ...prev, zoneId, slotId: '' }));
    if (!zoneId) {
      setIotSlots([]);
      return;
    }
    try {
      const { data } = await api.get(`/parking/zones/${zoneId}/slots`);
      setIotSlots(data || []);
    } catch (err) {
      console.error('Failed to load slots:', err);
    }
  };

  const handleIotRegisterSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/admin/iot/register-device', iotRegForm);
      setIotRegCreds(data);
      setShowIotRegisterModal(false);
      setShowIotCredsModal(true);
      setIotRegForm({ name: '', providerId: '', zoneId: '', slotId: '', firmwareVersion: '1.0.0' });
      setIotSlots([]);
      // Refresh list
      const devicesRes = await api.get('/admin/iot/devices');
      setIotDevices(devicesRes.data || []);
    } catch (err) {
      alert(err.response?.data?.message || 'Registration failed');
    }
  };

  const downloadConfigFile = (devId, token) => {
    window.open(`${api.defaults.baseURL}/iot/download-config?deviceId=${devId}&deviceToken=${token || ''}`);
  };

  // Approve Lot Verification Request
  const handleApprove = async (zoneId) => {
    try {
      await api.post(`/admin/zones/${zoneId}/approve`);
      setActionMsg('Parking lot approved and made public.');
      setTimeout(() => setActionMsg(''), 3000);
      await fetchAll();
    } catch (err) { console.error(err); }
  };
  // Reject Lot Verification Request
  const handleReject = async (zoneId) => {
    try {
      await api.post(`/admin/zones/${zoneId}/reject`);
      setActionMsg('Parking lot verification rejected.');
      setTimeout(() => setActionMsg(''), 3000);
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // Delete Lot Completely
  const handleDeleteZone = async (zoneId) => {
    if (!confirm('Are you sure you want to delete this parking lot?')) return;
    try {
      await api.delete(`/admin/zones/${zoneId}`);
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // Fetch full details of a provider
  const fetchProviderDetails = async (providerId) => {
    setProviderDetailLoading(true);
    try {
      const { data } = await api.get(`/admin/providers/${providerId}`);
      setSelectedProvider(data.provider);
      setProviderZones(data.zones || []);
      setProviderAudits(data.auditHistory || []);
      setRejectionReasonInput('');
      setAdminRemarksInput(data.provider.adminRemarks || '');
    } catch (err) {
      console.error('Failed to fetch provider details:', err);
      setActionMsg('Failed to load provider details.');
      setTimeout(() => setActionMsg(''), 3000);
    } finally {
      setProviderDetailLoading(false);
    }
  };

  // Approve Provider Account
  const handleApproveProvider = async (providerId, remarks = '') => {
    try {
      await api.patch(`/admin/providers/${providerId}/approve`, { remarks });
      setActionMsg('Provider account approved and activated.');
      setTimeout(() => setActionMsg(''), 3000);
      setShowActionModal(null);
      if (selectedProvider && selectedProvider._id === providerId) {
        await fetchProviderDetails(providerId);
      }
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // Reject Provider Account
  const handleRejectProvider = async (providerId, reason = '', remarks = '') => {
    try {
      await api.patch(`/admin/providers/${providerId}/reject`, { reason, remarks });
      setActionMsg('Provider registration rejected.');
      setTimeout(() => setActionMsg(''), 3000);
      setShowActionModal(null);
      if (selectedProvider && selectedProvider._id === providerId) {
        await fetchProviderDetails(providerId);
      }
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // Suspend Provider Account
  const handleSuspendProvider = async (providerId, reason = '', remarks = '') => {
    try {
      await api.patch(`/admin/providers/${providerId}/suspend`, { reason, remarks });
      setActionMsg('Provider account suspended.');
      setTimeout(() => setActionMsg(''), 3000);
      setShowActionModal(null);
      if (selectedProvider && selectedProvider._id === providerId) {
        await fetchProviderDetails(providerId);
      }
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // Reactivate Provider Account
  const handleReactivateProvider = async (providerId, remarks = '') => {
    try {
      await api.patch(`/admin/providers/${providerId}/reactivate`, { remarks });
      setActionMsg('Provider account reactivated.');
      setTimeout(() => setActionMsg(''), 3000);
      setShowActionModal(null);
      if (selectedProvider && selectedProvider._id === providerId) {
        await fetchProviderDetails(providerId);
      }
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // Mark Provider as Under Review
  const handleReviewProvider = async (providerId, remarks = '') => {
    try {
      await api.patch(`/admin/providers/${providerId}/review`, { remarks });
      setActionMsg('Provider status set to Under Review.');
      setTimeout(() => setActionMsg(''), 3000);
      setShowActionModal(null);
      if (selectedProvider && selectedProvider._id === providerId) {
        await fetchProviderDetails(providerId);
      }
      await fetchAll();
    } catch (err) { console.error(err); }
  };
  // Update verification checks (identity, property, bank, gps)
  const handleToggleCheck = async (checkKey, statusValue) => {
    if (!selectedProvider) return;
    try {
      await api.patch(`/admin/providers/${selectedProvider._id}/checks`, {
        [checkKey]: statusValue
      });
      setSelectedProvider(prev => ({
        ...prev,
        verificationChecks: {
          ...prev.verificationChecks,
          [checkKey]: statusValue
        }
      }));
      setActionMsg(`${checkKey.toUpperCase()} check status updated to ${statusValue}.`);
      setTimeout(() => setActionMsg(''), 3000);
      await fetchAll();
    } catch (err) {
      console.error(err);
      setActionMsg('Failed to update verification check.');
    }
  };

  // Request Additional Documents from provider
  const handleRequestDocs = async (providerId, remarksInput) => {
    try {
      await api.patch(`/admin/providers/${providerId}/request-docs`, { remarks: remarksInput });
      setActionMsg('Additional documents requested successfully.');
      setTimeout(() => setActionMsg(''), 3000);
      setShowActionModal(null);
      setRejectionReasonInput('');
      if (selectedProvider && selectedProvider._id === providerId) {
        await fetchProviderDetails(providerId);
      }
      await fetchAll();
    } catch (err) {
      console.error(err);
      setActionMsg('Failed to request additional documents.');
    }
  };

  // Change user role
  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // Suspend/Activate User account
  const handleToggleUserStatus = async (userId, currentStatus) => {
    const nextStatus = currentStatus === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';
    try {
      await api.put(`/admin/users/${userId}/status`, { status: nextStatus });
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // Delete User account
  const handleDeleteUser = async (userId) => {
    if (!confirm('Permanently delete this user account? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // Resolve complaint
  const handleResolveComplaint = (id) => {
    setComplaints(prev => prev.map(c => c.id === id ? { ...c, status: 'Resolved' } : c));
  };

  const handleSaveConfig = (e) => {
    e.preventDefault();
    setConfigSuccess('Platform configurations updated.');
    setTimeout(() => setConfigSuccess(''), 3000);
  };

  const filteredUsers = users.filter(u => {
    const matchesQuery = u.fullName.toLowerCase().includes(userQuery.toLowerCase()) || u.email.toLowerCase().includes(userQuery.toLowerCase());
    const matchesRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
    return matchesQuery && matchesRole;
  });

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'providers', label: 'Providers', icon: Building2, badge: pendingProviders.length },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'zones', label: 'Parking Lots', icon: Layers },
    { key: 'iot', label: 'IoT Devices', icon: Cpu },
    { key: 'bookings', label: 'Bookings Log', icon: BookOpen },
    { key: 'complaints', label: 'Complaints', icon: AlertCircle },
    { key: 'audits', label: 'Audit Timeline', icon: ShieldAlert },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  const statCards = stats ? [
    { title: t('admin.totalUsers'), val: stats.totalUsers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/20' },
    { title: t('admin.activeProviders'), val: stats.totalProviders, icon: Layers, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/20' },
    { title: 'Pending Providers', val: stats.pendingProviders || pendingProviders.length, icon: Building2, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/20' },
    { title: t('admin.liveZones'), val: stats.totalZones, icon: Activity, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/20' },
    { title: t('admin.pendingApprovals'), val: stats.pendingZones, icon: ShieldAlert, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/20' },
    { title: t('admin.totalBookings'), val: stats.totalBookings, icon: BookOpen, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/20' },
    { title: t('admin.totalRevenue'), val: `₹${stats.totalRevenue?.toLocaleString()}`, icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
  ] : [];

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-parking-primary" /></div>;

  return (
    <>
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6 px-2 sm:px-4">
      {/* 2. SIDEBAR NAV */}
      <div className="w-full md:w-56 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0 shrink-0 border-b md:border-b-0 md:border-r border-asphalt-200 dark:border-asphalt-800 pr-0 md:pr-4">
        <h2 className="hidden md:flex items-center gap-2 text-sm font-black uppercase text-asphalt-450 tracking-wider mb-4 px-3">
          <ShieldAlert className="w-4 h-4 text-amber-500" /> Admin Controls
        </h2>
        {tabs.map(tab => (
          <button 
            key={tab.key} 
            onClick={() => setActiveTab(tab.key)}
            className={`text-left px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2.5 whitespace-nowrap ${activeTab === tab.key ? 'bg-amber-500 text-white shadow-sm' : 'hover:bg-asphalt-250 dark:hover:bg-asphalt-900 text-asphalt-600 dark:text-asphalt-400'}`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
            {tab.badge > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 space-y-6">
        <div className="pb-4 border-b border-asphalt-200 dark:border-asphalt-800">
          <h1 className="text-3xl font-black text-asphalt-900 dark:text-white tracking-tight">{t('admin.title')}</h1>
          <p className="text-sm text-asphalt-500 dark:text-asphalt-400 mt-1">{t('admin.subtitle')}</p>
        </div>

        {actionMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-green-600 border border-green-200 rounded-lg text-xs font-bold mb-4">{actionMsg}</div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-6">
              {/* Stats Metrics Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((s, i) => (
                  <div key={i} className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 flex items-center gap-4">
                    <div className={`p-3 rounded-lg border ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div>
                    <div>
                      <h3 className="text-xl font-black text-asphalt-850 dark:text-white">{s.val}</h3>
                      <p className="text-xs text-asphalt-500 font-bold uppercase tracking-wider mt-0.5">{s.title}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pending Provider Registrations */}
              {pendingProviders.length > 0 && (
                <div className="glass-card p-6 border border-orange-200 dark:border-orange-900/30 bg-orange-50/30 dark:bg-orange-950/10 space-y-4">
                  <h3 className="text-base font-bold text-asphalt-850 dark:text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-orange-500 animate-pulse" /> Pending Provider Registrations
                    <span className="ml-auto badge-yellow text-[9px] px-2">{pendingProviders.length} awaiting review</span>
                  </h3>
                  <div className="space-y-3">
                    {pendingProviders.map(p => (
                      <div key={p._id} className="p-4 bg-white dark:bg-asphalt-900 border border-orange-200/60 dark:border-orange-900/20 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-asphalt-900 dark:text-white">{p.fullName}</h4>
                            <span className="badge-yellow text-[9px] uppercase font-bold px-2">Pending</span>
                          </div>
                          <p className="text-xs text-asphalt-500">{p.email} • {p.phone || 'No phone'}</p>
                          {p.businessName && <p className="text-xs font-bold text-asphalt-700 dark:text-asphalt-300">Business: {p.businessName}</p>}
                          {p.governmentId && <p className="text-[10px] text-asphalt-400">Gov ID: {p.governmentId}</p>}
                          {p.gstNumber && <p className="text-[10px] text-asphalt-400">GST: {p.gstNumber}</p>}
                          <p className="text-[10px] text-asphalt-400">Registered: {new Date(p.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto shrink-0">
                          <button onClick={() => handleApproveProvider(p._id)} className="flex-1 sm:flex-initial px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"><BadgeCheck className="w-3.5 h-3.5" /> Approve</button>
                          <button onClick={() => handleRejectProvider(p._id)} className="flex-1 sm:flex-initial px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"><BadgeX className="w-3.5 h-3.5" /> Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Lot Approvals Section */}
              {pendingZones.length > 0 && (
                <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                  <h3 className="text-base font-bold text-asphalt-850 dark:text-white flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-500 animate-pulse" /> Pending Lot Approvals
                  </h3>
                  <div className="space-y-3">
                    {pendingZones.map(z => (
                      <div key={z._id} className="p-4 bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-amber-850 dark:text-amber-300">{z.name}</h4>
                            <span className="badge-yellow text-[9px] uppercase font-bold px-2">Verification Pending</span>
                          </div>
                          <p className="text-xs text-asphalt-500 mt-1">Provider: {z.providerId?.fullName || 'Unknown'} • {z.city || ''} • Slots: {z.totalSlots} • Rate: ₹{z.basePricePerHour}/hr</p>
                          {z.documents?.length > 0 && (
                            <a href={z.documents[0].fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-parking-primary font-bold hover:underline mt-2">
                              <FileText className="w-3.5 h-3.5" /> View Ownership Proof
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto shrink-0">
                          <button onClick={() => handleApprove(z._id)} className="flex-1 sm:flex-initial px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"><CheckCircle className="w-3.5 h-3.5" /> Approve</button>
                          <button onClick={() => handleReject(z._id)} className="flex-1 sm:flex-initial px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"><XCircle className="w-3.5 h-3.5" /> Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'providers' && (
            <motion.div key="providers" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-6">
              <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                <h3 className="text-lg font-bold text-asphalt-850 dark:text-white border-b border-asphalt-100 dark:border-asphalt-850 pb-2 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-orange-500" /> All Provider Registrations
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-asphalt-200 dark:border-asphalt-800 bg-asphalt-50 dark:bg-asphalt-900/40">
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Name</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Business</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Email</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Status</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Registered</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.filter(u => u.role === 'PROVIDER').map((p, i) => (
                        <tr key={p._id || i} className="border-b border-asphalt-100 dark:border-asphalt-850 last:border-0 hover:bg-asphalt-50/50 dark:hover:bg-asphalt-900/10">
                          <td className="py-3 px-4 font-semibold text-asphalt-900 dark:text-white">{p.fullName}</td>
                          <td className="py-3 px-4 text-asphalt-500">{p.businessName || '—'}</td>
                          <td className="py-3 px-4 text-asphalt-500">{p.email}</td>
                          <td className="py-3 px-4">
                            <span className={`status-chip text-[9px] ${
                              p.status === 'ACTIVE' ? 'badge-emerald' :
                              p.status === 'REJECTED' ? 'badge-red' :
                              p.status === 'PENDING_APPROVAL' ? 'badge-yellow' :
                              p.status === 'UNDER_REVIEW' ? 'badge-blue' :
                              p.status === 'SUSPENDED' ? 'badge-red' : 'badge-yellow'
                            }`}>{p.status}</span>
                          </td>
                          <td className="py-3 px-4 text-asphalt-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                          <td className="py-3 px-4 text-right font-medium">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => fetchProviderDetails(p._id)} className="p-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg animate-pulse-subtle" title="View Full Details"><Eye className="w-3.5 h-3.5" /></button>
                              {p.status === 'PENDING_APPROVAL' && (
                                <>
                                  <button onClick={() => handleApproveProvider(p._id)} className="p-1.5 border border-green-200 text-green-600 hover:bg-green-50 rounded-lg" title="Approve"><BadgeCheck className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleRejectProvider(p._id)} className="p-1.5 border border-red-200 text-parking-danger hover:bg-red-50 rounded-lg" title="Reject"><BadgeX className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                              {p.status === 'REJECTED' && (
                                <button onClick={() => handleApproveProvider(p._id)} className="p-1.5 border border-green-200 text-green-600 hover:bg-green-50 rounded-lg" title="Re-Activate"><UserCheck className="w-3.5 h-3.5" /></button>
                              )}
                              {p.status === 'SUSPENDED' && (
                                <button onClick={() => handleReactivateProvider(p._id)} className="p-1.5 border border-green-200 text-green-600 hover:bg-green-50 rounded-lg" title="Re-Activate"><UserCheck className="w-3.5 h-3.5" /></button>
                              )}
                              <button onClick={() => handleDeleteUser(p._id)} className="p-1.5 border border-red-200 text-parking-danger hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div key="users" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
              <div className="flex flex-col sm:flex-row gap-2.5 sm:justify-between sm:items-center mb-2">
                <h3 className="text-lg font-bold text-asphalt-850 dark:text-white">Registered Accounts</h3>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-asphalt-400" />
                    <input 
                      value={userQuery} 
                      onChange={e => setUserQuery(e.target.value)} 
                      placeholder="Search accounts..." 
                      className="form-input pl-8 py-2 text-xs w-48"
                    />
                  </div>
                  <select 
                    value={userRoleFilter} 
                    onChange={e => setUserRoleFilter(e.target.value)} 
                    className="form-input py-2 text-xs bg-white dark:bg-asphalt-900 border-asphalt-250 w-24"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="DRIVER">Driver</option>
                    <option value="PROVIDER">Provider</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-asphalt-200 dark:border-asphalt-800 bg-asphalt-50 dark:bg-asphalt-900/40">
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Name</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Email</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Role</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Status</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Registered</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, i) => (
                      <tr key={u._id || i} className="border-b border-asphalt-100 dark:border-asphalt-850 last:border-0 hover:bg-asphalt-50/50 dark:hover:bg-asphalt-900/10 transition-colors">
                        <td className="py-3 px-4 font-semibold text-asphalt-900 dark:text-white">{u.fullName}</td>
                        <td className="py-3 px-4 text-asphalt-500 font-medium">{u.email}</td>
                        <td className="py-3 px-4">
                          <select 
                            value={u.role} 
                            onChange={(e) => handleRoleChange(u._id, e.target.value)} 
                            className="bg-transparent border-none outline-none font-bold text-parking-primary cursor-pointer text-xs"
                          >
                            <option value="DRIVER">DRIVER</option>
                            <option value="PROVIDER">PROVIDER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`status-chip text-[9px] ${u.status === 'BLOCKED' ? 'badge-red' : 'badge-emerald'}`}>
                            {u.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-asphalt-400 font-bold">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-right flex justify-end items-center gap-1">
                          <button 
                            onClick={() => handleToggleUserStatus(u._id, u.status)} 
                            className={`p-1.5 border rounded-lg ${u.status === 'BLOCKED' ? 'text-green-600 hover:bg-green-50 border-green-200' : 'text-amber-600 hover:bg-amber-50 border-amber-200'}`}
                            title={u.status === 'BLOCKED' ? 'Activate Account' : 'Suspend Account'}
                          >
                            {u.status === 'BLOCKED' ? <UserCheck className="w-3.5 h-3.5" /> : <UserMinus className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleDeleteUser(u._id)} className="p-1.5 border border-red-200 text-parking-danger hover:bg-red-50 rounded-lg" title="Delete User">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'zones' && (
            <motion.div key="zones" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
              <h3 className="text-lg font-bold text-asphalt-850 dark:text-white border-b border-asphalt-100 dark:border-asphalt-850 pb-2">Active Marketplace Lots</h3>
              <div className="space-y-3">
                {allZones.map(z => (
                  <div key={z._id} className="p-4 bg-asphalt-50 dark:bg-asphalt-900/40 border border-asphalt-200/60 dark:border-asphalt-800/60 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-asphalt-900 dark:text-white">{z.name}</h4>
                        <span className={`status-chip text-[9px] ${z.isApproved ? 'badge-emerald' : 'badge-yellow'}`}>
                          {z.isApproved ? 'Approved & Public' : 'Verification Needed'}
                        </span>
                      </div>
                      <p className="text-xs text-asphalt-550 mt-1">Provider: {z.providerId?.fullName || 'N/A'} • Capacity: {z.totalSlots} slots • Current Base pricing: ₹{z.basePricePerHour}/hr</p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto shrink-0">
                      <button onClick={() => handleDeleteZone(z._id)} className="p-2 border border-red-200 text-parking-danger hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'bookings' && (
            <motion.div key="bookings" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
              <h3 className="text-lg font-bold text-asphalt-850 dark:text-white border-b border-asphalt-100 dark:border-asphalt-850 pb-2">Global System Reservations</h3>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-asphalt-200 dark:border-asphalt-800 bg-asphalt-50 dark:bg-asphalt-900/40">
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Driver</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Lot</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Slot</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Status</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Refund</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Total Paid</th>
                      <th className="py-2.5 px-4 font-bold text-asphalt-650 uppercase">Booking Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((bk, i) => (
                      <tr key={bk._id || i} className="border-b border-asphalt-100 dark:border-asphalt-800 last:border-0 hover:bg-asphalt-50/50 dark:hover:bg-asphalt-900/10">
                        <td className="py-3 px-4 font-semibold text-asphalt-900 dark:text-white">{bk.userId?.fullName || 'User'}</td>
                        <td className="py-3 px-4 text-asphalt-700 dark:text-asphalt-300 font-medium">{bk.zoneId?.name || 'Lot'}</td>
                        <td className="py-3 px-4 font-mono font-bold">{bk.slotId?.slotIdentifier || 'Slot'}</td>
                        <td className="py-3 px-4">
                          <span className={`status-chip text-[9px] ${
                            bk.status === 'Confirmed' ? 'badge-blue' :
                            bk.status === 'Completed' ? 'badge-emerald' : 'badge-red'
                          }`}>
                            {bk.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-asphalt-500">{bk.status === 'Cancelled' ? 'Full Refund' : 'None'}</td>
                        <td className="py-3 px-4 font-bold font-mono">₹{bk.totalCost}</td>
                        <td className="py-3 px-4 text-asphalt-400 font-bold">{new Date(bk.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'complaints' && (
            <motion.div key="complaints" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
              <h3 className="text-lg font-bold text-asphalt-850 dark:text-white border-b border-asphalt-100 dark:border-asphalt-850 pb-2">User Feedback & Complaints</h3>
              
              <div className="space-y-4">
                {complaints.map(c => (
                  <div key={c.id} className="p-4 bg-asphalt-50 dark:bg-asphalt-900/40 border border-asphalt-200/50 dark:border-asphalt-800/50 rounded-xl flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-asphalt-900 dark:text-white">{c.user}</span>
                        <span className={`status-chip text-[9px] ${c.status === 'Resolved' ? 'badge-emerald' : 'badge-yellow'}`}>{c.status}</span>
                      </div>
                      <p className="text-xs font-bold text-parking-accent">{c.subject}</p>
                      <p className="text-xs text-asphalt-600 dark:text-asphalt-350 italic mt-1 leading-relaxed">"{c.desc}"</p>
                    </div>
                    {c.status === 'Pending' && (
                      <button onClick={() => handleResolveComplaint(c.id)} className="px-2.5 py-1 text-[10px] font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded shrink-0 shadow-none">Resolve</button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'audits' && (
            <motion.div key="audits" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
              <h3 className="text-lg font-bold text-asphalt-850 dark:text-white border-b border-asphalt-100 dark:border-asphalt-850 pb-2">System Audit Logs</h3>
              <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
                {auditLogs.map((log, i) => (
                  <div key={log._id || i} className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-250 dark:border-asphalt-850 rounded-lg flex flex-col justify-between text-xs gap-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-amber-500 uppercase tracking-widest">{log.action}</span>
                      <span className="font-mono text-asphalt-400 font-bold">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-asphalt-700 dark:text-asphalt-200 leading-relaxed font-semibold">{log.details}</p>
                    <span className="text-[9px] text-asphalt-450 font-bold uppercase">Triggered By: {log.userId?.fullName} ({log.userId?.email})</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
              <h3 className="text-lg font-bold text-asphalt-850 dark:text-white border-b border-asphalt-100 dark:border-asphalt-850 pb-2">Platform Pricing & Wallet Rules</h3>
              
              {configSuccess && <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-green-600 dark:text-green-400 border border-green-200 rounded-lg text-xs">{configSuccess}</div>}

              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-asphalt-450 uppercase">Surge Multiplier Threshold</label>
                    <input type="number" step="any" value={config.surgeThreshold} onChange={e => setConfig({...config, surgeThreshold: parseFloat(e.target.value)})} className="form-input mt-1.5" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-asphalt-450 uppercase">Minimum Wallet Deposit (₹)</label>
                    <input type="number" value={config.minWalletDeposit} onChange={e => setConfig({...config, minWalletDeposit: parseInt(e.target.value)})} className="form-input mt-1.5" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-asphalt-450 uppercase">Hourly Overtime Penalty (₹)</label>
                    <input type="number" value={config.hourlyPenaltyRate} onChange={e => setConfig({...config, hourlyPenaltyRate: parseInt(e.target.value)})} className="form-input mt-1.5" />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-asphalt-450 uppercase">Base Fine Amount (₹)</label>
                    <input type="number" value={config.baseFine} onChange={e => setConfig({...config, baseFine: parseInt(e.target.value)})} className="form-input mt-1.5" />
                  </div>
                </div>

                <button type="submit" className="w-full btn-primary py-3 text-xs font-bold shadow-none flex items-center justify-center gap-1.5 mt-2">
                  <Save className="w-4 h-4" /> Save Platform Policies
                </button>
              </form>
            </motion.div>
          )}

          {activeTab === 'iot' && (
            <motion.div key="iot" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-6">
              {/* IoT Top Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 flex items-center gap-4">
                  <div className="p-3 rounded-lg border bg-blue-50 dark:bg-blue-950/20"><Cpu className="w-5 h-5 text-blue-600" /></div>
                  <div>
                    <h3 className="text-xl font-black text-asphalt-850 dark:text-white">{iotDevices.length}</h3>
                    <p className="text-[10px] text-asphalt-500 font-bold uppercase tracking-wider mt-0.5">Total Devices</p>
                  </div>
                </div>
                <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 flex items-center gap-4">
                  <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-950/20"><Wifi className="w-5 h-5 text-green-600 animate-pulse" /></div>
                  <div>
                    <h3 className="text-xl font-black text-asphalt-850 dark:text-white">{iotDevices.filter(d => d.status === 'Online').length}</h3>
                    <p className="text-[10px] text-asphalt-500 font-bold uppercase tracking-wider mt-0.5">Online Devices</p>
                  </div>
                </div>
                <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 flex items-center gap-4">
                  <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-950/20"><Wifi className="w-5 h-5 text-slate-400" /></div>
                  <div>
                    <h3 className="text-xl font-black text-asphalt-850 dark:text-white">{iotDevices.filter(d => d.status === 'Offline').length}</h3>
                    <p className="text-[10px] text-asphalt-500 font-bold uppercase tracking-wider mt-0.5">Offline Devices</p>
                  </div>
                </div>
                <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 flex items-center gap-4">
                  <div className="p-3 rounded-lg border bg-orange-50 dark:bg-orange-950/20"><Power className="w-5 h-5 text-orange-600" /></div>
                  <div>
                    <h3 className="text-xl font-black text-asphalt-850 dark:text-white">{iotDevices.filter(d => !d.isActive).length}</h3>
                    <p className="text-[10px] text-asphalt-500 font-bold uppercase tracking-wider mt-0.5">Disabled Devices</p>
                  </div>
                </div>
                <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 flex items-center gap-4">
                  <div className="p-3 rounded-lg border bg-red-50 dark:bg-red-950/20"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
                  <div>
                    <h3 className="text-xl font-black text-asphalt-850 dark:text-white">{iotDevices.filter(d => d.healthStatus === 'Faulty' || d.status === 'Error').length}</h3>
                    <p className="text-[10px] text-asphalt-500 font-bold uppercase tracking-wider mt-0.5">Faulty / Error</p>
                  </div>
                </div>
              </div>

              {/* Toolbar */}
              <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center">
                  <div>
                    <h3 className="text-lg font-bold text-asphalt-850 dark:text-white">IoT Device Manager</h3>
                    <p className="text-xs text-asphalt-500 mt-0.5">Register, sync, and monitor parking sensors globally.</p>
                  </div>
                  <button
                    onClick={() => {
                      setIotSlots([]);
                      setShowIotRegisterModal(true);
                    }}
                    className="bg-amber-500 hover:bg-amber-600 shadow-sm text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition self-start"
                  >
                    <Plus className="w-4 h-4" /> Register New Device
                  </button>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-asphalt-400" />
                    <input 
                      value={iotQuery} 
                      onChange={e => setIotQuery(e.target.value)} 
                      placeholder="Search by Device Name or ID..." 
                      className="form-input pl-9 py-2 text-xs w-full"
                    />
                  </div>
                  <select 
                    value={iotStatusFilter} 
                    onChange={e => setIotStatusFilter(e.target.value)} 
                    className="form-input py-2 text-xs bg-white dark:bg-asphalt-900 border-asphalt-250 w-full sm:w-44"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ONLINE">Online Only</option>
                    <option value="OFFLINE">Offline Only</option>
                    <option value="DISABLED">Disabled Only</option>
                  </select>
                </div>

                {/* Device Table */}
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-asphalt-200 dark:border-asphalt-800 bg-asphalt-50 dark:bg-asphalt-900/40">
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Device</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Zone / Slot Mapping</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Status & Health</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Hardware Info</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase">Last Seen</th>
                        <th className="py-3 px-4 font-bold text-asphalt-650 uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {iotDevices.filter(d => {
                        const matchesQuery = d.name.toLowerCase().includes(iotQuery.toLowerCase()) || d.deviceId.toLowerCase().includes(iotQuery.toLowerCase());
                        const matchesStatus = iotStatusFilter === 'ALL' || 
                          (iotStatusFilter === 'ONLINE' && d.status === 'Online') ||
                          (iotStatusFilter === 'OFFLINE' && d.status === 'Offline') ||
                          (iotStatusFilter === 'DISABLED' && !d.isActive);
                        return matchesQuery && matchesStatus;
                      }).length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-8 text-center text-asphalt-500 italic">No devices found matching current filters.</td>
                        </tr>
                      ) : (
                        iotDevices.filter(d => {
                          const matchesQuery = d.name.toLowerCase().includes(iotQuery.toLowerCase()) || d.deviceId.toLowerCase().includes(iotQuery.toLowerCase());
                          const matchesStatus = iotStatusFilter === 'ALL' || 
                            (iotStatusFilter === 'ONLINE' && d.status === 'Online') ||
                            (iotStatusFilter === 'OFFLINE' && d.status === 'Offline') ||
                            (iotStatusFilter === 'DISABLED' && !d.isActive);
                          return matchesQuery && matchesStatus;
                        }).map((dev) => (
                          <tr key={dev.deviceId} className="border-b border-asphalt-100 dark:border-asphalt-800 last:border-0 hover:bg-asphalt-50/50 dark:hover:bg-asphalt-900/10 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-asphalt-900 dark:text-white">{dev.name}</div>
                              <div className="text-[10px] text-asphalt-400 font-mono mt-0.5">{dev.deviceId}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-asphalt-700 dark:text-asphalt-300 truncate max-w-[150px]" title={dev.zoneId?.name}>
                                {dev.zoneId ? dev.zoneId.name : <span className="text-asphalt-400 italic">Unmapped Zone</span>}
                              </div>
                              <div className="text-[10px] text-asphalt-500 font-bold mt-0.5 flex items-center gap-1">
                                {dev.slotId ? (
                                  <>
                                    <span>Slot: {dev.slotId.slotIdentifier}</span>
                                    <span className={`w-1.5 h-1.5 rounded-full ${dev.slotId.isOccupied ? 'bg-red-500' : 'bg-green-500'}`} title={dev.slotId.isOccupied ? 'Occupied' : 'Vacant'} />
                                  </>
                                ) : (
                                  <span className="text-asphalt-400 italic">No Slot Mapped</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`status-chip text-[9px] ${
                                  dev.status === 'Online' ? 'badge-emerald' :
                                  dev.status === 'Offline' ? 'badge-slate' :
                                  dev.status === 'Disabled' ? 'badge-red' : 'badge-yellow'
                                }`}>
                                  {dev.status}
                                </span>
                                <span className={`text-[10px] font-bold ${dev.isActive ? 'text-green-600' : 'text-red-500'}`}>
                                  {dev.isActive ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                              <div className="text-[10px] text-asphalt-400 flex items-center gap-1">
                                <span>Health:</span>
                                <span className={`font-bold ${dev.healthStatus === 'Healthy' ? 'text-green-600' : 'text-red-550'}`}>
                                  {dev.healthStatus || 'Healthy'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-asphalt-500 font-medium">
                              <div className="flex items-center gap-1 text-[10px] font-semibold">
                                <Battery className="w-3.5 h-3.5" /> {dev.battery !== null ? `${dev.battery}%` : '—'}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] font-semibold mt-1">
                                <Wifi className="w-3.5 h-3.5" /> {dev.signalStrength !== null ? `${dev.signalStrength} dBm` : '—'}
                              </div>
                              <div className="text-[9px] text-asphalt-400 font-bold mt-1 font-mono">v{dev.firmwareVersion}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-asphalt-700 dark:text-asphalt-300">
                                {dev.lastHeartbeat ? new Date(dev.lastHeartbeat).toLocaleTimeString() : 'Never'}
                              </div>
                              <div className="text-[9px] text-asphalt-400 font-mono mt-0.5">{dev.lastIp || 'No IP'}</div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex justify-end items-center gap-1">
                                <button 
                                  onClick={() => handleIotToggle(dev.deviceId)} 
                                  className={`p-1.5 border rounded-lg transition ${dev.isActive ? 'text-red-650 hover:bg-red-50 border-red-200' : 'text-green-600 hover:bg-green-50 border-green-200'}`}
                                  title={dev.isActive ? 'Disable Device' : 'Enable Device'}
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleIotSync(dev.deviceId)} 
                                  disabled={!dev.isActive}
                                  className="p-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-40"
                                  title="Sync Configuration"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleIotRestart(dev.deviceId)} 
                                  disabled={!dev.isActive}
                                  className="p-1.5 border border-purple-200 text-purple-600 hover:bg-purple-50 rounded-lg disabled:opacity-40"
                                  title="Restart Device"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => downloadConfigFile(dev.deviceId, '')} 
                                  className="p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
                                  title="Download JSON Config"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleIotDelete(dev.deviceId)} 
                                  className="p-1.5 border border-red-200 text-parking-danger hover:bg-red-50 rounded-lg"
                                  title="Delete Device"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* System Device Logs */}
              <div className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
                <h3 className="text-base font-bold text-asphalt-850 dark:text-white flex items-center gap-1.5">
                  <Activity className="w-5 h-5 text-amber-500" /> Live IoT Logs Timeline
                </h3>
                <div className="space-y-3.5 max-h-[400px] overflow-y-auto pr-1">
                  {iotLogs.length === 0 ? (
                    <div className="p-8 text-center text-asphalt-500 italic">No device transaction logs recorded.</div>
                  ) : (
                    iotLogs.map((log, i) => (
                      <div key={log._id || i} className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-250 dark:border-asphalt-850 rounded-lg flex flex-col justify-between text-xs gap-1.5 font-semibold">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className={`font-bold uppercase tracking-widest ${
                            log.status === 'SUCCESS' ? 'text-green-600' : 'text-red-500'
                          }`}>
                            {log.type} · {log.status}
                          </span>
                          <span className="font-mono text-asphalt-400 font-bold">
                            {new Date(log.createdAt).toLocaleTimeString()} · {new Date(log.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-asphalt-700 dark:text-asphalt-200">
                          Device: <span className="font-mono font-bold text-parking-accent">{log.deviceId}</span>
                          {log.error && <span className="text-red-500 block text-[11px] mt-0.5 font-bold">Error: {log.error}</span>}
                        </p>
                        {log.payload && Object.keys(log.payload).length > 0 && (
                          <div className="text-[10px] bg-white dark:bg-asphalt-950 p-2 rounded border border-asphalt-200 dark:border-asphalt-800 font-mono overflow-x-auto text-asphalt-500">
                            {JSON.stringify(log.payload)}
                          </div>
                        )}
                        <span className="text-[9px] text-asphalt-450 font-bold uppercase">Source IP: {log.ipAddress}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>

    {/* ─── REGISTER DEVICE MODAL ─── */}
    <AnimatePresence>
      {showIotRegisterModal && (
        <div className="fixed inset-0 bg-asphalt-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowIotRegisterModal(false)}>
          <div className="bg-white dark:bg-parking-card w-full max-w-md rounded-2xl shadow-2xl border border-asphalt-200 dark:border-asphalt-800 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-asphalt-900 dark:text-white uppercase tracking-wider">Register IoT Device</h3>
              <button onClick={() => setShowIotRegisterModal(false)} className="p-1 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-800 text-asphalt-450"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleIotRegisterSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-asphalt-450 uppercase block">Device Custom Name</label>
                <input 
                  type="text" 
                  required 
                  value={iotRegForm.name} 
                  onChange={e => setIotRegForm({...iotRegForm, name: e.target.value})} 
                  placeholder="e.g. CP Block-A Slot 5 Sensor" 
                  className="form-input mt-1 w-full" 
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-asphalt-450 uppercase block">Assign Parking Provider</label>
                <select
                  required
                  value={iotRegForm.providerId}
                  onChange={e => handleIotProviderChange(e.target.value)}
                  className="form-input mt-1 w-full bg-white dark:bg-asphalt-900"
                >
                  <option value="">Select a Provider</option>
                  {iotProviders.map(p => (
                    <option key={p._id} value={p._id}>{p.fullName} ({p.businessName || p.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-asphalt-450 uppercase block">Assign Parking Zone</label>
                <select
                  value={iotRegForm.zoneId}
                  onChange={e => handleIotZoneChange(e.target.value)}
                  className="form-input mt-1 w-full bg-white dark:bg-asphalt-900"
                >
                  <option value="">Select a Parking Zone (Optional)</option>
                  {allZones.filter(z => z.providerId?._id === iotRegForm.providerId || z.providerId === iotRegForm.providerId).map(z => (
                    <option key={z._id} value={z._id}>{z.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-asphalt-450 uppercase block">Map to Specific Slot</label>
                <select
                  value={iotRegForm.slotId}
                  onChange={e => setIotRegForm({...iotRegForm, slotId: e.target.value})}
                  className="form-input mt-1 w-full bg-white dark:bg-asphalt-900"
                >
                  <option value="">Select a Slot (Optional)</option>
                  {iotSlots.map(s => (
                    <option key={s._id} value={s._id}>{s.slotIdentifier} ({s.floor || 'Floor 0'})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-asphalt-450 uppercase block">Firmware Version</label>
                <input 
                  type="text" 
                  value={iotRegForm.firmwareVersion} 
                  onChange={e => setIotRegForm({...iotRegForm, firmwareVersion: e.target.value})} 
                  className="form-input mt-1 w-full" 
                />
              </div>
              <button type="submit" className="w-full btn-primary py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 mt-2">
                <Plus className="w-4 h-4" /> Register Sensor
              </button>
            </form>
          </div>
        </div>
      )}
    </AnimatePresence>

    {/* ─── CREDENTIALS SHOWCASE MODAL ─── */}
    <AnimatePresence>
      {showIotCredsModal && iotRegCreds && (
        <div className="fixed inset-0 bg-asphalt-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowIotCredsModal(false)}>
          <div className="bg-white dark:bg-parking-card w-full max-w-md rounded-2xl shadow-2xl border border-asphalt-200 dark:border-asphalt-800 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 border-b pb-2">
              <h3 className="text-base font-black flex items-center gap-1.5 uppercase tracking-wider"><CheckCircle2 className="w-5 h-5" /> Device Registered</h3>
              <button onClick={() => setShowIotCredsModal(false)} className="p-1 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-800 text-asphalt-450"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-200 rounded-lg text-[10px] font-bold">
              [IMPORTANT] Copy these credentials now. The Device Token and API Key will NOT be displayed again.
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[10px] font-bold text-asphalt-450 uppercase block">Device ID</span>
                <div className="p-2 bg-asphalt-50 dark:bg-asphalt-900 border rounded font-mono select-all mt-1">{iotRegCreds.deviceId}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-asphalt-450 uppercase block">Device Token</span>
                <div className="p-2 bg-asphalt-50 dark:bg-asphalt-900 border rounded font-mono select-all mt-1">{iotRegCreds.deviceToken}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-asphalt-450 uppercase block">API Key</span>
                <div className="p-2 bg-asphalt-50 dark:bg-asphalt-900 border rounded font-mono select-all mt-1">{iotRegCreds.apiKey}</div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => downloadConfigFile(iotRegCreds.deviceId, iotRegCreds.deviceToken)} 
                className="flex-1 btn-primary py-2.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Config JSON
              </button>
              <button 
                onClick={() => setShowIotCredsModal(false)} 
                className="flex-1 bg-asphalt-200 dark:bg-asphalt-800 hover:bg-asphalt-250 text-asphalt-900 dark:text-white py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
 
    {/* ─── PROVIDER VERIFICATION CENTER DRAWER ─── */}
    <AnimatePresence>
      {selectedProvider && (
        <div className="fixed inset-0 bg-asphalt-950/50 backdrop-blur-sm z-50 flex items-center justify-end" onClick={() => { setSelectedProvider(null); setShowActionModal(null); }}>
          <div className="bg-white dark:bg-parking-card w-full max-w-2xl h-full flex flex-col shadow-2xl border-l border-asphalt-200 dark:border-asphalt-800" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div className="p-6 border-b border-asphalt-100 dark:border-asphalt-800 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-black text-asphalt-900 dark:text-white">Provider Verification Details</h3>
                <p className="text-xs text-asphalt-500 mt-0.5">{selectedProvider.fullName} · {selectedProvider.businessName}</p>
              </div>
              <button onClick={() => { setSelectedProvider(null); setShowActionModal(null); }} className="p-2 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-800 text-asphalt-450">
                <BadgeX className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Status card */}
              <div className="p-4 bg-asphalt-50 dark:bg-asphalt-900/40 border border-asphalt-250 dark:border-asphalt-850 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-asphalt-400 font-bold uppercase block">Verification Status</span>
                  <span className={`status-chip text-xs mt-1 inline-block ${
                    selectedProvider.status === 'ACTIVE' ? 'badge-emerald' :
                    selectedProvider.status === 'REJECTED' ? 'badge-red' :
                    selectedProvider.status === 'PENDING_APPROVAL' ? 'badge-yellow' :
                    selectedProvider.status === 'UNDER_REVIEW' ? 'badge-blue' :
                    selectedProvider.status === 'SUSPENDED' ? 'badge-red' : 'badge-yellow'
                  }`}>{selectedProvider.status}</span>
                </div>
                {selectedProvider.rejectionReason && (
                  <div className="text-right">
                    <span className="text-[10px] text-asphalt-400 font-bold uppercase block">Rejection/Suspension Reason</span>
                    <span className="text-xs font-semibold text-parking-danger mt-1 block">{selectedProvider.rejectionReason}</span>
                  </div>
                )}
              </div>

              {/* Contact & Registration Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl space-y-1">
                  <p className="text-[10px] text-asphalt-400 font-bold uppercase">Contact Information</p>
                  <p className="text-xs font-semibold">Email: {selectedProvider.email}</p>
                  <p className="text-xs font-semibold">Phone: {selectedProvider.phone || 'N/A'}</p>
                </div>
                <div className="p-4 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl space-y-1">
                  <p className="text-[10px] text-asphalt-400 font-bold uppercase">Registration Details</p>
                  <p className="text-xs font-semibold">Date Registered: {new Date(selectedProvider.createdAt).toLocaleDateString()}</p>
                  <p className="text-xs font-semibold">Verification Stage: {selectedProvider.verificationStatus || 'Pending'}</p>
                </div>
              </div>

              {/* Submitted Documents & Proofs */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-asphalt-500 uppercase tracking-wider">Submitted Document Proofs</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl space-y-1.5">
                    <p className="text-[10px] text-asphalt-400 font-bold uppercase">Identity Proof (Aadhaar/PAN/DL)</p>
                    <p className="text-xs font-black text-asphalt-850 dark:text-white truncate">{selectedProvider.governmentId || 'Not uploaded'}</p>
                  </div>
                  <div className="p-4 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl space-y-1.5">
                    <p className="text-[10px] text-asphalt-400 font-bold uppercase">Property Proof (Lease/Deed)</p>
                    {selectedProvider.propertyProof ? (
                      <a href={selectedProvider.propertyProof} target="_blank" rel="noreferrer" className="text-xs text-parking-primary font-bold hover:underline flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> View Ownership Deed
                      </a>
                    ) : (
                      <p className="text-xs text-asphalt-400 italic">No proof uploaded</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bank details */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-asphalt-500 uppercase tracking-wider">Banking & GST</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl">
                    <p className="text-[9px] text-asphalt-400 font-bold uppercase">Bank Account</p>
                    <p className="text-xs font-bold text-asphalt-800 dark:text-asphalt-205 mt-1 font-mono">{selectedProvider.bankAccount || '—'}</p>
                  </div>
                  <div className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl">
                    <p className="text-[9px] text-asphalt-400 font-bold uppercase">UPI ID</p>
                    <p className="text-xs font-bold text-asphalt-800 dark:text-asphalt-205 mt-1 font-mono">{selectedProvider.upiId || '—'}</p>
                  </div>
                  <div className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl">
                    <p className="text-[9px] text-asphalt-400 font-bold uppercase">GST IN</p>
                    <p className="text-xs font-bold text-asphalt-800 dark:text-asphalt-205 mt-1 font-mono">{selectedProvider.gstNumber || 'Optional'}</p>
                  </div>
                </div>
              </div>

              {/* Verification checklist tracking */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-asphalt-500 uppercase tracking-wider">KYC Checklist Status (Toggles)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'identity', label: 'Identity Verification', status: selectedProvider.verificationChecks?.identity || 'Pending' },
                    { key: 'property', label: 'Property Ownership Check', status: selectedProvider.verificationChecks?.property || 'Pending' },
                    { key: 'bank', label: 'Bank Account/UPI Verification', status: selectedProvider.verificationChecks?.bank || 'Pending' },
                    { key: 'gps', label: 'GPS Coordinates matching', status: selectedProvider.verificationChecks?.gps || 'Pending' },
                  ].map((chk, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl">
                      <span className="text-xs font-bold text-asphalt-700 dark:text-asphalt-300">{chk.label}</span>
                      <select
                        value={chk.status}
                        onChange={(e) => handleToggleCheck(chk.key, e.target.value)}
                        className={`text-xs font-black px-2 py-1 rounded-lg bg-white dark:bg-asphalt-950 border border-asphalt-200 dark:border-asphalt-800 cursor-pointer ${
                          chk.status === 'Verified' ? 'text-green-600 font-bold' :
                          chk.status === 'Failed' ? 'text-red-500 font-bold' :
                          'text-amber-500 font-bold'
                        }`}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Verified">Verified</option>
                        <option value="Failed">Failed</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Registered Zones */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-asphalt-500 uppercase tracking-wider">Associated Lots ({providerZones.length})</h4>
                {providerZones.length === 0 ? (
                  <p className="text-xs text-asphalt-400 italic">No lots registered under this provider yet.</p>
                ) : (
                  <div className="space-y-2">
                    {providerZones.map(z => (
                      <div key={z._id} className="p-3 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-asphalt-800 dark:text-asphalt-205 block">{z.name}</span>
                          <span className="text-[10px] text-asphalt-450 font-bold uppercase">{z.city} · {z.totalSlots} slots · ₹{z.basePricePerHour}/hr</span>
                        </div>
                        <span className={`status-chip text-[9px] ${z.isApproved ? 'badge-emerald' : 'badge-yellow'}`}>{z.isApproved ? 'Live' : 'Pending'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit history for this provider */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-asphalt-500 uppercase tracking-wider font-mono">Action Audit Logs</h4>
                {providerAudits.length === 0 ? (
                  <p className="text-xs text-asphalt-400 italic">No administrative logs recorded for this provider.</p>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {providerAudits.map((log, idx) => (
                      <div key={log._id || idx} className="p-2.5 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-xl text-[11px] leading-relaxed">
                        <div className="flex justify-between items-center text-[9px] text-asphalt-400">
                          <span className="font-bold uppercase tracking-wider text-amber-500">{log.action}</span>
                          <span className="font-bold font-mono">{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-asphalt-700 dark:text-asphalt-250 font-medium mt-1">{log.details}</p>
                        {log.remarks && <p className="text-[10px] text-asphalt-400 italic mt-0.5">Remarks: "{log.remarks}"</p>}
                        {log.ipAddress && <span className="text-[9px] text-asphalt-400 font-mono block mt-0.5">IP: {log.ipAddress}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Form fields for rejection reason and remarks */}
              <div className="pt-4 border-t border-asphalt-100 dark:border-asphalt-800 space-y-4">
                <h4 className="text-xs font-black text-asphalt-500 uppercase tracking-wider">Verification Controls</h4>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-asphalt-450 uppercase">Admin Remarks (Internal)</label>
                    <input 
                      value={adminRemarksInput} 
                      onChange={e => setAdminRemarksInput(e.target.value)} 
                      className="form-input mt-1.5" 
                      placeholder="Add review feedback, document check remarks..." 
                    />
                  </div>
                  {['REJECTED', 'SUSPENDED', 'request-docs'].includes(showActionModal) && (
                    <div>
                      <label className="text-[11px] font-bold text-parking-danger uppercase">
                        {showActionModal === 'request-docs' ? 'Specify Documents to Request (Visible to Provider) *' : 'Rejection / Suspension Reason (Visible to Provider) *'}
                      </label>
                      <textarea 
                        rows="2"
                        value={rejectionReasonInput} 
                        onChange={e => setRejectionReasonInput(e.target.value)} 
                        className="form-input mt-1.5 resize-none border-red-200 dark:border-red-900/30" 
                        placeholder={showActionModal === 'request-docs' ? "Describe the documents or information needed..." : "State clear reasons why registration was rejected or suspended..."} 
                      />
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-asphalt-100 dark:border-asphalt-800 bg-asphalt-50 dark:bg-asphalt-900/20 shrink-0 flex flex-wrap gap-2.5">
              {selectedProvider.status === 'PENDING_APPROVAL' && (
                <>
                  <button 
                    onClick={() => handleReviewProvider(selectedProvider._id, adminRemarksInput)}
                    className="btn-secondary py-2.5 px-4 text-xs font-bold shadow-none"
                  >
                    Mark Under Review
                  </button>
                  <button 
                    onClick={() => {
                      if (showActionModal === 'reject') {
                        if (!rejectionReasonInput.trim()) return alert('Please enter rejection reason');
                        handleRejectProvider(selectedProvider._id, rejectionReasonInput, adminRemarksInput);
                      } else {
                        setShowActionModal('reject');
                      }
                    }}
                    className="btn-secondary py-2.5 px-4 text-xs font-bold text-parking-danger hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 dark:border-red-900/30 shadow-none"
                  >
                    {showActionModal === 'reject' ? 'Confirm Rejection' : 'Reject'}
                  </button>
                  <button 
                    onClick={() => {
                      if (showActionModal === 'request-docs') {
                        if (!rejectionReasonInput.trim()) return alert('Please specify what documents are needed');
                        handleRequestDocs(selectedProvider._id, rejectionReasonInput);
                      } else {
                        setShowActionModal('request-docs');
                      }
                    }}
                    className="btn-secondary py-2.5 px-4 text-xs font-bold text-amber-600 border-amber-250 hover:bg-amber-50 dark:hover:bg-amber-950/20 shadow-none"
                  >
                    {showActionModal === 'request-docs' ? 'Confirm Request' : 'Request Docs'}
                  </button>
                  <button 
                    onClick={() => handleApproveProvider(selectedProvider._id, adminRemarksInput)}
                    className="btn-primary py-2.5 px-5 text-xs font-bold bg-green-600 hover:bg-green-700 text-white shadow-none"
                  >
                    Approve & Activate
                  </button>
                </>
              )}

              {selectedProvider.status === 'UNDER_REVIEW' && (
                <>
                  <button 
                    onClick={() => {
                      if (showActionModal === 'reject') {
                        if (!rejectionReasonInput.trim()) return alert('Please enter rejection reason');
                        handleRejectProvider(selectedProvider._id, rejectionReasonInput, adminRemarksInput);
                      } else {
                        setShowActionModal('reject');
                      }
                    }}
                    className="btn-secondary py-2.5 px-4 text-xs font-bold text-parking-danger hover:bg-red-50 border-red-200 shadow-none"
                  >
                    {showActionModal === 'reject' ? 'Confirm Rejection' : 'Reject'}
                  </button>
                  <button 
                    onClick={() => {
                      if (showActionModal === 'request-docs') {
                        if (!rejectionReasonInput.trim()) return alert('Please specify what documents are needed');
                        handleRequestDocs(selectedProvider._id, rejectionReasonInput);
                      } else {
                        setShowActionModal('request-docs');
                      }
                    }}
                    className="btn-secondary py-2.5 px-4 text-xs font-bold text-amber-600 border-amber-250 hover:bg-amber-50 dark:hover:bg-amber-950/20 shadow-none"
                  >
                    {showActionModal === 'request-docs' ? 'Confirm Request' : 'Request Docs'}
                  </button>
                  <button 
                    onClick={() => handleApproveProvider(selectedProvider._id, adminRemarksInput)}
                    className="btn-primary py-2.5 px-5 text-xs font-bold bg-green-600 hover:bg-green-700 text-white shadow-none"
                  >
                    Approve & Activate
                  </button>
                </>
              )}

              {selectedProvider.status === 'ACTIVE' && (
                <button 
                  onClick={() => {
                    if (showActionModal === 'suspend') {
                      if (!rejectionReasonInput.trim()) return alert('Please enter suspension reason');
                      handleSuspendProvider(selectedProvider._id, rejectionReasonInput, adminRemarksInput);
                    } else {
                      setShowActionModal('suspend');
                    }
                  }}
                  className="btn-primary py-2.5 px-5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-none"
                >
                  {showActionModal === 'suspend' ? 'Confirm Suspension' : 'Suspend Account'}
                </button>
              )}

              {['REJECTED', 'SUSPENDED'].includes(selectedProvider.status) && (
                <button 
                  onClick={() => handleReactivateProvider(selectedProvider._id, adminRemarksInput)}
                  className="btn-primary py-2.5 px-5 text-xs font-bold bg-green-600 hover:bg-green-700 text-white shadow-none"
                >
                  Reactivate Account
                </button>
              )}

              <button onClick={() => { setSelectedProvider(null); setShowActionModal(null); }} className="btn-secondary py-2.5 px-4 text-xs font-bold ml-auto shadow-none">
                Close Detail
              </button>
            </div>

          </div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
};

export default AdminDashboard;
