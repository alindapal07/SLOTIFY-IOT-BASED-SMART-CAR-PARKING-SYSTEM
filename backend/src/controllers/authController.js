const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const config = require('../config/environment');
const { inngest } = require('../inngest/client');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

const JWT_SECRET = config.jwt.secret || process.env.JWT_SECRET || 'supersecret_ai_parking_key_12345';
const JWT_REFRESH_SECRET = config.jwt.refreshSecret || process.env.JWT_REFRESH_SECRET || 'supersecret_refresh_ai_parking_key_67890';

// Helper: Generate JWT access and refresh tokens
const generateTokens = (user) => {
  const id = user._id || user.id;
  const role = user.role || 'DRIVER';

  const accessToken = jwt.sign(
    { id, role },
    JWT_SECRET,
    { expiresIn: '15m', algorithm: 'HS256' }
  );

  const refreshToken = jwt.sign(
    { id, role },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  );

  return { accessToken, refreshToken };
};

// Helper: Set secure httpOnly cookies for access and refresh tokens
const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

// Helper: Validate password strength (at least 8 chars, 1 uppercase, 1 lowercase, 1 number)
const isStrongPassword = (password) => {
  if (typeof password !== 'string') return false;
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length >= minLength && hasUppercase && hasLowercase && hasNumber;
};

// Helper: SHA-256 hash for reset tokens
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// @desc    Register a new user
// @route   POST /api/v1/auth/register
// @access  Public
exports.registerUser = async (req, res) => {
  try {
    const { 
      fullName, email, password, role, 
      phone, businessName, governmentId, propertyProof, 
      bankAccount, upiId, gstNumber, termsAccepted 
    } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Please provide full name, email, and password.' });
    }

    if (role === 'PROVIDER') {
      if (!phone || !businessName || !governmentId || !propertyProof || !bankAccount || !upiId) {
        return res.status(400).json({ message: 'All provider verification fields are required.' });
      }
      if (!termsAccepted) {
        return res.status(400).json({ message: 'You must accept the terms and conditions.' });
      }
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, and one number.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    // Hash password with salt rounds 10
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Validate role (do not allow arbitrary roles)
    const allowedRegistrationRoles = ['DRIVER', 'PROVIDER'];
    const assignedRole = allowedRegistrationRoles.includes(role) ? role : 'DRIVER';

    // Create User
    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: assignedRole,
      status: assignedRole === 'PROVIDER' ? 'PENDING_APPROVAL' : 'ACTIVE',
      phone: phone || '',
      businessName: businessName || '',
      governmentId: governmentId || '',
      propertyProof: propertyProof || '',
      bankAccount: bankAccount || '',
      upiId: upiId || '',
      gstNumber: gstNumber || '',
      termsAccepted: !!termsAccepted,
      submittedDocuments: assignedRole === 'PROVIDER' && propertyProof ? [propertyProof] : [],
      submittedDate: assignedRole === 'PROVIDER' ? new Date() : null
    });

    // Create a Wallet for the User
    const wallet = await Wallet.create({
      ownerId: user._id,
      ownerType: user.role === 'PROVIDER' ? 'Provider' : 'User',
      balance: user.role === 'PROVIDER' ? 0 : 10000
    });

    user.walletId = wallet._id;

    // Generate tokens and record session
    const { accessToken, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    res.status(201).json({
      _id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      isPremium: user.isPremium,
      walletBalance: wallet.balance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
};

// @desc    Authenticate User & get cookies
// @route   POST /api/v1/auth/login
// @access  Public
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).populate('walletId');

    if (!user || user.isGoogleAccount || !user.password) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (user.status === 'BLOCKED') {
      return res.status(403).json({ message: 'Access denied. Your account is blocked.' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ message: 'Access denied. Your account is suspended.' });
    }

    // Generate tokens, store active refresh token, and set httpOnly cookies
    const { accessToken, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      _id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      isPremium: user.isPremium,
      walletBalance: user.walletId?.balance || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

// @desc    Authenticate Google Login user & get cookies
// @route   POST /api/v1/auth/google-login
// @access  Public
exports.googleLogin = async (req, res) => {
  try {
    const { credential, email, fullName, googleId } = req.body;
    let userEmail = email;
    let userName = fullName;
    let userGoogleId = googleId;

    if (credential) {
      const decoded = jwt.decode(credential);
      if (decoded) {
        userEmail = decoded.email;
        userName = decoded.name || `${decoded.given_name || ''} ${decoded.family_name || ''}`.trim();
        userGoogleId = decoded.sub;
      }
    }

    if (!userEmail || !userGoogleId) {
      return res.status(400).json({ message: 'Invalid Google login data.' });
    }

    let user = await User.findOne({ email: userEmail.toLowerCase().trim() }).populate('walletId');

    if (!user) {
      user = await User.create({
        fullName: userName || 'Google User',
        email: userEmail.toLowerCase().trim(),
        googleId: userGoogleId,
        isGoogleAccount: true,
        role: 'DRIVER'
      });

      const wallet = await Wallet.create({
        ownerId: user._id,
        ownerType: 'User',
        balance: 10000
      });

      user.walletId = wallet._id;
      await user.save();
    } else {
      if (!user.googleId) {
        user.googleId = userGoogleId;
        user.isGoogleAccount = true;
        await user.save();
      }
    }

    if (user.status === 'BLOCKED') {
      return res.status(403).json({ message: 'Access denied. Your account is blocked.' });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      _id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      isPremium: user.isPremium,
      walletBalance: user.walletId?.balance || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during Google login', error: error.message });
  }
};

// @desc    Generate password reset token
// @route   POST /api/v1/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Please provide an email address.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Avoid user enumeration: return success message regardless
      return res.json({ message: 'If that email exists, a password reset link has been sent.' });
    }

    // Generate secure random token and store its hash in DB
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = hashToken(rawToken);
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration
    await user.save();

    // Trigger background email dispatch via Inngest
    try {
      await inngest.send({
        name: "auth.send_reset",
        data: { email: user.email, token: rawToken }
      });
    } catch (e) {
      // In development fallback: call emailService directly if Inngest is offline
      try {
        await emailService.sendResetLink(user.email, rawToken);
      } catch (mailErr) {
        console.warn('Password reset email dispatch note:', mailErr.message);
      }
    }

    res.json({
      message: 'Password reset link sent to your email.',
      ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawToken } : {})
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Reset password using token
// @route   POST /api/v1/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ message: 'Please provide email, token, and new password.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, and one number.'
      });
    }

    const tokenHash = hashToken(token);

    // Support both hashed token check and raw token for backwards compatibility
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      $or: [
        { resetPasswordToken: tokenHash },
        { resetPasswordToken: token }
      ],
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired password reset token.' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    // Revoke all existing sessions on password reset
    user.refreshToken = null;
    await user.save();

    res.json({ message: 'Password reset successful. You can now login with your new password.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during password reset', error: error.message });
  }
};

