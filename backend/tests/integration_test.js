/**
 * End-to-End Integration Verification Test Suite
 * Tests:
 * 1. Health check (GET /)
 * 2. Authentication (Login with seeded driver account)
 * 3. Profile fetching with JWT Cookie (GET /api/v1/auth/me)
 * 4. Parking Zones API (GET /api/v1/parking/zones/all)
 * 5. Parking Zone Geo-search (GET /api/v1/parking/search?lat=22.4398&lng=88.4339)
 * 6. Bookings API (GET /api/v1/bookings/my)
 * 7. Wallet API (GET /api/v1/wallet)
 * 8. IoT Device Heartbeat Endpoint (POST /api/v1/esp/heartbeat)
 * 9. WebSocket Connection & Room Join Test
 */

const http = require('http');
let ioClient;
try {
  ioClient = require('socket.io-client');
} catch (e) {
  ioClient = require('../../frontend/node_modules/socket.io-client');
}
const { io } = ioClient;

const BASE_URL = 'http://127.0.0.1:5000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch(e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING MONOLITHIC BACKEND INTEGRATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`Testing: ${name.padEnd(45)}... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log(`❌ FAIL (${err.message})`);
      failed++;
    }
  }

  // 1. Health Check
  await test('Server Health Check (GET /)', async () => {
    const res = await request('GET', '/');
    if (res.status !== 200 || !res.data.includes('AI Smart Parking Backend is Running')) {
      throw new Error(`Unexpected response: status ${res.status}`);
    }
  });

  // 2. Authentication Login
  let cookieHeader = '';
  let userId = null;
  let token = null;

  await test('Driver Login (POST /api/v1/auth/login)', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: 'driver@smartparking.in',
      password: 'driver123'
    });
    if (res.status !== 200 || !res.data._id) {
      throw new Error(`Login failed with status ${res.status}: ${JSON.stringify(res.data)}`);
    }
    userId = res.data._id;
    if (res.headers['set-cookie']) {
      const cookieArray = res.headers['set-cookie'];
      // Extract cookies like accessToken=...; refreshToken=...
      const cookies = cookieArray.map(c => c.split(';')[0]).join('; ');
      cookieHeader = cookies;

      const match = cookies.match(/accessToken=([^;]+)/);
      if (match) token = match[1];
    }
  });

  const authHeaders = {
    'Cookie': cookieHeader,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  // 3. User Profile
  await test('Get User Profile (GET /api/v1/auth/me)', async () => {
    const res = await request('GET', '/api/v1/auth/me', null, authHeaders);
    if (res.status !== 200 || !res.data || res.data.role !== 'DRIVER') {
      throw new Error(`Expected DRIVER profile, got status ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  // 4. Parking Zones
  let zoneId = null;
  await test('Fetch Parking Zones (GET /zones/all)', async () => {
    const res = await request('GET', '/api/v1/parking/zones/all');
    if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
      throw new Error(`Expected array of zones, got status ${res.status}`);
    }
    zoneId = res.data[0]._id;
  });

  // 5. Parking Zone Geo-Search
  await test('Parking Zone Geo-Search (GET /search)', async () => {
    const res = await request('GET', '/api/v1/parking/search?lat=22.4398&lng=88.4339&radius=25');
    if (res.status !== 200 || !Array.isArray(res.data)) {
      throw new Error(`Expected array from search, got status ${res.status}`);
    }
  });

  // 6. User Bookings
  await test('Fetch My Bookings (GET /api/v1/bookings/my)', async () => {
    const res = await request('GET', '/api/v1/bookings/my', null, authHeaders);
    if (res.status !== 200 || !Array.isArray(res.data)) {
      throw new Error(`Expected array of bookings, got status ${res.status}`);
    }
  });

  // 7. Wallet API
  await test('Fetch Wallet Details (GET /api/v1/wallet)', async () => {
    const res = await request('GET', '/api/v1/wallet', null, authHeaders);
    if (res.status !== 200 || typeof res.data.balance !== 'number') {
      throw new Error(`Expected numeric balance, got status ${res.status}`);
    }
  });

  // 8. IoT Device Heartbeat Endpoint (ESP32)
  await test('ESP32 Heartbeat (POST /api/v1/esp/heartbeat)', async () => {
    const res = await request('POST', '/api/v1/esp/heartbeat', {
      deviceId: 'DEV-DE9E2FEE',
      deviceToken: 'b2b5acb7bbf80e2f8e4f9fb71f28fb255e8c367133adfbfc'
    });
    // Valid endpoint response (200 if active, 401 if unregistered)
    if (res.status !== 200 && res.status !== 401) {
      throw new Error(`Unexpected status code: ${res.status}`);
    }
  });

  // 9. WebSocket Integration
  await test('WebSocket Real-Time Connection & Rooms', async () => {
    return new Promise((resolve, reject) => {
      const socket = io(BASE_URL, { timeout: 4000 });
      socket.on('connect', () => {
        socket.emit('JOIN_USER_ROOM', userId);
        socket.emit('JOIN_ZONE_ROOM', zoneId);
        setTimeout(() => {
          socket.disconnect();
          resolve();
        }, 800);
      });
      socket.on('connect_error', (err) => {
        reject(new Error(`WebSocket connection failed: ${err.message}`));
      });
    });
  });

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
