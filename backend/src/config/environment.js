/**
 * Centralized Environment Configuration
 * Validates and exposes typed environment variables for the application.
 */
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT, 10) || 5000,
  host: process.env.HOST || '0.0.0.0',
  serverUrl: process.env.SERVER_URL || 'http://localhost:5000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  
  // Database
  mongodb: {
    uri: process.env.MONGODB_URI
  },
  
  // Authentication & Cryptography
  jwt: {
    secret: process.env.JWT_SECRET || 'supersecret_ai_parking_key_12345',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'supersecret_refresh_ai_parking_key_67890',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  qrSecret: process.env.QR_SECRET || '9d7a1f6b8c2e4f5a3b6d1c9e0f7a8b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a',
  
  // Email Service
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    inngestEmail: process.env.INNGEST_EMAIL
  },
  
  // Inngest
  inngest: {
    eventKey: process.env.INNGEST_EVENT_KEY
  }
});

// Validate critical variables
if (!config.mongodb.uri) {
  console.warn('⚠️ WARNING: MONGODB_URI is not set in environment.');
}

module.exports = config;
