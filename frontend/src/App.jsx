import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store/useStore';
import api from './services/api';

// Main Layouts
import Navbar from './components/layout/Navbar';
import BottomNav from './components/layout/BottomNav';

// Public Pages
import LandingPage from './pages/public/LandingPage';
import Login from './pages/public/Login';
import MarketplacePage from './pages/public/Marketplace';

// Protected Pages (Drivers)
import DriverDashboard from './pages/driver/Dashboard';
import ParkingMap from './pages/driver/ParkingMap';
import WalletPage from './pages/driver/Wallet';
import VehicleManager from './pages/driver/Vehicle';
import AIInsights from './pages/driver/AIInsights';
import ProfilePage from './pages/driver/Profile';
import BookingConfirmation from './pages/driver/BookingConfirmation';

// Protected Pages (Providers)
import ProviderDashboard from './pages/provider/Dashboard';

// Protected Pages (Admin)
import AdminDashboard from './pages/admin/Dashboard';
import AdminLogin from './pages/admin/Login';

function App() {
  const { theme, login } = useStore();

  useEffect(() => {
    // Apply theme on load
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Silently refresh and sync user details on mount to stabilize session
  useEffect(() => {
    const verifySession = async () => {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const { data } = await api.get('/auth/me');
          login(data);
        } catch (err) {
          console.error('Session verification failed on mount:', err);
        }
      }
    };
    verifySession();
  }, [login]);

  // Quick Protected Route Wrapper
  const ProtectedRoute = ({ children, allowedRoles }) => {
    const { isAuthenticated, user } = useStore();
    
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    
    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      return <Navigate to="/" replace />;
    }
    
    return children;
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 dark:bg-parking-dark text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <Navbar />
        
        <main className="container mx-auto px-4 py-8 pb-24 sm:pb-8">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/marketplace" element={<MarketplacePage />} />

            {/* Admin Login */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Driver Routes */}
            <Route path="/driver" element={
              <ProtectedRoute allowedRoles={['DRIVER', 'ADMIN']}>
                <DriverDashboard />
              </ProtectedRoute>
            } />
            <Route path="/driver/wallet" element={
              <ProtectedRoute allowedRoles={['DRIVER', 'PROVIDER', 'ADMIN']}>
                <WalletPage />
              </ProtectedRoute>
            } />
            <Route path="/driver/vehicles" element={
              <ProtectedRoute allowedRoles={['DRIVER', 'ADMIN']}>
                <VehicleManager />
              </ProtectedRoute>
            } />
            <Route path="/driver/profile" element={
              <ProtectedRoute allowedRoles={['DRIVER', 'PROVIDER', 'ADMIN']}>
                <ProfilePage />
              </ProtectedRoute>
            } />
            <Route path="/driver/booking-confirmation/:bookingId" element={
              <ProtectedRoute allowedRoles={['DRIVER', 'ADMIN']}>
                <BookingConfirmation />
              </ProtectedRoute>
            } />
            <Route path="/map" element={
              <ProtectedRoute allowedRoles={['DRIVER', 'ADMIN']}>
                <ParkingMap />
              </ProtectedRoute>
            } />
            <Route path="/driver/ai" element={
              <ProtectedRoute allowedRoles={['DRIVER', 'ADMIN']}>
                <AIInsights />
              </ProtectedRoute>
            } />

            {/* Provider Routes */}
            <Route path="/provider" element={
              <ProtectedRoute allowedRoles={['PROVIDER', 'ADMIN']}>
                <ProviderDashboard />
              </ProtectedRoute>
            } />

            {/* Admin Routes */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </Router>
  );
}

export default App;
