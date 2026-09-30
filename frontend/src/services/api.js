import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  withCredentials: true, // Send secure httpOnly cookies in cross-origin requests
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor to handle token expiration (401 errors) and perform a silent refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check if unauthorized, and not already retrying (prevents infinite loop)
    if (
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry &&
      originalRequest.url !== '/auth/login' &&
      originalRequest.url !== '/auth/refresh-token'
    ) {
      originalRequest._retry = true;
      try {
        // Attempt to rotate tokens via refresh token cookie
        const refreshUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/auth/refresh-token`;
        await axios.post(refreshUrl, {}, { withCredentials: true });
        // Retry the original API call
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh token is invalid/expired as well, force logout
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth_session_expired'));
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
