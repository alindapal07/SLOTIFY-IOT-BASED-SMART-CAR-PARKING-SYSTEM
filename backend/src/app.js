/**
 * Express Application Configuration
 * Encapsulates middleware, CORS policy, cookie parsing, route definitions,
 * and centralized error handling.
 */
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { serve } = require('inngest/express');
const config = require('./config/environment');
const { inngest, functions } = require('./inngest/client');
const errorHandler = require('./middleware/errorHandler');
const { getLocalIpAddress } = require('./utils/network');
const { isRedisActive } = require('./config/redis');

const LAN_IP = getLocalIpAddress();

const app = express();

// High-throughput HTTP payload compression (skips payloads < 1KB)
app.use(compression({ threshold: 1024 }));

// Custom cookie parser middleware (preserves existing token extraction behavior)
const cookieParser = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  const list = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  req.cookies = list;
  next();
};

// CORS configuration (supports localhost, local network IP, and configured FRONTEND_URL)
const allowedOrigins = [
  config.frontendUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://${LAN_IP}:5173`,
  `http://${LAN_IP}:5000`
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith(`http://${LAN_IP}:`);
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(cookieParser);
app.use(express.json());

// Basic root endpoint
app.get('/', (req, res) => {
  res.send('AI Smart Parking Backend is Running');
});

// Liveness probe (Kubernetes / Load Balancer fast health check)
app.get('/liveness', (req, res) => {
  res.status(200).json({ status: 'alive', uptime: process.uptime() });
});

// Readiness probe (verifies database connectivity)
app.get('/readiness', (req, res) => {
  const mongoose = require('mongoose');
  const isDbReady = mongoose.connection.readyState === 1;
  if (isDbReady) {
    res.status(200).json({ status: 'ready', db: 'connected' });
  } else {
    res.status(503).json({ status: 'unready', db: 'disconnected' });
  }
});

// Comprehensive Health & System Telemetry Endpoint
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const mem = process.memoryUsage();
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    monolith: {
      pid: process.pid,
      nodeVersion: process.version,
      memory: {
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      }
    },
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: isRedisActive() ? 'connected' : 'in-memory-fallback'
    }
  });
});

// Inngest Event Processing Endpoint
app.use('/api/inngest', serve({ client: inngest, functions }));

// API Route Mounts (v1)
app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/parking', require('./routes/parkingRoutes'));
app.use('/api/v1/iot', require('./routes/iotRoutes')); // Handles IoT Connections (Human/Dashboard)
app.use('/api/v1/esp', require('./routes/espRoutes')); // ESP32 Device API (deviceAuth, no JWT)
app.use('/api/v1/bookings', require('./routes/bookingRoutes'));
app.use('/api/v1/wallet', require('./routes/walletRoutes'));
app.use('/api/v1/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/v1/admin', require('./routes/adminRoutes'));
app.use('/api/v1/ai', require('./routes/aiRoutes'));
app.use('/api/v1/feedback', require('./routes/feedbackRoutes'));
app.use('/api/v1/notifications', require('./routes/notificationRoutes'));
app.use('/api/v1/queue', require('./routes/queueRoutes'));
app.use('/api/v1/pdf', require('./routes/pdfRoutes'));

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