// @desc    Rotate and refresh JWT access token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
exports.refreshToken = async (req, res) => {
  try {
    const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!incomingToken) {
      return res.status(401).json({ message: 'Session expired. Please login again.', code: 'NO_TOKEN' });
    }

    let decoded;
    try {
      decoded = jwt.verify(incomingToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    } catch (e) {
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ message: 'Session expired. Please login again.', code: 'INVALID_TOKEN' });
    }

    const user = await User.findById(decoded.id).populate('walletId');

    // Revocation check: stored refreshToken in DB must match incoming token
    if (!user || !user.refreshToken || user.refreshToken !== incomingToken) {
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(401).json({ message: 'Session has been revoked or expired. Please login again.', code: 'REVOKED_TOKEN' });
    }

    if (user.status === 'BLOCKED' || user.status === 'SUSPENDED') {
      res.clearCookie('accessToken', { path: '/' });
      res.clearCookie('refreshToken', { path: '/' });
      return res.status(403).json({ message: 'Access denied. Account is not active.' });
    }

    // Token Rotation: generate fresh pair
    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({
      _id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isPremium: user.isPremium,
      walletBalance: user.walletId?.balance || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during token refresh', error: error.message });
  }
};

// @desc    Logout user, revoke refresh token and clear cookies
// @route   POST /api/v1/auth/logout
// @access  Public
exports.logoutUser = async (req, res) => {
  try {
    const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (incomingToken) {
      await User.findOneAndUpdate({ refreshToken: incomingToken }, { refreshToken: null });
    } else if (req.user?._id) {
      await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    }

    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });

    res.json({ message: 'Logout successful. Session revoked.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during logout', error: error.message });
  }
};

// @desc    Upgrade to Premium
// @route   POST /api/v1/auth/upgrade
// @access  Private
exports.upgradeToPremium = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isPremium = true;
    await user.save();

    res.json({ message: 'Congratulations! You are now a Premium user.', isPremium: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get user profile details
// @route   GET /api/v1/auth/me
// @access  Private
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password').populate('walletId');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update user profile details (prevents unauthorized role or password manipulation)
// @route   PUT /api/v1/auth/profile
// @access  Private
exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { fullName, phone, profilePhoto, savedAddresses, emergencyContact, preferredLanguage, preferredTheme } = req.body;

    if (fullName) user.fullName = fullName.trim();
    if (phone !== undefined) user.phone = phone;
    if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;
    if (savedAddresses !== undefined) user.savedAddresses = savedAddresses;
    if (emergencyContact !== undefined) user.emergencyContact = emergencyContact;
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (preferredTheme) user.preferredTheme = preferredTheme;

    await user.save();
    res.json(await User.findById(user._id).select('-password'));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Change User Password
// @route   PUT /api/v1/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide current password and new password.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Verify current password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password does not match.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: 'New password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, and one number.'
      });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({ message: 'New password cannot be the same as your old password.' });
    }

    // Hash & save new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Invalidate existing sessions across other devices
    const tokens = generateTokens(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
