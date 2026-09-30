import React, { useState, useEffect } from 'react';
import {
  Settings, Cpu, Wifi, Shield, Server, RefreshCw, CheckCircle,
  AlertTriangle, Copy, Save, Power, ChevronDown, Info, Link as LinkIcon
} from 'lucide-react';
import api from '../../services/api';

const Label = ({ children }) => (
  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{children}</label>
);

const FieldBox = ({ children }) => (
  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 gap-2">
    {children}
  </div>
);

const SectionCard = ({ children, className = '' }) => (
  <div className={`bg-white border border-gray-200 rounded-xl shadow-sm ${className}`}>{children}</div>
);

const IoTSettings = () => {
  const [config, setConfig] = useState({
    iotMode: false,
    communicationType: 'HTTP',
    mqttSettings: {
      brokerUrl: '', port: 1883, username: '', password: '',
      topic: '', qos: 0, tls: false, reconnectInterval: 5,
      heartbeatInterval: 30, autoConnect: true
    }
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  const fetchConfig = async () => {
    try {
      const { data } = await api.get('/iot/config');
      if (data) {
        setConfig(prev => ({
          ...prev,
          iotMode: data.iotMode || false,
          communicationType: data.communicationType || 'HTTP',
          mqttSettings: { ...prev.mqttSettings, ...(data.mqttSettings || {}) }
        }));
      }
    } catch (err) {
      console.error('Failed to load IoT configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/iot/config', config);
      setTestResult({ success: true, message: 'Settings saved successfully.' });
      setTimeout(() => setTestResult(null), 4000);
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/iot/test-connection');
      setTestResult({
        success: data.success,
        message: data.success
          ? `Connected · Database: ${data.database} · API reachable`
          : 'Connection test failed. Check settings.'
      });
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.message || 'API connection failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleMode = async () => {
    const newMode = !config.iotMode;
    setConfig(c => ({ ...c, iotMode: newMode }));
    try {
      await api.post('/iot/config', { ...config, iotMode: newMode });
    } catch (err) {
      setConfig(c => ({ ...c, iotMode: !newMode }));
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  const baseUrl = api.defaults.baseURL || `${window.location.protocol}//${window.location.host}/api/v1`;
  const backendUrl = `${baseUrl}/iot/update-slot`;
  const socketUrl = baseUrl.replace('/api/v1', '').replace(/^http/, 'ws');

  return (
    <div className="max-w-3xl mx-auto space-y-5 py-1">

      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
          <Settings className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">IoT Settings</h1>
          <p className="text-sm text-gray-500">Configure communication modes and broker credentials for connected sensors.</p>
        </div>
      </div>

      {/* Toast Feedback */}
      {testResult && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
          testResult.success
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {testResult.success
            ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />}
          <span className="font-medium">{testResult.message}</span>
        </div>
      )}

      {/* IoT Mode Toggle */}
      <SectionCard>
        <div className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              config.iotMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-gray-100 border-gray-200 text-gray-400'
            }`}>
              <Power className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">IoT Integration</p>
              <p className="text-xs text-gray-500 mt-0.5">Enable or disable slot updates from physical and simulated sensors.</p>
            </div>
          </div>
          <button
            onClick={handleToggleMode}
            className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none shrink-0 ${
              config.iotMode ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
              config.iotMode ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
        <div className={`mx-5 mb-5 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
          config.iotMode
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            : 'bg-gray-50 text-gray-500 border border-gray-100'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${config.iotMode ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
          {config.iotMode ? 'IoT mode is active — sensors can update slot availability' : 'IoT mode is disabled'}
        </div>
      </SectionCard>

      {/* Communication Protocol */}
      <SectionCard>
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Wifi className="w-4 h-4 text-blue-500" />
            <h2 className="font-semibold text-gray-900 text-sm">Communication Protocol</h2>
          </div>
          <div>
            <Label>Protocol Type</Label>
            <div className="relative">
              <select
                value={config.communicationType}
                onChange={(e) => setConfig(c => ({ ...c, communicationType: e.target.value }))}
                className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 pr-9"
              >
                <option value="HTTP">HTTP REST API</option>
                <option value="MQTT">MQTT Broker (Low Power)</option>
                <option value="WebSocket">WebSocket Connection</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Protocol Details */}
        <div className="px-5 py-4 space-y-4">

          {config.communicationType === 'HTTP' && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Server className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">HTTP API Endpoints</span>
              </div>
              <div>
                <Label>Slot Update Endpoint</Label>
                <FieldBox>
                  <code className="text-xs text-gray-700 flex-1 select-all font-mono overflow-x-auto">{backendUrl}</code>
                  <button
                    onClick={() => copyToClipboard(backendUrl, 'url')}
                    className="text-gray-400 hover:text-blue-600 transition shrink-0"
                    title="Copy URL"
                  >
                    {copiedText === 'url'
                      ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                      : <Copy className="w-4 h-4" />}
                  </button>
                </FieldBox>
                <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                  <Info className="w-3 h-3" /> POST with <code className="font-mono bg-gray-100 px-1 rounded text-[10px]">deviceId</code>, <code className="font-mono bg-gray-100 px-1 rounded text-[10px]">deviceToken</code>, <code className="font-mono bg-gray-100 px-1 rounded text-[10px]">slotOccupied</code>
                </p>
              </div>
            </>
          )}

          {config.communicationType === 'MQTT' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">MQTT Broker Configuration</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Broker Host / IP', key: 'brokerUrl', placeholder: 'broker.hivemq.com', type: 'text' },
                  { label: 'Port', key: 'port', placeholder: '1883', type: 'number' },
                  { label: 'Username (Optional)', key: 'username', placeholder: '—', type: 'text' },
                  { label: 'Password (Optional)', key: 'password', placeholder: '——', type: 'password' },
                  { label: 'Base Topic', key: 'topic', placeholder: 'smart_parking/slots', type: 'text' },
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <input
                      type={type}
                      value={config.mqttSettings[key]}
                      onChange={(e) => setConfig(c => ({
                        ...c,
                        mqttSettings: { ...c.mqttSettings, [key]: type === 'number' ? parseInt(e.target.value) || 1883 : e.target.value }
                      }))}
                      placeholder={placeholder}
                      className="w-full border border-gray-200 bg-white rounded-lg px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-1 sm:col-span-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.mqttSettings.tls}
                      onChange={(e) => setConfig(c => ({ ...c, mqttSettings: { ...c.mqttSettings, tls: e.target.checked } }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-300 peer-checked:bg-blue-500 rounded-full peer-focus:ring-2 peer-focus:ring-blue-300 transition-colors">
                      <div className={`w-3.5 h-3.5 bg-white rounded-full shadow mt-0.5 transition-transform ${config.mqttSettings.tls ? 'translate-x-4.5 ml-0' : 'ml-0.5'}`} />
                    </div>
                  </label>
                  <span className="text-sm font-medium text-gray-700">Enable SSL / TLS Encryption</span>
                </div>
              </div>
            </>
          )}

          {config.communicationType === 'WebSocket' && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <LinkIcon className="w-4 h-4 text-sky-500" />
                <span className="text-xs font-semibold text-sky-700 uppercase tracking-wider">WebSocket Gateway</span>
              </div>
              <div>
                <Label>Socket Service URL</Label>
                <FieldBox>
                  <code className="text-xs text-gray-700 flex-1 select-all font-mono overflow-x-auto">{socketUrl}</code>
                  <button
                    onClick={() => copyToClipboard(socketUrl, 'socketUrl')}
                    className="text-gray-400 hover:text-blue-600 transition shrink-0"
                  >
                    {copiedText === 'socketUrl'
                      ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                      : <Copy className="w-4 h-4" />}
                  </button>
                </FieldBox>
                <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Connect via Socket.IO and emit <code className="font-mono bg-gray-100 px-1 rounded text-[10px]">SLOT_UPDATE</code> events
                </p>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-5 py-2 rounded-lg transition disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

    </div>
  );
};

export default IoTSettings;
