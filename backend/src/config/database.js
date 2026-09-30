/**
 * Production Database Connection Module
 * Handles MongoDB Atlas connection, retry logic, spatial index synchronization,
 * connection event logging, and graceful shutdown.
 */
const mongoose = require('mongoose');
const dns = require('dns');
const config = require('./environment');

// Ensure reliable DNS resolution for MongoDB Atlas SRV records
dns.setServers(['8.8.8.8', '1.1.1.1']);

let isConnected = false;
let retryTimeout = null;

const connectDB = async () => {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = config.mongodb.uri;
  if (!uri) {
    console.error('❌ MongoDB Connection Error: MONGODB_URI is not defined in environment variables.');
    return;
  }

  try {
    const conn = await mongoose.connect(uri);
    isConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Explicitly sync spatial indexes to prevent GeoSearch query planner errors
    try {
      const ParkingZone = require('../models/ParkingZone');
      await ParkingZone.createIndexes();
    } catch (idxErr) {
      console.warn('⚠️ Spatial index sync note:', idxErr.message);
    }

    return conn;
  } catch (error) {
    isConnected = false;
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    
    // Auto-retry connection after 5 seconds
    if (!retryTimeout) {
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        connectDB();
      }, 5000);
    }
  }
};

// Monitor connection events
mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('⚠️ MongoDB connection lost. Reconnecting...');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  console.log('✅ MongoDB connection re-established.');
});

// Graceful application shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Closing MongoDB connection gracefully...`);
  if (retryTimeout) clearTimeout(retryTimeout);
  try {
    await mongoose.connection.close(false);
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error during database disconnect:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = connectDB;
