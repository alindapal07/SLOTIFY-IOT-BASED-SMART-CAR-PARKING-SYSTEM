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

// Deducts funds from user wallet and records a transaction
exports.deductBalance = async (userId, amount, category, description, bookingId) => {
  const wallet = await Wallet.findOne({ ownerId: userId });
  if (!wallet) throw new Error('Wallet not found');
  if (wallet.balance < amount) throw new Error(`Insufficient balance. Need ₹${amount}, have ₹${wallet.balance}`);

  wallet.balance -= amount;
  await wallet.save();

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

// Credits funds to user/provider wallet and records a transaction
exports.creditBalance = async (userId, amount, category, description, bookingId) => {
  let wallet = await Wallet.findOne({ ownerId: userId });
  if (!wallet) {
    // If no wallet exists (e.g. mock setups), auto-create one
    wallet = await Wallet.create({
      ownerId: userId,
      ownerType: 'Provider',
      balance: 0
    });
  }

  wallet.balance += amount;
  await wallet.save();

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
