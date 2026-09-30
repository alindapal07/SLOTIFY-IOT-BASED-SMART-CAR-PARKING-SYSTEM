import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { Home, Map, Wallet, CarFront, Briefcase, Brain } from 'lucide-react';

const BottomNav = () => {
  const { isAuthenticated, user } = useStore();
  const location = useLocation();

  if (!isAuthenticated) return null;

  const isActive = (path) => {
    return location.pathname === path ? 'text-parking-primary dark:text-blue-400' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100';
  };

  return (
    <div className="sm:hidden fixed bottom-0 left-0 z-50 w-full h-16 bg-white dark:bg-parking-card border-t border-gray-200 dark:border-gray-800 flex justify-around items-center px-2 pb-safe shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
      {user?.role === 'DRIVER' && (
        <>
          <Link to="/driver" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive('/driver')}`}>
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium">Home</span>
          </Link>
          <Link to="/map" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive('/map')}`}>
            <Map className="w-5 h-5" />
            <span className="text-[10px] font-medium">Map</span>
          </Link>
          <Link to="/driver/ai" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive('/driver/ai')}`}>
            <Brain className="w-5 h-5" />
            <span className="text-[10px] font-medium">AI Intelligence</span>
          </Link>
          <Link to="/driver/wallet" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive('/driver/wallet')}`}>
            <Wallet className="w-5 h-5" />
            <span className="text-[10px] font-medium">Wallet</span>
          </Link>
          <Link to="/driver/vehicles" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive('/driver/vehicles')}`}>
            <CarFront className="w-5 h-5" />
            <span className="text-[10px] font-medium">Vehicles</span>
          </Link>
        </>
      )}

      {user?.role === 'PROVIDER' && (
        <>
          <Link to="/provider" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive('/provider')}`}>
            <Briefcase className="w-5 h-5" />
            <span className="text-[10px] font-medium">Zones</span>
          </Link>
          <Link to="/driver/wallet" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive('/driver/wallet')}`}>
            <Wallet className="w-5 h-5" />
            <span className="text-[10px] font-medium">Earnings</span>
          </Link>
        </>
      )}

      {user?.role === 'ADMIN' && (
        <Link to="/admin" className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive('/admin')}`}>
          <Briefcase className="w-5 h-5" />
          <span className="text-[10px] font-medium">Admin</span>
        </Link>
      )}
    </div>
  );
};

export default BottomNav;
