require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

async function testConnection() {
  console.log('Testing MongoDB Connection...');
  console.log('URI:', process.env.MONGODB_URI.replace(/:([^:@]+)@/, ':****@')); // Hide password
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('SUCCESS: Connected to MongoDB.');
    process.exit(0);
  } catch (err) {
    console.error('FAILURE: Could not connect to MongoDB.');
    console.error('Error Name:', err.name);
    console.error('Error Message:', err.message);
    process.exit(1);
  }
}

testConnection();
