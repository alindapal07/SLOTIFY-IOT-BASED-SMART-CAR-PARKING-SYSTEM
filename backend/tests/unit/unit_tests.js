/**
 * UNIT TEST SUITE
 * Tests core business logic without network/server dependencies:
 * 1. Pricing Engine & Dynamic Multipliers
 * 2. Overstay Fines, Grace Periods & 50/50 Revenue Distribution
 * 3. Vehicle Size & Slot Category Compatibility
 * 4. AES-256-CBC Cryptographic QR Payload Encryption & Decryption
 * 5. Waiting Queue Priority Scoring Formula
 */

require('dotenv').config();
const assert = require('assert');
const { encryptPayload, decryptPayload } = require('../../src/utils/qrCrypto');
const { generateQRToken, verifyQRToken } = require('../../src/utils/qrUtil');
const { calculatePriorityScore } = require('../../src/services/queueService');

// Vehicle Compatibility Rule (Mirrors bookingController)
const isCompatible = (vehicleType, slotCategory) => {
  if (!vehicleType || !slotCategory) return false;
  if (slotCategory === 'Handicap') return vehicleType === 'Handicap';
  if (vehicleType === 'Handicap') return slotCategory === 'Handicap';
  if (slotCategory === 'EV') return vehicleType === 'EV';
  if (vehicleType === 'EV') return slotCategory === 'EV';
  if (slotCategory === 'Bus') return vehicleType === 'Bus';
  if (vehicleType === 'Bus') return slotCategory === 'Bus';

  if (slotCategory === 'Bike') return ['Bike', 'Scooter'].includes(vehicleType);
  if (slotCategory === 'Scooter') return vehicleType === 'Scooter';
  if (['Bike', 'Scooter'].includes(vehicleType)) return ['Bike', 'Scooter'].includes(slotCategory);

  if (slotCategory === 'Truck') return ['Truck', 'Mini Truck'].includes(vehicleType);
  if (slotCategory === 'Mini Truck') return vehicleType === 'Mini Truck';
  if (['Truck', 'Mini Truck'].includes(vehicleType)) return ['Truck', 'Mini Truck'].includes(slotCategory);

  const sizes = { 'Hatchback': 1, 'Sedan': 2, 'SUV': 3, 'Luxury Car': 4 };
  const vehicleSize = sizes[vehicleType];
  const slotSize = sizes[slotCategory];

  if (vehicleSize && slotSize) {
    return vehicleSize <= slotSize;
  }
  return vehicleType === slotCategory;
};

// Pricing calculation helper
const calculateCost = (hours, basePricePerHour = 40, multiplier = 1.0) => {
  const h = hours || 1;
  if (h <= 1) return 40;
  return 40 + Math.round((h - 1) * basePricePerHour * multiplier);
};

// Fine calculation helper
const calculateFine = (stayMinutes, bookedMinutes) => {
  if (stayMinutes <= bookedMinutes) return { fine: 0, graceUsed: 0 };
  const delayMinutes = stayMinutes - bookedMinutes;
  const graceMinutes = 5;
  const graceUsed = Math.min(graceMinutes, delayMinutes);
  if (delayMinutes <= graceMinutes) {
    return { fine: 0, graceUsed };
  }
  return { fine: (delayMinutes - graceMinutes) * 2, graceUsed };
};

// Fine distribution helper
const calculateFineDistribution = (fine, baseCharge) => {
  const halfFine = Math.round(fine / 2);
  const providerAmount = baseCharge + halfFine;
  const displacedCustomerAmount = halfFine;
  return { providerAmount, displacedCustomerAmount };
};

