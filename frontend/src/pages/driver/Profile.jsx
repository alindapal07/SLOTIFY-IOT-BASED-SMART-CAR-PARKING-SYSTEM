import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../i18n/index.jsx';
import { User, Phone, Mail, ShieldAlert, MapPin, Globe, Moon, Sun, Lock, Loader2, Save, Trash2, Plus } from 'lucide-react';
import api from '../../services/api';

const ProfilePage = () => {
  const { user, login, theme, toggleTheme } = useStore();
  const { t, lang, switchLang, languageNames } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: '', phone: '', profilePhoto: '', emergencyContact: { name: '', phone: '' }, savedAddresses: []
  });
  
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '' });
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');
  const [passSaving, setPassSaving] = useState(false);

  const [newAddress, setNewAddress] = useState({ label: '', address: '' });
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const { data } = await api.get('/auth/me');
        setProfileForm({
          fullName: data.fullName || '',
          phone: data.phone || '',
          profilePhoto: data.profilePhoto || '',
          emergencyContact: data.emergencyContact || { name: '', phone: '' },
          savedAddresses: data.savedAddresses || []
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, []);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setProfileSuccess('');
    setProfileError('');
    try {
      const { data } = await api.put('/auth/profile', profileForm);
      setProfileSuccess('Profile updated successfully.');
      login({ ...user, fullName: data.fullName });
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (!passwordForm.oldPassword || !passwordForm.newPassword) return;
    setPassSaving(true);
    setPassError('');
    setPassSuccess('');
    try {
      await api.put('/auth/change-password', passwordForm);
      setPassSuccess('Password changed successfully.');
      setPasswordForm({ oldPassword: '', newPassword: '' });
    } catch (err) {
      setPassError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setPassSaving(false);
    }
  };

  const handleAddAddress = () => {
    if (!newAddress.label || !newAddress.address) return;
    setProfileForm({
      ...profileForm,
      savedAddresses: [...profileForm.savedAddresses, newAddress]
    });
    setNewAddress({ label: '', address: '' });
  };

  const handleRemoveAddress = (idx) => {
    setProfileForm({
      ...profileForm,
      savedAddresses: profileForm.savedAddresses.filter((_, i) => i !== idx)
    });
  };

  const inputClass = "form-input mt-1.5";

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-parking-primary" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-2 sm:px-4">
      <div className="border-b border-asphalt-200 dark:border-asphalt-800 py-2">
        <h1 className="text-3xl font-black text-asphalt-900 dark:text-white tracking-tight">Profile & Preferences</h1>
        <p className="text-sm text-asphalt-500 dark:text-asphalt-400 mt-1">Manage settings, saved locations, and security keys.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Navigation Sidebar inside Page (Theme & Lang shortcuts) */}
        <div className="space-y-4">
          <div className="glass-card p-5 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
            <h3 className="text-xs font-black uppercase text-asphalt-450 tracking-wider">Preferences</h3>
            
            {/* Language Selection */}
            <div>
              <label className="text-[10px] font-bold text-asphalt-450 uppercase flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Language</label>
              <select 
                value={lang} 
                onChange={(e) => switchLang(e.target.value)} 
                className="form-input mt-1.5 bg-white dark:bg-asphalt-900 text-xs py-2 font-bold"
              >
                {Object.entries(languageNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </div>

            {/* Theme select */}
            <div>
              <label className="text-[10px] font-bold text-asphalt-450 uppercase flex items-center gap-1.5">{theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />} Theme Preference</label>
              <button 
                onClick={toggleTheme}
                className="w-full mt-1.5 btn-secondary text-xs py-2 border border-asphalt-250 dark:border-asphalt-800 flex items-center justify-center gap-1.5 shadow-none"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                Toggle {theme === 'light' ? 'Dark' : 'Light'} Mode
              </button>
            </div>
          </div>
        </div>

        {/* Form Details Column */}
        <div className="md:col-span-2 space-y-6">
          {/* Personal Info Form */}
          <form onSubmit={handleProfileSave} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
            <h3 className="font-bold text-base text-asphalt-850 dark:text-white border-b border-asphalt-100 dark:border-asphalt-850 pb-2">Personal Information</h3>
            
            {profileSuccess && <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-green-600 dark:text-green-400 border border-green-200 rounded-lg text-xs">{profileSuccess}</div>}
            {profileError && <div className="p-3 bg-red-50 dark:bg-red-950/20 text-parking-danger rounded-lg text-xs border border-red-200">{profileError}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-asphalt-450 uppercase">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-4 w-4 h-4 text-asphalt-400" />
                  <input value={profileForm.fullName} onChange={e => setProfileForm({...profileForm, fullName: e.target.value})} required className={`${inputClass} pl-9`} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-asphalt-450 uppercase">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-4 w-4 h-4 text-asphalt-400" />
                  <input value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} className={`${inputClass} pl-9`} placeholder="e.g. +91 98765 43210" />
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="bg-asphalt-50 dark:bg-asphalt-900/40 p-4 border border-asphalt-200/50 dark:border-asphalt-800/50 rounded-lg space-y-3">
              <h4 className="text-xs font-bold text-asphalt-800 dark:text-asphalt-250 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-red-500" /> Emergency Contact</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-asphalt-450 uppercase">Contact Name</label>
                  <input value={profileForm.emergencyContact.name} onChange={e => setProfileForm({...profileForm, emergencyContact: { ...profileForm.emergencyContact, name: e.target.value }})} className="form-input mt-1.5 bg-white dark:bg-asphalt-950" placeholder="Contact Person" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-asphalt-450 uppercase">Contact Phone</label>
                  <input value={profileForm.emergencyContact.phone} onChange={e => setProfileForm({...profileForm, emergencyContact: { ...profileForm.emergencyContact, phone: e.target.value }})} className="form-input mt-1.5 bg-white dark:bg-asphalt-950" placeholder="Phone Number" />
                </div>
              </div>
            </div>

            {/* Saved Addresses list */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-asphalt-800 dark:text-asphalt-250 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-parking-primary" /> Saved Addresses</h4>
              <div className="space-y-2">
                {profileForm.savedAddresses.map((addr, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-white dark:bg-asphalt-900 border border-asphalt-200 dark:border-asphalt-800 rounded-lg">
                    <div>
                      <span className="badge-blue text-[9px] py-0.5 border-none uppercase tracking-wider">{addr.label}</span>
                      <p className="text-xs text-asphalt-850 dark:text-asphalt-200 mt-1 font-semibold">{addr.address}</p>
                    </div>
                    <button type="button" onClick={() => handleRemoveAddress(idx)} className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 text-parking-danger border border-transparent rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input value={newAddress.label} onChange={e => setNewAddress({...newAddress, label: e.target.value})} className="sm:col-span-3 form-input py-2 text-xs" placeholder="Label (Home, Work)" />
                <input value={newAddress.address} onChange={e => setNewAddress({...newAddress, address: e.target.value})} className="sm:col-span-7 form-input py-2 text-xs" placeholder="Full Address" />
                <button type="button" onClick={handleAddAddress} className="sm:col-span-2 btn-secondary py-2 text-xs font-bold flex items-center justify-center gap-1 border border-asphalt-250 dark:border-asphalt-800 shadow-none"><Plus className="w-3.5 h-3.5" /> Add</button>
              </div>
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full py-3 text-xs font-bold flex items-center justify-center gap-1.5 shadow-none mt-4">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Profile
            </button>
          </form>

          {/* Change Password Form */}
          <form onSubmit={handlePasswordSave} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 space-y-4">
            <h3 className="font-bold text-base text-asphalt-850 dark:text-white border-b border-asphalt-100 dark:border-asphalt-850 pb-2">Change Password</h3>

            {passSuccess && <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-green-600 dark:text-green-400 border border-green-200 rounded-lg text-xs">{passSuccess}</div>}
            {passError && <div className="p-3 bg-red-50 dark:bg-red-950/20 text-parking-danger rounded-lg text-xs border border-red-200">{passError}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-asphalt-450 uppercase">Current Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-4 w-4 h-4 text-asphalt-400" />
                  <input type="password" value={passwordForm.oldPassword} onChange={e => setPasswordForm({...passwordForm, oldPassword: e.target.value})} required className={`${inputClass} pl-9`} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-asphalt-450 uppercase">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-4 w-4 h-4 text-asphalt-400" />
                  <input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} required className={`${inputClass} pl-9`} />
                </div>
              </div>
            </div>

            <button type="submit" disabled={passSaving} className="btn-primary py-3 text-xs font-bold w-full flex items-center justify-center gap-1.5 shadow-none mt-2">
              {passSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Change Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
