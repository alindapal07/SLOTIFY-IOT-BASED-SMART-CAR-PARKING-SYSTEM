const User = require('../models/User');
const Wallet = require('../models/Wallet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { inngest } = require('../inngest/client');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

// Helper: Generate JWT access and refresh tokens
const generateTokens = (id) => {
  const accessToken = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret', { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// Helper: Set cookies for access and refresh tokens
const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// Helper: Validate password strength (at least 8 chars, 1 uppercase, 1 number)
const isStrongPassword = (password) => {
  const minLength = 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length >= minLength && hasUppercase && hasNumber;
};

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
      return res.status(400).json({ message: 'Please fill in all fields.' });
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
        message: 'Password must be at least 8 characters long, contain at least one uppercase letter, and one number.'
      });
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create User
    const user = await User.create({
      fullName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || 'DRIVER',
      status: role === 'PROVIDER' ? 'PENDING_APPROVAL' : 'ACTIVE',
      phone: phone || '',
      businessName: businessName || '',
      governmentId: governmentId || '',
      propertyProof: propertyProof || '',
      bankAccount: bankAccount || '',
      upiId: upiId || '',
      gstNumber: gstNumber || '',
      termsAccepted: !!termsAccepted,
      submittedDocuments: role === 'PROVIDER' && propertyProof ? [propertyProof] : [],
      submittedDate: role === 'PROVIDER' ? new Date() : null
    });

    // Create a Wallet for the User with 10000 demo INR (payouts go here)
    const wallet = await Wallet.create({
      ownerId: user._id,
      ownerType: user.role === 'PROVIDER' ? 'Provider' : 'User',
      balance: user.role === 'PROVIDER' ? 0 : 10000,
    });

    user.walletId = wallet._id;
    await user.save();

    // Trigger registration notification and email for provider
    if (role === 'PROVIDER') {
      await notificationService.sendNotification(
        req.app,
        user._id,
        'Documents Submitted',
        `Welcome to AIPark AI! Your provider registration details and documents have been successfully submitted for verification.`,
        'INFO'
      );
      
      // Send welcoming/docs submitted email
      await emailService.sendProviderStatusEmail(
        user.email,
        user.fullName,
        'UNDER_REVIEW',
        '',
        'Your registration is successfully received and pending verification checks.'
      );
    }

    // Generate tokens and set cookies
    const { accessToken, refreshToken } = generateTokens(user._id);
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
    res.status(500).json({ message: 'Server error', error: error.message });
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

    const user = await User.findOne({ email: email.toLowerCase() }).populate('walletId');

    if (!user || user.isGoogleAccount) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (user.status === 'BLOCKED') {
      return res.status(403).json({ message: 'Access denied. Your account is blocked.' });
    }

    // Generate tokens and set cookies
    const { accessToken, refreshToken } = generateTokens(user._id);
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
    res.status(500).json({ message: 'Server error', error: error.message });
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
      // Decode JWT token from Google
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

    let user = await User.findOne({ email: userEmail.toLowerCase() }).populate('walletId');

    if (!user) {
      // Create user
      user = await User.create({
        fullName: userName || 'Google User',
        email: userEmail.toLowerCase(),
        googleId: userGoogleId,
        isGoogleAccount: true,
        role: 'DRIVER'
      });

      // Create wallet
      const wallet = await Wallet.create({
        ownerId: user._id,
        ownerType: 'User',
        balance: 10000
      });

      user.walletId = wallet._id;
      await user.save();
    } else {
      // Update google parameters if missing
      if (!user.googleId) {
        user.googleId = userGoogleId;
        user.isGoogleAccount = true;
        await user.save();
      }
    }

    if (user.status === 'BLOCKED') {
      return res.status(403).json({ message: 'Access denied. Your account is blocked.' });
    }

    // Generate tokens and set cookies
    const { accessToken, refreshToken } = generateTokens(user._id);
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
    res.status(500).json({ message: 'Server error', error: error.message });
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

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Avoid user enumeration
      return res.json({ message: 'If that email exists, a password reset link has been sent.' });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration
    await user.save();

    // Trigger Inngest background event
    try {
      await inngest.send({
        name: "auth.send_reset",
        data: { email: user.email, token }
      });
    } catch (e) {
      console.error("Failed to trigger Inngest event:", e.message);
    }

    res.json({
      message: 'Password reset link sent to your email.',
      dummyToken: token // Provided for development and verification
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
      return res.status(400).json({ message: 'Please fill in all fields.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long, contain at least one uppercase letter, and one number.'
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired password reset token.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password reset successful. You can now login.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Rotate and refresh JWT access token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
exports.refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: 'Session expired. Please login again.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret');
    } catch (e) {
      return res.status(401).json({ message: 'Session expired. Please login again.' });
    }

    const user = await User.findById(decoded.id).populate('walletId');
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Session expired. Please login again.' });
    }

    if (user.status === 'BLOCKED') {
      return res.status(403).json({ message: 'Access denied. Account is blocked.' });
    }

    // Rotate tokens
    const tokens = generateTokens(user._id);
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Logout user and clear cookies
// @route   POST /api/v1/auth/logout
// @access  Public
exports.logoutUser = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await User.findOneAndUpdate({ refreshToken }, { refreshToken: null });
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({ message: 'Logout successful.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    const user = await User.findById(req.user._id).populate('walletId');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update user profile details
// @route   PUT /api/v1/auth/profile
// @access  Private
exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { fullName, phone, profilePhoto, savedAddresses, emergencyContact, preferredLanguage, preferredTheme } = req.body;

    if (fullName) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;
    if (savedAddresses !== undefined) user.savedAddresses = savedAddresses;
    if (emergencyContact !== undefined) user.emergencyContact = emergencyContact;
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (preferredTheme) user.preferredTheme = preferredTheme;

    await user.save();
    res.json(user);
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
      return res.status(400).json({ message: 'Please provide old and new passwords.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect old password.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: 'New password must be at least 8 characters long, contain at least one uppercase letter, and one number.'
      });
    }

    // Hash & save new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
