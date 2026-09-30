const express = require('express');
const router = express.Router();
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const walletService = require('../services/walletService');
const { protect } = require('../middleware/authMiddleware');
const idempotency = require('../middleware/idempotency');

// @desc    Get wallet balance and details
// @route   GET /api/v1/wallet
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ ownerId: req.user._id });
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Get wallet transaction history (with pagination)
// @route   GET /api/v1/wallet/transactions
// @access  Private
router.get('/transactions', protect, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ ownerId: req.user._id });
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find({ walletId: wallet._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments({ walletId: wallet._id })
    ]);
    
    // Return array by default for backward compatibility with frontend,
    // with pagination metadata headers
    res.setHeader('X-Total-Count', total);
    res.setHeader('X-Page', page);
    res.setHeader('X-Limit', limit);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Top up wallet balance (Atomic & Idempotent)
// @route   POST /api/v1/wallet/topup
// @access  Private
router.post('/topup', protect, idempotency(), async (req, res) => {
  try {
    const { amount } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount. Must be a positive number.' });
    }

    const { wallet } = await walletService.creditBalance(
      req.user._id,
      parsedAmount,
      'topup',
      `Wallet top-up of ₹${parsedAmount}`
    );

    res.json({ message: 'Top up successful', balance: wallet.balance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
