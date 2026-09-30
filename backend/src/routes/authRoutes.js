const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  googleLogin,
  forgotPassword,
  resetPassword,
  logoutUser,
  refreshToken,
  upgradeToPremium,
  getUserProfile,
  updateUserProfile,
  changePassword
} = require('../controllers/authController');
const { protect, authRateLimiter, loginRateLimiter } = require('../middleware/authMiddleware');

// Apply IP rate limiting to all authentication-related endpoints
router.use(authRateLimiter);

router.post('/register', registerUser);
router.post('/login', loginRateLimiter, loginUser);
router.post('/google-login', googleLogin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout', logoutUser);
router.post('/refresh-token', refreshToken);

// Premium Upgrade Route (needs credentials authorization check)
router.post('/upgrade', protect, upgradeToPremium);

// Driver Profile Routes
router.get('/me', protect, getUserProfile);
router.get('/me/status', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id)
      .select('status verificationStatus rejectionReason adminRemarks reviewedAt verificationChecks role businessName')
      .populate('reviewedBy', 'fullName');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});
router.put('/profile', protect, updateUserProfile);
router.put('/change-password', protect, changePassword);

module.exports = router;
