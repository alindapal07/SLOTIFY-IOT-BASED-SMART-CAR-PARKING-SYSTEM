import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../i18n/index.jsx';
import { Mail, Lock, Car, Building2, KeyRound, ShieldCheck, User, Loader2, Eye, EyeOff, Phone, Landmark, FileText, CheckCircle, Smartphone, ArrowRight } from 'lucide-react';
import api from '../../services/api';

const Login = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState('login'); // login | register | forgot | reset
  const [role, setRole] = useState('DRIVER');
  const [formData, setFormData] = useState({ 
    fullName: '', email: '', password: '', newPassword: '',
    phone: '', businessName: '', governmentId: '', propertyProof: '', 
    bankAccount: '', upiId: '', gstNumber: '', termsAccepted: false 
  });
  const [regStep, setRegStep] = useState(1);
  const [resetToken, setResetToken] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login, isAuthenticated } = useStore();
  const navigate = useNavigate();

  // Reset registration step on role change or mode change
  useEffect(() => {
    setRegStep(1);
  }, [viewMode, role]);

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
    }
  }, []);

  // Handle initial page load and routing based on query params
  useEffect(() => {
    const mode = searchParams.get('mode');
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (mode === 'register') {
      setViewMode('register');
    } else if (token && email) {
      setViewMode('reset');
      setFormData(prev => ({ ...prev, email }));
      setResetToken(token);
    }
  }, [searchParams]);

  // If already authenticated, redirect to the appropriate dashboard
  useEffect(() => {
    if (isAuthenticated) {
      const storedUser = JSON.parse(localStorage.getItem('user'));
      if (storedUser?.role === 'DRIVER') navigate('/driver');
      else if (storedUser?.role === 'PROVIDER') navigate('/provider');
      else if (storedUser?.role === 'ADMIN') navigate('/admin');
    }
  }, [isAuthenticated, navigate]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const validatePassword = (password) => {
    if (password.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    return null;
  };

  const finalizeLogin = (userData) => {
    login(userData);
    
    // Remember me support
    if (rememberMe) {
      localStorage.setItem('rememberedEmail', userData.email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }

    if (userData.role === 'DRIVER') navigate('/driver');
    else if (userData.role === 'PROVIDER') navigate('/provider');
    else if (userData.role === 'ADMIN') navigate('/admin');
  };

  const handleAuth = async (e) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (viewMode === 'login') {
        const res = await api.post('/auth/login', {
          email: formData.email,
          password: formData.password
        });
        finalizeLogin(res.data);
      } else if (viewMode === 'register') {
        const passError = validatePassword(formData.password);
        if (passError) {
          setErrorMsg(passError);
          setIsLoading(false);
          return;
        }

        const payload = {
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          role
        };

        if (role === 'PROVIDER') {
          payload.phone = formData.phone;
          payload.businessName = formData.businessName;
          payload.governmentId = formData.governmentId;
          payload.propertyProof = formData.propertyProof;
          payload.bankAccount = formData.bankAccount;
          payload.upiId = formData.upiId;
          payload.gstNumber = formData.gstNumber;
          payload.termsAccepted = formData.termsAccepted;
        }

        const res = await api.post('/auth/register', payload);
        finalizeLogin(res.data);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!formData.email) return;
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.post('/auth/forgot-password', { email: formData.email });
      setSuccessMsg(res.data.message);
      if (res.data.dummyToken) {
        console.log("Mock reset token for testing:", res.data.dummyToken);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!formData.email || !resetToken || !formData.newPassword) return;
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const passError = validatePassword(formData.newPassword);
    if (passError) {
      setErrorMsg(passError);
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.post('/auth/reset-password', {
        email: formData.email,
        token: resetToken,
        newPassword: formData.newPassword
      });
      setSuccessMsg(res.data.message);
      setTimeout(() => {
        setViewMode('login');
        setFormData({ fullName: '', email: '', password: '', newPassword: '' });
        setResetToken('');
      }, 3000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Reset failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = "form-input pl-11 pr-11 py-3.5";

  return (
    <div className="flex justify-center items-center min-h-[75vh]">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card w-full max-w-md p-8 sm:p-10">

        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold mb-2">
            {viewMode === 'forgot' ? "Forgot Password" : (
              viewMode === 'reset' ? "Reset Password" : (
                viewMode === 'login' ? t('auth.welcomeBack') : "Create Account"
              )
            )}
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
             {viewMode === 'forgot' ? "Enter your email to receive a reset link" : (
               viewMode === 'reset' ? `Resetting for ${formData.email}` : "Access your smart parking buddy"
             )}
          </p>
        </div>

        {errorMsg && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm mb-4 border border-red-200 dark:border-red-800">{errorMsg}</div>}
        {successMsg && <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 p-3 rounded-xl text-sm mb-4 border border-emerald-200 dark:border-emerald-800">{successMsg}</div>}

        <AnimatePresence mode="wait">
          {viewMode === 'forgot' ? (
            <motion.form key="forgot" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1 text-gray-500 uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={inputClass} placeholder="you@example.com" required />
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="w-full btn-primary py-4 text-lg font-bold shadow-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => setViewMode('login')} className="w-full py-2 text-gray-500 text-sm hover:underline">Back to Login</button>
            </motion.form>
          ) : viewMode === 'reset' ? (
            <motion.form key="reset" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1 text-gray-500 uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    name="newPassword" 
                    value={formData.newPassword} 
                    onChange={handleInputChange} 
                    className={inputClass} 
                    placeholder="••••••••" 
                    required 
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="w-full btn-primary py-4 text-lg font-bold shadow-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Reset Password'}
              </button>
              <button type="button" onClick={() => setViewMode('login')} className="w-full py-2 text-gray-500 text-sm hover:underline">Cancel</button>
            </motion.form>
          ) : (
            <motion.form key="auth" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} onSubmit={viewMode === 'register' && role === 'PROVIDER' ? (e) => { e.preventDefault(); if (regStep < 3) setRegStep(regStep + 1); else handleAuth(); } : handleAuth} className="space-y-4">
              {viewMode === 'register' && (
                <div className="flex bg-gray-150 dark:bg-gray-800 p-1 rounded-xl mb-4">
                  <button type="button" onClick={() => setRole('DRIVER')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold transition ${role === 'DRIVER' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600' : 'text-gray-500'}`}>
                    <Car className="w-4 h-4" /> Driver
                  </button>
                  <button type="button" onClick={() => setRole('PROVIDER')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold transition ${role === 'PROVIDER' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600' : 'text-gray-500'}`}>
                    <Building2 className="w-4 h-4" /> Provider
                  </button>
                </div>
              )}

              {viewMode === 'register' && role === 'PROVIDER' ? (
                // Multi-step Provider Registration
                <div className="space-y-4 text-left">
                  {/* Progress Indicator */}
                  <div className="flex justify-between items-center mb-6">
                    {[1, 2, 3].map(step => (
                      <div key={step} className="flex items-center flex-1 last:flex-none">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${regStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                          {step}
                        </div>
                        {step < 3 && (
                          <div className={`flex-1 h-1 mx-2 ${regStep > step ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}></div>
                        )}
                      </div>
                    ))}
                  </div>

                  {regStep === 1 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">Full Name</label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input type="text" name="fullName" value={formData.fullName} onChange={handleInputChange} className={inputClass} placeholder="John Doe" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={inputClass} placeholder="you@example.com" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">Mobile Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className={inputClass} placeholder="e.g. +91 9876543210" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input 
                            type={showPassword ? "text" : "password"} 
                            name="password" 
                            value={formData.password} 
                            onChange={handleInputChange} 
                            className={inputClass} 
                            placeholder="••••••••" 
                            required 
                          />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => {
                          if (!formData.fullName || !formData.email || !formData.password || !formData.phone) {
                            setErrorMsg('Please fill in all Step 1 fields.');
                            return;
                          }
                          const passErr = validatePassword(formData.password);
                          if (passErr) {
                            setErrorMsg(passErr);
                            return;
                          }
                          setErrorMsg('');
                          setRegStep(2);
                        }} 
                        className="w-full btn-primary py-4 text-base font-bold flex items-center justify-center gap-1 mt-2"
                      >
                        Next Step <ArrowRight className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}

                  {regStep === 2 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">Business Name</label>
                        <div className="relative">
                          <Building2 className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input type="text" name="businessName" value={formData.businessName} onChange={handleInputChange} className={inputClass} placeholder="e.g. Downtown Garages Ltd" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">Government ID (Aadhaar / PAN / DL)</label>
                        <div className="relative">
                          <ShieldCheck className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input type="text" name="governmentId" value={formData.governmentId} onChange={handleInputChange} className={inputClass} placeholder="e.g. Aadhaar 1234-5678-9012" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">Property Ownership / Lease Proof Link</label>
                        <div className="relative">
                          <FileText className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input type="text" name="propertyProof" value={formData.propertyProof} onChange={handleInputChange} className={inputClass} placeholder="e.g. http://localhost/lease.pdf" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">GST Number (Optional)</label>
                        <div className="relative">
                          <Landmark className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input type="text" name="gstNumber" value={formData.gstNumber} onChange={handleInputChange} className={inputClass} placeholder="e.g. 07AAAAA1111A1Z1" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setRegStep(1)} className="flex-1 btn-secondary py-4 text-base font-bold">Back</button>
                        <button 
                          type="button" 
                          onClick={() => {
                            if (!formData.businessName || !formData.governmentId || !formData.propertyProof) {
                              setErrorMsg('Please fill in all required Step 2 fields.');
                              return;
                            }
                            setErrorMsg('');
                            setRegStep(3);
                          }} 
                          className="flex-1 btn-primary py-4 text-base font-bold"
                        >
                          Next Step
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {regStep === 3 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">Payout Bank Account Details</label>
                        <div className="relative">
                          <Landmark className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input type="text" name="bankAccount" value={formData.bankAccount} onChange={handleInputChange} className={inputClass} placeholder="e.g. HDFC 50100293811" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-gray-550 uppercase tracking-wider">UPI ID</label>
                        <div className="relative">
                          <Smartphone className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                          <input type="text" name="upiId" value={formData.upiId} onChange={handleInputChange} className={inputClass} placeholder="e.g. company@upi" required />
                        </div>
                      </div>
                      <div className="pt-2">
                        <label className="flex items-center gap-3 cursor-pointer text-sm text-gray-600 dark:text-gray-400">
                          <input type="checkbox" name="termsAccepted" checked={formData.termsAccepted} onChange={handleInputChange} className="w-4.5 h-4.5 rounded text-blue-600 focus:ring-blue-500 bg-transparent" required />
                          <span>I accept the Terms and Conditions.</span>
                        </label>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setRegStep(2)} className="flex-1 btn-secondary py-4 text-base font-bold">Back</button>
                        <button type="submit" disabled={isLoading} className="flex-1 btn-primary py-4 text-base font-bold flex items-center justify-center gap-2">
                          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Join Now'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              ) : (
                // Standard Driver Registration or Login
                <>
                  {viewMode === 'register' && (
                    <div>
                      <label className="block text-sm font-bold mb-1 text-gray-500 uppercase tracking-wider">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                        <input type="text" name="fullName" value={formData.fullName} onChange={handleInputChange} className={inputClass} placeholder="John Doe" required />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold mb-1 text-gray-500 uppercase tracking-wider">{t('auth.email')}</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                      <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={inputClass} placeholder="you@example.com" required />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider">{t('auth.password')}</label>
                      {viewMode === 'login' && (
                        <button type="button" onClick={() => setViewMode('forgot')} className="text-xs text-blue-500 font-bold hover:underline">Forgot?</button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                      <input 
                        type={showPassword ? "text" : "password"} 
                        name="password" 
                        value={formData.password} 
                        onChange={handleInputChange} 
                        className={inputClass} 
                        placeholder="••••••••" 
                        required 
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {viewMode === 'login' && (
                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={rememberMe} 
                          onChange={(e) => setRememberMe(e.target.checked)} 
                          className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 w-4 h-4 bg-transparent" 
                        />
                        Remember me
                      </label>
                    </div>
                  )}

                  <button type="submit" disabled={isLoading} className="w-full btn-primary py-4 text-lg font-bold shadow-xl disabled:opacity-50 flex items-center justify-center gap-2">
                    {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (viewMode === 'login' ? t('auth.signIn') : 'Join Now')}
                  </button>
                </>
              )}

              <div className="mt-6 text-center text-sm">
                {viewMode === 'login' ? (
                  <p className="text-gray-400 font-medium">Don't have an account? <button type="button" onClick={() => setViewMode('register')} className="text-blue-500 font-bold hover:underline">Sign up here</button></p>
                ) : (
                  <p className="text-gray-400 font-medium">Already have an account? <button type="button" onClick={() => setViewMode('login')} className="text-blue-500 font-bold hover:underline">Log in here</button></p>
                )}
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default Login;
