const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

// Creates a transaction entry in the ledger
exports.createTransaction = async ({ walletId, userId, type, category, amount, description, balanceAfter, bookingId }) => {
  return Transaction.create({
    walletId,
    userId,
    type,
    category,
    amount,
    description,
    balanceAfter,
    relatedBookingId: bookingId || null
  });
};

// Deducts funds from user wallet using atomic conditional updates (Race-Condition Proof)
exports.deductBalance = async (userId, amount, category, description, bookingId) => {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Deduction amount must be a positive number.');
  }

  // Atomic conditional decrement: balance MUST be >= amount
  const wallet = await Wallet.findOneAndUpdate(
    { ownerId: userId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true }
  );

  if (!wallet) {
    const existingWallet = await Wallet.findOne({ ownerId: userId });
    if (!existingWallet) throw new Error('Wallet not found');
    throw new Error(`Insufficient balance. Need ₹${amount}, have ₹${existingWallet.balance}`);
  }

  const transaction = await exports.createTransaction({
    walletId: wallet._id,
    userId,
    type: 'debit',
    category,
    amount,
    description,
    balanceAfter: wallet.balance,
    bookingId
  });

  return { wallet, transaction };
};

// Credits funds to user/provider wallet using atomic updates (Race-Condition Proof)
exports.creditBalance = async (userId, amount, category, description, bookingId) => {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Credit amount must be a positive number.');
  }

  // Atomic increment with upsert fallback
  const wallet = await Wallet.findOneAndUpdate(
    { ownerId: userId },
    { $inc: { balance: amount } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const transaction = await exports.createTransaction({
    walletId: wallet._id,
    userId,
    type: 'credit',
    category,
    amount,
    description,
    balanceAfter: wallet.balance,
    bookingId
  });

  return { wallet, transaction };
};