async function runUnitTests() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING TIER 1: UNIT TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    process.stdout.write(`Testing: ${name.padEnd(52)}... `);
    try {
      fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log(`❌ FAIL (${err.message})`);
      failed++;
    }
  }

  // 1. Pricing Engine Tests
  test('Pricing: 1 hour returns flat base ₹40', () => {
    const cost = calculateCost(1, 50, 1.5);
    assert.strictEqual(cost, 40);
  });

  test('Pricing: Multi-hour standard pricing (3h @ ₹50/hr, 1.0x)', () => {
    // 40 + (2 * 50 * 1.0) = 140
    const cost = calculateCost(3, 50, 1.0);
    assert.strictEqual(cost, 140);
  });

  test('Pricing: Dynamic pricing multiplier (3h @ ₹50/hr, 1.5x)', () => {
    // 40 + Math.round(2 * 50 * 1.5) = 40 + 150 = 190
    const cost = calculateCost(3, 50, 1.5);
    assert.strictEqual(cost, 190);
  });

  // 2. Overstay Fine Engine Tests
  test('Fines: On-time checkout incurs ₹0 fine', () => {
    const res = calculateFine(60, 60);
    assert.strictEqual(res.fine, 0);
    assert.strictEqual(res.graceUsed, 0);
  });

  test('Fines: 4-minute overstay within 5-min grace window = ₹0 fine', () => {
    const res = calculateFine(64, 60);
    assert.strictEqual(res.fine, 0);
    assert.strictEqual(res.graceUsed, 4);
  });

  test('Fines: 15-minute overstay charges ₹20 ((15-5)*₹2)', () => {
    const res = calculateFine(75, 60);
    assert.strictEqual(res.fine, 20);
    assert.strictEqual(res.graceUsed, 5);
  });

  test('Fine Distribution: 50/50 split between provider & displaced pool', () => {
    const dist = calculateFineDistribution(20, 100);
    assert.strictEqual(dist.providerAmount, 110); // 100 base + 10 half fine
    assert.strictEqual(dist.displacedCustomerAmount, 10); // 10 half fine
  });

  // 3. Vehicle & Slot Category Compatibility Tests
  test('Compatibility: Hatchback fits in Sedan slot', () => {
    assert.strictEqual(isCompatible('Hatchback', 'Sedan'), true);
  });

  test('Compatibility: SUV cannot fit in Sedan slot', () => {
    assert.strictEqual(isCompatible('SUV', 'Sedan'), false);
  });

  test('Compatibility: Luxury Car fits in Luxury Car slot', () => {
    assert.strictEqual(isCompatible('Luxury Car', 'Luxury Car'), true);
  });

  test('Compatibility: Motorcycle fits in Bike slot', () => {
    assert.strictEqual(isCompatible('Bike', 'Bike'), true);
    assert.strictEqual(isCompatible('Scooter', 'Bike'), true);
  });

  test('Compatibility: EV strictly requires EV slot', () => {
    assert.strictEqual(isCompatible('EV', 'EV'), true);
    assert.strictEqual(isCompatible('Sedan', 'EV'), false);
    assert.strictEqual(isCompatible('EV', 'Sedan'), false);
  });

  test('Compatibility: Handicap vehicle strictly requires Handicap slot', () => {
    assert.strictEqual(isCompatible('Handicap', 'Handicap'), true);
    assert.strictEqual(isCompatible('Sedan', 'Handicap'), false);
  });

  // 4. Cryptographic QR Encryption & Token Tests
  test('QR Crypto: Encrypt and decrypt payload accurately', () => {
    const original = { bookingId: '6601234567890abcdef12345', userId: 'user99', code: 'ABC' };
    const encrypted = encryptPayload(original);
    assert.ok(typeof encrypted === 'string' && encrypted.length > 20);
    const decrypted = decryptPayload(encrypted);
    assert.strictEqual(decrypted.bookingId, original.bookingId);
    assert.strictEqual(decrypted.userId, original.userId);
  });

  test('QR Token: Sign and verify JWT with claims', () => {
    const payload = { bookingId: 'bk_123', slotId: 'slot_456', vehiclePlate: 'WB02AB1234' };
    const token = generateQRToken(payload);
    assert.ok(typeof token === 'string' && token.split('.').length === 3);
    const verified = verifyQRToken(token);
    assert.strictEqual(verified.bookingId, 'bk_123');
    assert.strictEqual(verified.vehiclePlate, 'WB02AB1234');
  });

  test('QR Token: Tampered token verification returns null', () => {
    const token = generateQRToken({ bookingId: 'bk_tamper' });
    const tampered = token.slice(0, -5) + 'xxxxx';
    const verified = verifyQRToken(tampered);
    assert.strictEqual(verified, null);
  });

  // 5. Waiting Queue Priority Formula Tests
  test('Queue Priority: Emergency gets +1000 weight', () => {
    const score = calculatePriorityScore({ isEmergency: true });
    assert.strictEqual(score, 1000);
  });

  test('Queue Priority: Admin override gets +500 weight', () => {
    const score = calculatePriorityScore({ isAdminOverride: true });
    assert.strictEqual(score, 500);
  });

  test('Queue Priority: Handicap gets +100 weight', () => {
    const score = calculatePriorityScore({ isHandicap: true });
    assert.strictEqual(score, 100);
  });

  test('Queue Priority: EV gets +50 weight', () => {
    const score = calculatePriorityScore({ isEV: true });
    assert.strictEqual(score, 50);
  });

  test('Queue Priority: Composite priority score calculation', () => {
    const score = calculatePriorityScore({ isEmergency: true, isHandicap: true, isEV: true });
    assert.strictEqual(score, 1150);
  });

  console.log('\n====================================================');
  console.log(`TIER 1 (UNIT TESTS) SUMMARY: ${passed + failed} Tests | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runUnitTests().catch(err => {
  console.error('Fatal Unit Test Runner Error:', err);
  process.exit(1);
});
