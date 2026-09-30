const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Explicitly sync spatial indexes to prevent GeoSearch query planner errors
    const ParkingZone = require('../models/ParkingZone');
    await ParkingZone.createIndexes().catch(err => {
      console.warn('⚠️  Failed to create 2dsphere index:', err.message);
    });
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Retry after 5 seconds instead of crashing the process
    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;
