/**
 * INTEGRATION TEST SUITE
 * Tests database schema integrity, indexes, relationships, and authentication session lifecycle:
 * 1. Database Model Validation & Schemas
 * 2. MongoDB 2dsphere and Compound Indexes
 * 3. Referential Integrity (User -> Wallet, Zone -> Provider, Slot -> Zone, Booking -> User/Slot)
 * 4. Authentication Full Lifecycle (Register -> Login -> /me -> Refresh -> Password Change -> Reset -> Logout -> Revocation)
 * 5. Multi-tier RBAC Authorization (Driver -> Driver OK, Provider/Admin 403 Forbidden)
 */

require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const assert = require('assert');
const config = require('../../src/config/environment');

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
        try { parsed = JSON.parse(data); } catch (e) {}
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

async function runIntegrationTests() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING TIER 2: INTEGRATION TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`Testing: ${name.padEnd(52)}... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log(`❌ FAIL (${err.message})`);
      failed++;
    }
  }

  // Connect to DB directly for schema/index inspection
  const mongoUri = config.mongodb.uri || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const User = require('../../src/models/User');
  const ParkingZone = require('../../src/models/ParkingZone');
  const ParkingSlot = require('../../src/models/ParkingSlot');
  const Booking = require('../../src/models/Booking');
  const Wallet = require('../../src/models/Wallet');
  const Transaction = require('../../src/models/Transaction');
  const Vehicle = require('../../src/models/Vehicle');
  const WaitingQueue = require('../../src/models/WaitingQueue');
  const IoTDevice = require('../../src/models/IoTDevice');

  // 1. Database Schema & Index Tests
  await test('DB: ParkingZone has valid 2dsphere spatial index', async () => {
    const indexes = await ParkingZone.collection.indexes();
    const has2dSphere = indexes.some(idx => idx.key && idx.key.location === '2dsphere');
    assert.strictEqual(has2dSphere, true, 'ParkingZone must have 2dsphere index on location');
  });

  await test('DB: ParkingSlot has compound zoneId & isOccupied index', async () => {
    const indexes = await ParkingSlot.collection.indexes();
    const hasSlotIdx = indexes.some(idx => idx.key && idx.key.zoneId === 1 && idx.key.isOccupied === 1);
    assert.strictEqual(hasSlotIdx, true, 'ParkingSlot must have compound zoneId & isOccupied index');
  });

  await test('DB: Transaction has compound walletId & createdAt index', async () => {
    const indexes = await Transaction.collection.indexes();
    const hasTxIdx = indexes.some(idx => idx.key && idx.key.walletId === 1 && idx.key.createdAt === -1);
    assert.strictEqual(hasTxIdx, true, 'Transaction must index walletId and createdAt');
  });

  await test('DB: Booking has compound userId & status index', async () => {
    const indexes = await Booking.collection.indexes();
    const hasBkIdx = indexes.some(idx => idx.key && idx.key.userId === 1 && idx.key.status === 1);
    assert.strictEqual(hasBkIdx, true, 'Booking must index userId and status');
  });

  // 2. Data Integrity & Relationships Tests
  await test('DB Integrity: Seeded driver has valid linked wallet', async () => {
    const driver = await User.findOne({ role: 'DRIVER', email: 'driver@smartparking.in' });
    assert.ok(driver, 'Driver account must exist');
    const wallet = await Wallet.findOne({ ownerId: driver._id });
    assert.ok(wallet, 'Driver must have a valid wallet document');
    assert.strictEqual(typeof wallet.balance, 'number');
    assert.ok(wallet.balance >= 0);
  });

  await test('DB Integrity: Parking slots belong to valid approved zones', async () => {
    const sampleSlot = await ParkingSlot.findOne({ isOccupied: false });
    assert.ok(sampleSlot, 'Free slot exists in database');
    const zone = await ParkingZone.findById(sampleSlot.zoneId);
    assert.ok(zone, 'Slot references a valid zone');
    assert.strictEqual(zone.isApproved, true);
  });

  // 3. Authentication & Session Lifecycle Tests (Using dedicated test user to avoid rate-limit locks)
  const uniqueId = Date.now();
  const testUserEmail = `integ_test_${uniqueId}@test.in`;
  const testPassword = 'Password123!';
  let authCookie = '';
  let refreshTokenCookie = '';
  let createdUserId = '';

  await test('Auth: Register new user with secure password', async () => {
    const res = await request('POST', '/api/v1/auth/register', {
      fullName: 'Integration Driver',
      email: testUserEmail,
      password: testPassword,
      role: 'DRIVER'
    });
    assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}`);
    assert.ok(res.data.user || res.data._id);
    createdUserId = (res.data.user && res.data.user._id) || res.data._id;
  });

  await test('Auth: Login and extract access & refresh cookies', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: testUserEmail,
      password: testPassword
    });
    assert.strictEqual(res.status, 200, `Login failed: ${JSON.stringify(res.data)}`);
    assert.ok(res.headers['set-cookie'], 'Response must set cookies');

    const cookies = res.headers['set-cookie'];
    const accMatch = cookies.find(c => c.startsWith('accessToken='));
    const refMatch = cookies.find(c => c.startsWith('refreshToken='));
    assert.ok(accMatch, 'accessToken cookie must be set');
    assert.ok(refMatch, 'refreshToken cookie must be set');

    authCookie = accMatch.split(';')[0];
    refreshTokenCookie = refMatch.split(';')[0];
  });

  await test('Auth: Fetch /auth/me with session cookie', async () => {
    const res = await request('GET', '/api/v1/auth/me', null, { 'Cookie': authCookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.email, testUserEmail);
    assert.strictEqual(res.data.role, 'DRIVER');
  });

  await test('Auth: Rotate refresh token (/auth/refresh-token)', async () => {
    const res = await request('POST', '/api/v1/auth/refresh-token', {}, { 'Cookie': refreshTokenCookie });
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['set-cookie'], 'Must set rotated cookies');
    const newCookies = res.headers['set-cookie'];
    const newAcc = newCookies.find(c => c.startsWith('accessToken='));
    assert.ok(newAcc);
    authCookie = newAcc.split(';')[0];
  });

  await test('Auth: Change user password (/auth/change-password)', async () => {
    const newPassword = 'NewPassword456!';
    const res = await request('PUT', '/api/v1/auth/change-password', {
      oldPassword: testPassword,
      newPassword
    }, { 'Cookie': authCookie });
    assert.strictEqual(res.status, 200, `Change password failed: ${JSON.stringify(res.data)}`);

    // Verify old password fails
    const failLogin = await request('POST', '/api/v1/auth/login', {
      email: testUserEmail,
      password: testPassword
    });
    assert.strictEqual(failLogin.status, 401);

    // Login with new password
    const okLogin = await request('POST', '/api/v1/auth/login', {
      email: testUserEmail,
      password: newPassword
    });
    assert.strictEqual(okLogin.status, 200);
    authCookie = okLogin.headers['set-cookie'].find(c => c.startsWith('accessToken=')).split(';')[0];
  });

  await test('Auth: Password reset token generation & completion', async () => {
    // 1. Forgot password
    const forgotRes = await request('POST', '/api/v1/auth/forgot-password', {
      email: testUserEmail
    });
    assert.strictEqual(forgotRes.status, 200);
    const rawToken = forgotRes.data?.resetToken;
    assert.ok(rawToken, 'Should receive resetToken in dev mode');

    // 2. Reset password using token
    const resetRes = await request('POST', '/api/v1/auth/reset-password', {
      email: testUserEmail,
      token: rawToken,
      newPassword: 'ResetPassword789!'
    });
    assert.strictEqual(resetRes.status, 200, `Reset failed: ${JSON.stringify(resetRes.data)}`);

    // Login with reset password
    const loginRes = await request('POST', '/api/v1/auth/login', {
      email: testUserEmail,
      password: 'ResetPassword789!'
    });
    assert.strictEqual(loginRes.status, 200);
    authCookie = loginRes.headers['set-cookie'].find(c => c.startsWith('accessToken=')).split(';')[0];
  });

  await test('Auth: Logout and session revocation', async () => {
    const res = await request('POST', '/api/v1/auth/logout', {}, { 'Cookie': authCookie });
    assert.strictEqual(res.status, 200);
    const expiredCookies = res.headers['set-cookie'];
    assert.ok(expiredCookies.some(c => c.includes('accessToken=;') || c.includes('Expires=') || c.includes('Max-Age=0')));
  });

  // 4. Role Authorization Isolation Tests
  let activeDriverCookie = '';

  await test('RBAC: Driver access to Driver API is permitted', async () => {
    // Log back in to get active session
    const login = await request('POST', '/api/v1/auth/login', {
      email: testUserEmail,
      password: 'ResetPassword789!'
    });
    assert.strictEqual(login.status, 200, `Login failed: ${JSON.stringify(login.data)}`);
    assert.ok(login.headers['set-cookie']);
    activeDriverCookie = login.headers['set-cookie'].find(c => c.startsWith('accessToken=')).split(';')[0];
    const res = await request('GET', '/api/v1/bookings/my', null, { 'Cookie': activeDriverCookie });
    assert.strictEqual(res.status, 200);
  });

  await test('RBAC: Driver forbidden from Provider API (403)', async () => {
    const res = await request('GET', '/api/v1/parking/provider/stats', null, { 'Cookie': activeDriverCookie });
    assert.strictEqual(res.status, 403);
  });

  await test('RBAC: Driver forbidden from Admin API (403)', async () => {
    const res = await request('GET', '/api/v1/admin/stats', null, { 'Cookie': activeDriverCookie });
    assert.strictEqual(res.status, 403);
  });

  // Clean up temporary integration user & wallet
  await User.findByIdAndDelete(createdUserId);
  await Wallet.findOneAndDelete({ ownerId: createdUserId });

  console.log('\n====================================================');
  console.log(`TIER 2 (INTEGRATION TESTS) SUMMARY: ${passed + failed} Tests | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  if (failed > 0) process.exit(1);
}

runIntegrationTests().catch(err => {
  console.error('Fatal Integration Test Runner Error:', err);
  process.exit(1);
});
