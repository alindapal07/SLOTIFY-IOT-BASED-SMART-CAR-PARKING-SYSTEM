import { create } from 'zustand';

export const useStore = create((set) => ({
  // Theme state
  theme: localStorage.getItem('theme') || 'dark',
  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return { theme: newTheme };
  }),

  // Auth state (passwords and JWT tokens are handled in secure httpOnly cookies, never in localStorage)
  user: JSON.parse(localStorage.getItem('user')) || null, // { _id, fullName, role, walletBalance }
  isAuthenticated: !!localStorage.getItem('user'),
  
  login: (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    set({ isAuthenticated: true, user: userData });
  },
  
  logout: () => {
    localStorage.removeItem('user');
    set({ isAuthenticated: false, user: null });
  },
  
  // Wallet Updates
  updateWalletBalance: (newBalance) => set((state) => {
    if (state.user?.walletBalance === newBalance) return state;
    const updatedUser = state.user ? { ...state.user, walletBalance: newBalance } : null;
    if (updatedUser) localStorage.setItem('user', JSON.stringify(updatedUser));
    return { user: updatedUser };
  })
}));

// Listen to session expiration events from the API interceptor
if (typeof window !== 'undefined') {
  window.addEventListener('auth_session_expired', () => {
    useStore.getState().logout();
  });
}
