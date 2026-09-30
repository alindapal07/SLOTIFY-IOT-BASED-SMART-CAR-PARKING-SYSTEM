// createAdmin.js – script to ensure a default admin user exists
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartparking';

async function createAdmin() {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');
    const email = 'admin123@gmail.com';
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      console.log('Admin user already exists');
      process.exit(0);
    }
    const password = 'admin123';
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    const admin = await User.create({
      fullName: 'Admin User',
      email: email.toLowerCase(),
      password: hashed,
      role: 'ADMIN',
      status: 'ACTIVE',
      isPremium: false,
    });
    console.log('Admin user created:', admin.email);
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin user:', err);
    process.exit(1);
  }
}

createAdmin();
