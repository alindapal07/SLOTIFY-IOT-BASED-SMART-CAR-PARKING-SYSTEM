const express = require('express');
const router = express.Router();
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/authMiddleware');

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

// @desc    Get wallet transaction history
// @route   GET /api/v1/wallet/transactions
// @access  Private
router.get('/transactions', protect, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ ownerId: req.user._id });
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

    const transactions = await Transaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Top up wallet balance
// @route   POST /api/v1/wallet/topup
// @access  Private
router.post('/topup', protect, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });

    const wallet = await Wallet.findOne({ ownerId: req.user._id });
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

    wallet.balance += amount;
    await wallet.save();

    await Transaction.create({
      walletId: wallet._id,
      userId: req.user._id,
      type: 'credit',
      category: 'topup',
      amount,
      description: `Wallet top-up of ₹${amount}`,
      balanceAfter: wallet.balance
    });

    res.json({ message: 'Top up successful', balance: wallet.balance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
