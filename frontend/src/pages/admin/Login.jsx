import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { Mail, Lock, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import api from '../../services/api';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { login, isAuthenticated } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      const storedUser = JSON.parse(localStorage.getItem('user'));
      if (storedUser?.role === 'ADMIN') {
        navigate('/admin/dashboard');
      }
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password, rememberMe });
      if (data.role !== 'ADMIN') {
        setErrorMsg('Access Denied: Only Administrator accounts can log in here.');
        setIsLoading(false);
        return;
      }
      login(data);
      setSuccessMsg('Login successful! Redirecting...');
      setTimeout(() => navigate('/admin/dashboard'), 1500);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-parking-card border border-asphalt-200 dark:border-asphalt-800 rounded-2xl shadow-xl p-8"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20 mb-3 text-amber-500">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-asphalt-900 dark:text-white">Admin Control Portal</h2>
          <p className="text-xs text-asphalt-500 dark:text-asphalt-400 mt-1">Authorized access only. Audit logs are active.</p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-parking-danger rounded-xl text-xs font-bold">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3.5 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400 rounded-xl text-xs font-bold">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[11px] font-bold text-asphalt-450 uppercase tracking-wider block mb-1">Admin Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-asphalt-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input pl-10"
                placeholder="admin@smartparking.in"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-asphalt-450 uppercase tracking-wider block mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-asphalt-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="form-input pl-10 pr-10"
                placeholder="••••••••"
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-asphalt-400 hover:text-asphalt-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-asphalt-600 dark:text-asphalt-300">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="rounded border-asphalt-250 dark:border-asphalt-800 text-parking-primary focus:ring-parking-primary"
              />
              <span>Remember Me</span>
            </label>
            <button 
              type="button"
              onClick={() => alert("Please contact the system Superadmin to request a password reset.")}
              className="text-amber-600 hover:underline"
            >
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Secure Login
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
