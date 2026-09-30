import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, Plus, ShieldCheck, Trash2, X, Loader2, Zap } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import api from '../../services/api';

const VehicleManager = () => {
  const { t } = useI18n();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ make: '', model: '', licensePlate: '', vehicleType: 'Car', isEV: false, color: '' });

  const fetchVehicles = async () => {
    try {
      const { data } = await api.get('/vehicles');
      setVehicles(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchVehicles(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.make || !form.model) return;
    setSaving(true);
    try {
      // Build payload — omit licensePlate entirely if it's blank
      const payload = {
        make: form.make.trim(),
        model: form.model.trim(),
        vehicleType: form.vehicleType,
        isEV: form.isEV,
        color: form.color
      };
      const plate = form.licensePlate?.trim();
      if (plate) payload.licensePlate = plate.toUpperCase();

      await api.post('/vehicles', payload);
      setForm({ make: '', model: '', licensePlate: '', vehicleType: 'Car', isEV: false, color: '' });
      setShowForm(false);
      fetchVehicles();
    } catch (err) { console.error(err); alert(err.response?.data?.message || 'Error saving vehicle'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this vehicle?')) return;
    try {
      await api.delete(`/vehicles/${id}`);
      fetchVehicles();
    } catch (err) { console.error(err); }
  };

  const typeBadges = { 
    Car: 'badge-blue', 
    SUV: 'badge-yellow', 
    EV: 'badge-emerald', 
    Motorcycle: 'badge-yellow', 
    Truck: 'badge-red' 
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-2 sm:px-4">
      <div className="flex justify-between items-end border-b border-asphalt-200 dark:border-asphalt-800 py-2">
        <div>
          <h1 className="text-3xl font-black text-asphalt-900 dark:text-white tracking-tight">{t('vehicles.title')}</h1>
          <p className="text-sm text-asphalt-500 dark:text-asphalt-400 mt-1">{t('vehicles.subtitle')}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary py-2 px-4 flex items-center gap-1.5 text-xs shadow-none font-bold">
          <Plus className="w-4 h-4" /> {t('vehicles.addVehicle')}
        </button>
      </div>

      {/* Add Vehicle Modal Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-asphalt-950/40 dark:bg-asphalt-950/70 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.form 
              initial={{scale:0.97, opacity:0}} 
              animate={{scale:1, opacity:1}} 
              exit={{scale:0.97, opacity:0}} 
              onClick={(e) => e.stopPropagation()} 
              onSubmit={handleSubmit} 
              className="bg-white dark:bg-parking-card rounded-card border border-asphalt-200 dark:border-asphalt-800 p-6 w-full max-w-md shadow-lg space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b border-asphalt-100 dark:border-asphalt-800">
                <h3 className="text-lg font-bold text-asphalt-900 dark:text-white">{t('vehicles.addVehicle')}</h3>
                <button type="button" onClick={() => setShowForm(false)} className="p-1 hover:bg-asphalt-100 dark:hover:bg-asphalt-800 rounded-lg text-asphalt-450 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              
              <div>
                <label className="text-[11px] font-bold text-asphalt-450 uppercase tracking-wider">{t('vehicles.make')}</label>
                <input value={form.make} onChange={e => setForm({...form, make: e.target.value})} required className="form-input mt-1.5" placeholder="e.g. Maruti Suzuki" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-asphalt-450 uppercase tracking-wider">{t('vehicles.model')}</label>
                <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} required className="form-input mt-1.5" placeholder="e.g. Swift Dzire" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-asphalt-450 uppercase tracking-wider">{t('vehicles.plate')}</label>
                <input value={form.licensePlate} onChange={e => setForm({...form, licensePlate: e.target.value.toUpperCase()})} className="form-input mt-1.5 font-mono" placeholder="e.g. WB 26 AE 1234" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-asphalt-450 uppercase tracking-wider">{t('vehicles.type')}</label>
                  <select value={form.vehicleType} onChange={e => setForm({...form, vehicleType: e.target.value})} className="form-input mt-1.5 bg-white dark:bg-asphalt-900">
                    {['Car', 'Hatchback', 'Sedan', 'SUV', 'Luxury Car', 'EV', 'Motorcycle', 'Bike', 'Scooter', 'Truck', 'Mini Truck', 'Bus', 'Handicap'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-asphalt-450 uppercase tracking-wider">{t('vehicles.color')}</label>
                  <input value={form.color} onChange={e => setForm({...form, color: e.target.value})} className="form-input mt-1.5" placeholder="e.g. White" />
                </div>
              </div>
              
              <label className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30 rounded-lg cursor-pointer">
                <input type="checkbox" checked={form.isEV} onChange={e => setForm({...form, isEV: e.target.checked})} className="w-4 h-4 accent-green-600 rounded bg-transparent border-green-300 focus:ring-green-500" />
                <Zap className="w-4 h-4 text-parking-accent" />
                <span className="font-semibold text-sm text-green-700 dark:text-green-400">{t('vehicles.isEV')}</span>
              </label>

              <button type="submit" disabled={saving} className="w-full btn-primary py-3 font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-none mt-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {t('vehicles.save')}
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vehicle Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading && <div className="col-span-2 text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-parking-primary" /></div>}
        {!loading && vehicles.length === 0 && (
          <div className="col-span-2 glass-card p-12 text-center border border-asphalt-200 dark:border-asphalt-800">
            <Car className="w-12 h-12 text-asphalt-300 dark:text-asphalt-700 mx-auto mb-3" />
            <p className="text-asphalt-500 text-sm">{t('vehicles.noVehicles')}</p>
          </div>
        )}
        {vehicles.map((v, i) => (
          <motion.div 
            key={v._id || i} 
            initial={{opacity:0,y:10}} 
            animate={{opacity:1,y:0}} 
            transition={{delay:i*0.05}} 
            className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 relative group overflow-hidden"
          >
            <ShieldCheck className="absolute -bottom-4 -right-4 w-28 h-28 text-asphalt-100 dark:text-asphalt-900 opacity-20 pointer-events-none" />
            
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="p-2.5 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-lg text-parking-primary">
                <Car className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className={`status-chip text-[10px] ${typeBadges[v.vehicleType] || 'badge-blue'}`}>
                  {v.vehicleType}
                </span>
                <button onClick={() => handleDelete(v._id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-parking-danger hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md border border-transparent hover:border-red-200/50 dark:hover:border-red-900/20 transition-all" title={t('vehicles.delete')}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="relative z-10 space-y-1">
              <h3 className="text-xl font-bold text-asphalt-900 dark:text-white leading-tight">{v.make}</h3>
              <p className="text-sm text-asphalt-500 dark:text-asphalt-400 font-medium">{v.model} {v.color && `• ${v.color}`}</p>
              <div className="flex items-center gap-2 pt-2">
                <div className="inline-block px-3 py-1 bg-asphalt-100 dark:bg-asphalt-900 text-asphalt-900 dark:text-white font-mono font-black border border-asphalt-200 dark:border-asphalt-800 rounded text-sm tracking-widest shadow-sm">
                  {v.licensePlate}
                </div>
                {v.isEV && <span className="badge-emerald py-0.5 px-2 text-[9px] h-fit">⚡ EV</span>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default VehicleManager;
