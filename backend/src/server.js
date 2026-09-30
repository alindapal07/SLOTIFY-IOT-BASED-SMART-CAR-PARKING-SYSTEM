/**
 * Application Server Entrypoint
 * Binds HTTP server, Socket.IO real-time channels, database connection,
 * and background watchdog jobs.
 */
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const config = require('./config/environment');
const connectDB = require('./config/database');
const app = require('./app');
const ioEvents = require('./sockets/ioEvents');
const { startWatchdogJobs, stopWatchdogJobs } = require('./jobs/watchdogJobs');
const { getLocalIpAddress } = require('./utils/network');
const { getPubClient, getSubClient, isRedisActive } = require('./config/redis');

const LAN_IP = getLocalIpAddress();

// Create HTTP Server
const server = http.createServer(app);

// Optimize HTTP server socket management for high-concurrency monolith
server.keepAliveTimeout = 65000; // 65 seconds (exceeds AWS ALB / NGINX 60s idle timeout)
server.headersTimeout = 66000;   // 66 seconds (must be > keepAliveTimeout)
server.requestTimeout = 30000;   // 30 seconds request processing timeout
server.maxHeadersCount = 100;

// Initialize Socket.io Server with scale-tuned settings
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all for development, restrict in production
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  maxHttpBufferSize: 1e6, // 1MB payload ceiling
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Attach Redis Adapter for multi-instance horizontal scaling if Redis is connected
let redisAdapterAttached = false;
const pubClient = getPubClient();
const subClient = getSubClient();

function tryAttachRedisAdapter() {
  if (redisAdapterAttached) return;
  if (pubClient && subClient && isRedisActive()) {
    try {
      io.adapter(createAdapter(pubClient, subClient));
      redisAdapterAttached = true;
      console.log('✅ Socket.IO Redis Adapter attached for multi-instance horizontal scaling.');
    } catch (e) {
      console.warn('⚠️ Could not attach Socket.IO Redis Adapter:', e.message);
    }
  }
}

if (pubClient && subClient) {
  pubClient.on('connect', () => tryAttachRedisAdapter());
  tryAttachRedisAdapter();
}

// Setup global Socket.io instance for controllers and background services
app.set('io', io);

// Connect to MongoDB Atlas
connectDB();

// Setup WebSocket event handlers
ioEvents(io);

// Start IoT heartbeat watchdog (marks stale Online devices as Offline every 60s)
if (typeof ioEvents.startHeartbeatWatchdog === 'function') {
  ioEvents.startHeartbeatWatchdog(io);
  console.log('IoT Heartbeat Watchdog started.');
}

// Start Periodic Background Watchdog (No-shows, queue timeouts, late exits)
startWatchdogJobs(app, 30000);

// Start HTTP listening
const PORT = config.port;
const HOST = config.host;

// Graceful Shutdown Handler for SIGTERM/SIGINT
let isShuttingDown = false;
const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown of Monolith instance...`);

  // Stop periodic watchdog
  stopWatchdogJobs();

  // Stop accepting new HTTP requests
  server.close(async () => {
    console.log('✅ HTTP server closed to new connections.');
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close(false);
      console.log('✅ MongoDB connection gracefully closed.');
    } catch (e) {
      console.error('Error closing MongoDB connection:', e.message);
    }
    process.exit(0);
  });

  // Force shutdown if connections do not drain within 10 seconds
  setTimeout(() => {
    console.error('⚠️ Forcefully terminating active connections after 10s drain window.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle server errors gracefully (e.g. port already occupied)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use by another running process.`);
    console.error(`👉 Either stop the existing process running on port ${PORT}, or change PORT in your backend .env file.\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Local API: http://localhost:${PORT}`);
  console.log(`Network API: http://${LAN_IP}:${PORT}`);
});

module.exports = { server, app, io };
