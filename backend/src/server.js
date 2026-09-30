/**
 * Application Server Entrypoint
 * Binds HTTP server, Socket.IO real-time channels, database connection,
 * and background watchdog jobs.
 */
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config/environment');
const connectDB = require('./config/database');
const app = require('./app');
const ioEvents = require('./sockets/ioEvents');
const { startWatchdogJobs } = require('./jobs/watchdogJobs');
const { getLocalIpAddress } = require('./utils/network');

const LAN_IP = getLocalIpAddress();

// Create HTTP Server
const server = http.createServer(app);

// Initialize Socket.io Server
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all for development, restrict in production
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

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

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(`Local API: http://localhost:${PORT}`);
  console.log(`Network API: http://${LAN_IP}:${PORT}`);
});

module.exports = { server, app, io };
