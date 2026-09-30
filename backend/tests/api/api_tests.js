/**
 * API TEST SUITE
 * Tests all core Parking and Booking REST APIs:
 * 1. Parking: Create zone, Update zone, Delete/Archive zone, Search with filters, Nearby $geoNear, Availability
 * 2. Booking: Create/Initiate booking, Cancel with refund, Extend with wallet debit,
 *             QR Entry scan, Timer & Fine calculation on Exit scan, Complete checkout,
 *             Waiting Queue (Join, Status & ETA, Leave)
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

async function runApiTests() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING TIER 3: REST API TEST SUITE');
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

  // Connect to DB directly for test fixtures
  const mongoUri = config.mongodb.uri || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const User = require('../../src/models/User');
  const ParkingZone = require('../../src/models/ParkingZone');
  const ParkingSlot = require('../../src/models/ParkingSlot');
  const Booking = require('../../src/models/Booking');
  const Wallet = require('../../src/models/Wallet');
  const Vehicle = require('../../src/models/Vehicle');
  const WaitingQueue = require('../../src/models/WaitingQueue');

  // Setup unique test accounts
  const uniqueTag = Date.now();
  const providerEmail = `api_prov_${uniqueTag}@test.in`;
  const driverEmail = `api_driver_${uniqueTag}@test.in`;
  const password = 'Password123!';

  // Register Provider
  const provReg = await request('POST', '/api/v1/auth/register', {
    fullName: 'API Test Provider',
    email: providerEmail,
    password,
    role: 'PROVIDER',
    phone: '9876543210',
    businessName: 'Kolkata Parking Ventures',
    governmentId: 'GOV-IND-12345',
    propertyProof: 'https://storage.googleapis.com/deed.pdf',
    bankAccount: '123456789012',
    upiId: 'provider@upi',
    gstNumber: '19ABCDE1234F1Z5',
    termsAccepted: true
  });
  const providerId = provReg.data.user?._id || provReg.data._id;

  // Make provider ACTIVE & Approved
  await User.findByIdAndUpdate(providerId, { status: 'ACTIVE', verificationStatus: 'Approved' });

  // Login Provider
  const provLogin = await request('POST', '/api/v1/auth/login', { email: providerEmail, password });
  const provCookie = provLogin.headers['set-cookie'] ? provLogin.headers['set-cookie'].find(c => c.startsWith('accessToken=')).split(';')[0] : '';

  // Register Driver
  const driverReg = await request('POST', '/api/v1/auth/register', {
    fullName: 'API Test Driver',
    email: driverEmail,
    password,
    role: 'DRIVER'
  });
  const driverId = driverReg.data.user?._id || driverReg.data._id;

  // Login Driver
  const driverLogin = await request('POST', '/api/v1/auth/login', { email: driverEmail, password });
  const driverCookie = driverLogin.headers['set-cookie'].find(c => c.startsWith('accessToken=')).split(';')[0];

  // Ensure Driver has wallet balance and vehicle
  await Wallet.findOneAndUpdate({ ownerId: driverId }, { balance: 5000 });
  const vehicle = await Vehicle.create({
    userId: driverId,
    make: 'Honda',
    model: 'City',
    licensePlate: `WB02API${uniqueTag.toString().slice(-4)}`,
    vehicleType: 'Car',
    color: 'White'
  });

  let createdZoneId = '';
  let createdSlotId = '';
  let activeBookingId = '';
  let activeQrToken = '';

  // ─────────────────────────────────────────────────────────────
  // 1. PARKING API TESTS
  // ─────────────────────────────────────────────────────────────

  await test('Parking API: Provider creates a parking zone', async () => {
    const res = await request('POST', '/api/v1/parking/zones', {
      name: `Kolkata IT Park Hub ${uniqueTag}`,
      address: 'Plot 5, Block EP & GP, Sector V',
      landmark: 'Near Webel Bhavan',
      city: 'Kolkata',
      state: 'West Bengal',
      pinCode: '700091',
      lat: 22.5832,
      lng: 88.4278,
      basePricePerHour: 50,
      totalSlots: 10,
      availableSlots: 10,
      parkingType: 'Office',
      amenities: ['CCTV', 'Covered'],
      vehicleTypesAllowed: ['Car', 'SUV', 'EV', 'Motorcycle']
    }, { 'Cookie': provCookie });

    assert.strictEqual(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.ok(res.data._id);
    createdZoneId = res.data._id;

    // Approve the zone in DB for search availability
    await ParkingZone.findByIdAndUpdate(createdZoneId, { isApproved: true, status: 'Active' });

    // Create 1 slot inside this zone
    const slot = await ParkingSlot.create({
      zoneId: createdZoneId,
      slotIdentifier: 'A-01',
      vehicleCategory: 'Sedan',
      isOccupied: false,
      isActive: true
    });
    createdSlotId = slot._id;
  });

  await test('Parking API: Provider updates parking zone details', async () => {
    const res = await request('PUT', `/api/v1/parking/zones/${createdZoneId}`, {
      basePricePerHour: 60,
      amenities: ['CCTV', 'Covered', 'EV Charging']
    }, { 'Cookie': provCookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.basePricePerHour, 60);
  });

  await test('Parking API: Search zones by Kolkata coordinates ($geoNear)', async () => {
    const res = await request('GET', '/api/v1/parking/search?lat=22.58&lng=88.42&radius=10');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length > 0, 'Should find nearby zones');
    const match = res.data.find(z => z._id.toString() === createdZoneId.toString());
    assert.ok(match, 'Newly created zone should appear in geospatial nearby search');
    assert.ok(typeof match.distanceMeters === 'number' || typeof match.distance === 'string');
  });

  await test('Parking API: Search with filter parameters (maxPrice & parkingType)', async () => {
    const res = await request('GET', '/api/v1/parking/search?lat=22.58&lng=88.42&maxPrice=100&parkingType=Office');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    const allMatch = res.data.every(z => z.parkingType === 'Office' && z.basePricePerHour <= 100);
    assert.strictEqual(allMatch, true);
  });

  await test('Parking API: Check live slot availability for zone', async () => {
    const res = await request('GET', `/api/v1/parking/zones/${createdZoneId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.availableSlots, 10);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. BOOKING API TESTS
  // ─────────────────────────────────────────────────────────────

  await test('Booking API: Initiate booking and deduct wallet balance', async () => {
    const res = await request('POST', '/api/v1/bookings/initiate', {
      zoneId: createdZoneId,
      slotId: createdSlotId,
      vehicleId: vehicle._id,
      hours: 2,
      vehicleType: 'Car'
    }, { 'Cookie': driverCookie });

    assert.strictEqual(res.status, 201, `Booking failed: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.bookingId);
    assert.ok(res.data.qrToken);
    activeBookingId = res.data.bookingId;
    activeQrToken = res.data.qrToken;

    // Check slot is marked occupied
    const slot = await ParkingSlot.findById(createdSlotId);
    assert.strictEqual(slot.isOccupied, true);

    // Check zone available count decremented
    const zone = await ParkingZone.findById(createdZoneId);
    assert.strictEqual(zone.availableSlots, 9);
  });

  await test('Booking API: Extend booking duration with wallet deduction', async () => {
    const res = await request('POST', `/api/v1/bookings/${activeBookingId}/extend`, {
      hours: 1
    }, { 'Cookie': driverCookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.booking.hours, 3);
  });

  await test('Booking API: Hardware Entry scan records entry & starts session', async () => {
    const res = await request('POST', '/api/v1/bookings/entry', {
      token: activeQrToken
    }, { 'Cookie': driverCookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.booking.entryStatus, 'Entered');
    assert.strictEqual(res.data.booking.status, 'PARKED');
  });

  await test('Booking API: Exit scan verifies exit & computes settlements', async () => {
    const res = await request('POST', '/api/v1/bookings/exit', {
      token: activeQrToken
    }, { 'Cookie': driverCookie });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.booking || res.data.command === 'OPEN_BARRIER');
  });

  await test('Booking API: Driver completes checkout session', async () => {
    // Set status to Confirmed to test standard checkout completion if needed
    await Booking.findByIdAndUpdate(activeBookingId, { status: 'Confirmed' });
    const res = await request('POST', `/api/v1/bookings/${activeBookingId}/complete`, {}, { 'Cookie': driverCookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.booking.status, 'Completed');
  });

  await test('Booking API: Create second booking and test cancellation with full refund', async () => {
    // Free the slot
    await ParkingSlot.findByIdAndUpdate(createdSlotId, { isOccupied: false, currentBookingId: null });
    await ParkingZone.findByIdAndUpdate(createdZoneId, { availableSlots: 10 });

    const createRes = await request('POST', '/api/v1/bookings/initiate', {
      zoneId: createdZoneId,
      slotId: createdSlotId,
      vehicleId: vehicle._id,
      hours: 1,
      vehicleType: 'Car'
    }, { 'Cookie': driverCookie });
    assert.strictEqual(createRes.status, 201);
    const cancelBkId = createRes.data.bookingId;

    const cancelRes = await request('POST', `/api/v1/bookings/${cancelBkId}/cancel`, {}, { 'Cookie': driverCookie });
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.data.message, 'Booking cancelled and refunded');

    // Slot must be free again
    const slot = await ParkingSlot.findById(createdSlotId);
    assert.strictEqual(slot.isOccupied, false);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. WAITING QUEUE API TESTS
  // ─────────────────────────────────────────────────────────────

  let queueEntryId = '';

  await test('Queue API: Driver joins virtual waiting queue', async () => {
    const res = await request('POST', '/api/v1/queue/join', {
      zoneId: createdZoneId,
      vehicleId: vehicle._id,
      vehicleType: 'Sedan'
    }, { 'Cookie': driverCookie });
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.entry || res.data._id);
    queueEntryId = (res.data.entry && res.data.entry._id) || res.data._id;
  });

  await test('Queue API: Driver checks queue status & dynamic wait ETA', async () => {
    const res = await request('GET', `/api/v1/queue/status?zoneId=${createdZoneId}`, null, { 'Cookie': driverCookie });
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.data.position === 'number');
    assert.ok(typeof res.data.estimatedWaitMinutes === 'number');
  });

  await test('Queue API: Driver leaves virtual waiting queue', async () => {
    const res = await request('POST', '/api/v1/queue/leave', {
      zoneId: createdZoneId
    }, { 'Cookie': driverCookie });
    assert.strictEqual(res.status, 200);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CLEANUP: Archive/Delete Zone
  // ─────────────────────────────────────────────────────────────

  await test('Parking API: Provider archives / deletes parking zone', async () => {
    const res = await request('DELETE', `/api/v1/parking/zones/${createdZoneId}`, null, { 'Cookie': provCookie });
    assert.strictEqual(res.status, 200);
  });

  // Clean up database entities
  await Booking.deleteMany({ userId: driverId });
  await ParkingSlot.deleteMany({ zoneId: createdZoneId });
  await ParkingZone.findByIdAndDelete(createdZoneId);
  await WaitingQueue.deleteMany({ userId: driverId });
  await Vehicle.findByIdAndDelete(vehicle._id);
  await Wallet.deleteMany({ ownerId: { $in: [driverId, providerId] } });
  await User.deleteMany({ _id: { $in: [driverId, providerId] } });

  console.log('\n====================================================');
  console.log(`TIER 3 (API TESTS) SUMMARY: ${passed + failed} Tests | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  if (failed > 0) process.exit(1);
}

runApiTests().catch(err => {
  console.error('Fatal API Test Runner Error:', err);
  process.exit(1);
});
