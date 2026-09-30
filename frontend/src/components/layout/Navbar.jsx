import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../i18n/index.jsx';
import {
  Moon,
  Sun,
  LogOut,
  Wallet,
  Menu,
  X,
  Globe,
  Bell,
  Sparkles,
  ChevronDown,
  LayoutDashboard,
  UserRound,
  Building2,
  ShieldCheck
} from 'lucide-react';
import api from '../../services/api';

const Navbar = () => {
  const { theme, toggleTheme, isAuthenticated, user, logout } = useStore();
  const { t, lang, switchLang, languageNames } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const role = user?.role;

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Failed to log out from server:', e);
    }
    localStorage.removeItem('rememberedEmail');
    logout();
    navigate('/');
  };

  const handleMenuClick = (to) => {
    setMobileOpen(false);
    setAccountOpen(false);
    if (to.startsWith('/#')) {
      navigate('/');
      setTimeout(() => {
        const id = to.substring(2);
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      navigate(to);
    }
  };

  // Primary nav links, scoped to what each audience actually needs.
  // Guests see the full marketing surface; signed-in users see only
  // the working tools relevant to their role.
  const getPrimaryLinks = () => {
    if (!isAuthenticated) {
      return [
        { label: 'Marketplace', to: '/marketplace' },
        { label: 'Live Map', to: '/map' },
        { label: 'List My Space', to: '/provider' },
        { label: 'How It Works', to: '/#how-it-works' },
        { label: 'For Business', to: '/#for-business' },
        { label: 'Pricing', to: '/#pricing' },
        { label: 'About', to: '/#about' }
      ];
    }
    if (role === 'PROVIDER') {
      return [{ label: 'Live Map', to: '/map' }];
    }
    if (role === 'ADMIN') {
      return [{ label: 'Live Map', to: '/map' }];
    }
    // DRIVER (default authenticated role)
    return [
      { label: 'Marketplace', to: '/marketplace' },
      { label: 'Live Map', to: '/map' }
    ];
  };

  const primaryLinks = getPrimaryLinks();

  // Items that live inside the account dropdown (desktop) / account
  // section (mobile), scoped per role so nobody sees links that don't apply.
  const getAccountItems = () => {
    if (role === 'PROVIDER') {
      return [{ label: 'My Lots', to: '/provider', icon: Building2 }];
    }
    if (role === 'ADMIN') {
      return [{ label: 'Admin Console', to: '/admin', icon: ShieldCheck }];
    }
    return [
      { label: 'Dashboard', to: '/driver', icon: LayoutDashboard },
      { label: 'Profile', to: '/driver/profile', icon: UserRound }
    ];
  };

  const accountItems = getAccountItems();

  const initials = (user?.name || user?.email || 'U')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const walletBalance = (user?.walletBalance ?? 10000).toLocaleString();

  return (
    <nav className="sticky top-0 z-50 w-full bg-white dark:bg-parking-card border-b border-asphalt-200 dark:border-asphalt-800/80 px-4 sm:px-6 py-3 flex justify-between items-center transition-colors shadow-sm">
      {/* Brand */}
      <Link
  to="/"
  className="flex items-center gap-3 group shrink-0 transition-all duration-300"
>
  <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-800 shadow-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center overflow-hidden group-hover:scale-105 group-hover:shadow-xl transition-all duration-300">
    <img
      src="https://i.pinimg.com/1200x/5f/17/ef/5f17ef896d4c14e35d11bb296697c958.jpg"
      alt="Slotify Logo"
      className="w-8 h-8 object-contain"
    />
  </div>

  <div className="flex flex-col leading-none">
    <span className="text-xl font-extrabold tracking-tight text-asphalt-900 dark:text-white group-hover:text-parking-primary transition-colors">
      Slotify
    </span>
    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-widest uppercase">
      Smart Parking
    </span>
  </div>
</Link>

      {/* Center nav (desktop) */}
      <div className="hidden lg:flex items-center gap-6">
        {primaryLinks.map((item, idx) => (
          <button
            key={idx}
            onClick={() => handleMenuClick(item.to)}
            className="text-xs font-bold uppercase tracking-wider text-asphalt-600 dark:text-asphalt-300 hover:text-parking-primary transition-colors"
          >
            {item.label}
          </button>
        ))}

        {/* AI models entry point */}
        <button
          onClick={() => handleMenuClick('/driver/ai')}
          className="flex items-center gap-1.5 pl-3 pr-3.5 py-1.5 rounded-lg border border-parking-primary/25 text-parking-primary hover:bg-parking-primary/5 transition-colors text-xs font-bold uppercase tracking-wider"
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI
        </button>
      </div>

      {/* Right side controls (desktop) */}
      <div className="hidden sm:flex items-center gap-2.5">
        {/* Language */}
        <div className="relative">
          <button
            onClick={() => { setLangOpen(!langOpen); setNotifOpen(false); setAccountOpen(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-asphalt-200 dark:border-asphalt-800 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-900 transition-colors text-xs font-bold uppercase tracking-wider text-asphalt-600 dark:text-asphalt-400"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{languageNames[lang]}</span>
          </button>
          {langOpen && (
            <div className="absolute right-0 mt-2 bg-white dark:bg-parking-card rounded-lg shadow-soft border border-asphalt-200 dark:border-asphalt-800 py-1 min-w-[145px] z-50">
              {Object.entries(languageNames).map(([code, name]) => (
                <button
                  key={code}
                  onClick={() => { switchLang(code); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-asphalt-50 dark:hover:bg-asphalt-900 transition-colors ${lang === code ? 'text-parking-primary font-bold' : 'text-asphalt-700 dark:text-asphalt-300'}`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme */}
        <button
          onClick={toggleTheme}
          className="p-2 border border-asphalt-200 dark:border-asphalt-800 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-900 transition-colors text-asphalt-600 dark:text-asphalt-400"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setLangOpen(false); setAccountOpen(false); }}
            className="p-2 border border-asphalt-200 dark:border-asphalt-800 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-900 transition-colors text-asphalt-600 dark:text-asphalt-400 relative"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-parking-primary rounded-full"></span>
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-2 bg-white dark:bg-parking-card rounded-lg shadow-soft border border-asphalt-200 dark:border-asphalt-800 py-3 px-4 min-w-[270px] z-50 text-xs space-y-2.5">
              <div className="flex justify-between items-center border-b border-asphalt-100 dark:border-asphalt-800 pb-1.5">
                <span className="font-bold text-asphalt-850 dark:text-white uppercase tracking-wider text-[10px]">
                  Notifications
                </span>
                <button onClick={() => setNotifOpen(false)} className="text-[10px] text-parking-primary hover:underline">
                  Clear all
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-asphalt-600 dark:text-asphalt-350 leading-relaxed">
                  <span className="font-bold text-parking-primary">System update:</span> Real-time occupancy tracking engine active.
                </p>
                <p className="text-asphalt-600 dark:text-asphalt-350 leading-relaxed">
                  <span className="font-bold text-parking-accent">Welcome!</span> Browse parking lots on the map tab.
                </p>
              </div>
            </div>
          )}
        </div>

        {isAuthenticated ? (
          <>
            {/* Wallet */}
            <Link
              to="/driver/wallet"
              className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 px-3 py-1.5 border border-green-200 dark:border-green-800/40 rounded-lg font-bold text-xs hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <Wallet className="w-3.5 h-3.5" /> ₹{walletBalance}
            </Link>

            {/* Account dropdown */}
            <div className="relative">
              <button
                onClick={() => { setAccountOpen(!accountOpen); setLangOpen(false); setNotifOpen(false); }}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 border border-asphalt-200 dark:border-asphalt-800 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-900 transition-colors"
              >
                <span className="w-6 h-6 rounded-full bg-asphalt-800 dark:bg-asphalt-700 text-white text-[10px] font-bold flex items-center justify-center">
                  {initials}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-asphalt-500 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
              </button>
              {accountOpen && (
                <div className="absolute right-0 mt-2 bg-white dark:bg-parking-card rounded-lg shadow-soft border border-asphalt-200 dark:border-asphalt-800 py-1.5 min-w-[190px] z-50">
                  <div className="px-3.5 py-2 border-b border-asphalt-100 dark:border-asphalt-800 mb-1">
                    <p className="text-xs font-bold text-asphalt-850 dark:text-white truncate">{user?.name || user?.email}</p>
                    <p className="text-[10px] uppercase tracking-wider text-asphalt-450 mt-0.5">{role?.toLowerCase()}</p>
                  </div>
                  {accountItems.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleMenuClick(item.to)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-asphalt-700 dark:text-asphalt-300 hover:bg-asphalt-50 dark:hover:bg-asphalt-900 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {item.label}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { setAccountOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-parking-danger hover:bg-asphalt-50 dark:hover:bg-asphalt-900 transition-colors mt-1 border-t border-asphalt-100 dark:border-asphalt-800 pt-2.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-asphalt-50 dark:bg-asphalt-900 text-asphalt-500 px-3 py-1.5 border border-asphalt-200 dark:border-asphalt-850 rounded-lg font-bold text-xs">
              <Wallet className="w-3.5 h-3.5 text-asphalt-400" /> ₹10,000
            </div>
            <Link to="/login" className="btn-secondary py-1.5 px-3.5 text-xs shadow-none border border-asphalt-250 dark:border-asphalt-800">
              {t('nav.login')}
            </Link>
            <Link to="/login?mode=register" className="btn-primary py-1.5 px-3.5 text-xs shadow-none">
              {t('nav.signup')}
            </Link>
            <button
              onClick={() => handleMenuClick('/admin/login')}
              className="text-[11px] font-bold uppercase tracking-wider text-asphalt-450 hover:text-parking-primary transition-colors pl-1"
            >
              Admin
            </button>
          </div>
        )}
      </div>

      {/* Mobile controls */}
      <div className="flex lg:hidden items-center gap-1.5">
        <button
          onClick={() => { setNotifOpen(!notifOpen); setMobileOpen(false); }}
          className="p-2 border border-asphalt-200 dark:border-asphalt-800 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-900 text-asphalt-600 dark:text-asphalt-400 relative"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-parking-primary rounded-full"></span>
        </button>

        <button
          onClick={toggleTheme}
          className="p-2 border border-asphalt-200 dark:border-asphalt-800 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-900 text-asphalt-600 dark:text-asphalt-400"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {isAuthenticated && (
          <div className="flex items-center gap-1 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 px-2 py-1.5 border border-green-200 dark:border-green-800/40 rounded-lg font-bold text-[10px]">
            ₹{walletBalance}
          </div>
        )}

        <button
          onClick={() => { setMobileOpen(!mobileOpen); setNotifOpen(false); }}
          className="p-2 border border-asphalt-200 dark:border-asphalt-800 rounded-lg hover:bg-asphalt-100 dark:hover:bg-asphalt-900 text-asphalt-600 dark:text-asphalt-400"
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobile notifications panel (mirrors desktop) */}
      {notifOpen && (
        <div className="absolute top-full right-4 mt-2 bg-white dark:bg-parking-card rounded-lg shadow-soft border border-asphalt-200 dark:border-asphalt-800 py-3 px-4 w-[270px] z-50 text-xs space-y-2.5 sm:hidden">
          <div className="flex justify-between items-center border-b border-asphalt-100 dark:border-asphalt-800 pb-1.5">
            <span className="font-bold text-asphalt-850 dark:text-white uppercase tracking-wider text-[10px]">Notifications</span>
            <button onClick={() => setNotifOpen(false)} className="text-[10px] text-parking-primary hover:underline">Clear all</button>
          </div>
          <div className="space-y-2">
            <p className="text-asphalt-600 dark:text-asphalt-350 leading-relaxed">
              <span className="font-bold text-parking-primary">System update:</span> Real-time occupancy tracking engine active.
            </p>
            <p className="text-asphalt-600 dark:text-asphalt-350 leading-relaxed">
              <span className="font-bold text-parking-accent">Welcome!</span> Browse parking lots on the map tab.
            </p>
          </div>
        </div>
      )}

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="absolute top-full left-0 w-full bg-white dark:bg-parking-card shadow-soft border-b border-asphalt-200 dark:border-asphalt-800 p-4 flex flex-col gap-1 lg:hidden z-50">
          {primaryLinks.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleMenuClick(item.to)}
              className="text-left text-sm font-bold uppercase tracking-wider text-asphalt-600 dark:text-asphalt-300 py-2"
            >
              {item.label}
            </button>
          ))}

          <button
            onClick={() => handleMenuClick('/driver/ai')}
            className="flex items-center gap-2 text-left text-sm font-bold uppercase tracking-wider text-parking-primary py-2"
          >
            <Sparkles className="w-4 h-4" /> AI
          </button>

          <hr className="border-asphalt-100 dark:border-asphalt-800 my-1" />

          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-2.5 py-2">
                <span className="w-7 h-7 rounded-full bg-asphalt-800 dark:bg-asphalt-700 text-white text-[11px] font-bold flex items-center justify-center">
                  {initials}
                </span>
                <div>
                  <p className="text-xs font-bold text-asphalt-850 dark:text-white truncate">{user?.name || user?.email}</p>
                  <p className="text-[10px] uppercase tracking-wider text-asphalt-450">{role?.toLowerCase()}</p>
                </div>
              </div>
              {accountItems.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => handleMenuClick(item.to)}
                    className="flex items-center gap-2.5 text-left text-sm font-bold uppercase tracking-wider text-asphalt-600 dark:text-asphalt-300 py-2"
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
              <button
                onClick={() => { setMobileOpen(false); handleLogout(); }}
                className="flex items-center gap-2.5 text-left text-sm font-bold uppercase tracking-wider text-parking-danger py-2"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <Link to="/login" onClick={() => setMobileOpen(false)} className="btn-secondary py-2 text-center text-xs shadow-none border border-asphalt-250 dark:border-asphalt-800">
                Login
              </Link>
              <Link to="/login?mode=register" onClick={() => setMobileOpen(false)} className="btn-primary py-2 text-center text-xs shadow-none">
                Sign Up
              </Link>
              <button
                onClick={() => handleMenuClick('/admin/login')}
                className="text-center text-[11px] font-bold uppercase tracking-wider text-asphalt-450 py-1.5"
              >
                Admin Portal
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;