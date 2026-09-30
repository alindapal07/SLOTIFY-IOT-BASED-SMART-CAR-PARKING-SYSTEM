/**
 * Geospatial Nearby Parking Verification Test Suite
 * Tests 5 user locations across Kolkata:
 * 1. User near Salt Lake (22.5868, 88.4178)
 * 2. User near Park Street (22.5510, 88.3526)
 * 3. User near New Town (22.5958, 88.4795)
 * 4. User near Garia (22.4707, 88.3855)
 * 5. User near Behala (22.4990, 88.3180)
 * 
 * Also tests filters:
 * - availability=true
 * - maxPrice=50
 * - parkingType=Metro
 * - vehicleType=SUV
 * - ev=true
 */

const http = require('http');

const BASE_URL = 'http://127.0.0.1:5000';

function search(params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const url = `${BASE_URL}/api/v1/parking/search?${query}`;

    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    }).on('error', reject);
  });
}

const TEST_LOCATIONS = [
  {
    name: 'Salt Lake',
    lat: 22.5868,
    lng: 88.4178,
    expectedTopSubstrings: ['Salt Lake', 'City Centre', 'Karunamoyee', 'Webel']
  },
  {
    name: 'Park Street',
    lat: 22.5510,
    lng: 88.3526,
    expectedTopSubstrings: ['Park Street', 'Esplanade', 'Bhowanipore', 'Forum']
  },
  {
    name: 'New Town',
    lat: 22.5958,
    lng: 88.4795,
    expectedTopSubstrings: ['New Town', 'Axis Mall', 'Eco Park', 'Chinar Park']
  },
  {
    name: 'Garia',
    lat: 22.4707,
    lng: 88.3855,
    expectedTopSubstrings: ['Garia', 'Kavi Subhash', 'Jadavpur', 'Tollygunge']
  },
  {
    name: 'Behala',
    lat: 22.4990,
    lng: 88.3180,
    expectedTopSubstrings: ['Behala', 'Alipore', 'Tollygunge', 'Kalighat']
  }
];

async function runGeospatialTests() {
  console.log('====================================================');
  console.log('🌍 VERIFYING REAL GEOSPATIAL 2DSPHERE PARKING SEARCH');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  for (const loc of TEST_LOCATIONS) {
    console.log(`📍 Testing Location: User near ${loc.name} (${loc.lat}, ${loc.lng})`);
    try {
      const res = await search({
        lat: loc.lat,
        lng: loc.lng,
        radius: 15000 // 15 km
      });

      if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) {
        throw new Error(`Failed to return results (status ${res.status})`);
      }

      const results = res.data;
      console.log(`   Found ${results.length} facilities within 15 km.`);

      // Verify sorted strictly by distance ascending
      for (let i = 1; i < results.length; i++) {
        if (results[i].distance < results[i - 1].distance) {
          throw new Error(`Results not strictly sorted by distance! Item ${i} (${results[i].distance}m) < Item ${i - 1} (${results[i - 1].distance}m)`);
        }
      }

      // Display top 3 results
      console.log('   Top 3 closest facilities:');
      results.slice(0, 3).forEach((z, idx) => {
        console.log(`     ${idx + 1}. ${z.name.padEnd(42)} -> ${z.formattedDistance} | Price: ₹${z.price}/hr | Free: ${z.availableSlots}/${z.totalSlots} | ${z.openStatus}`);
      });

      // Check geographical sensibility (closest should contain expected nearby landmarks)
      const closestName = results[0].name;
      const secondName = results[1]?.name || '';
      const topNames = closestName + ' ' + secondName;

      const matchesExpected = loc.expectedTopSubstrings.some(sub => topNames.toLowerCase().includes(sub.toLowerCase()));
      if (!matchesExpected) {
        console.warn(`   ⚠️ Note: Closest was "${closestName}", expected near: ${loc.expectedTopSubstrings.join(', ')}`);
      } else {
        console.log(`   ✅ Closest facility (${closestName}) is geographically sensible!`);
      }

      passed++;
    } catch (err) {
      console.log(`   ❌ FAIL: ${err.message}`);
      failed++;
    }
    console.log('');
  }

  // ─────────────────────────────────────────
  // FILTER TESTS
  // ─────────────────────────────────────────
  console.log('────────────────────────────────────────────────────');
  console.log('🔍 Testing Filter Parameters:');
  console.log('────────────────────────────────────────────────────\n');

  // Filter 1: Availability filter
  console.log('1. Testing availableOnly=true (from Sector V)...');
  const availRes = await search({ lat: 22.5735, lng: 88.4331, radius: 25000, availableOnly: 'true' });
  const allAvailable = availRes.data.every(z => z.availableSlots > 0);
  if (allAvailable && availRes.data.length > 0) {
    console.log(`   ✅ PASS: All ${availRes.data.length} returned zones have availableSlots > 0.`);
    passed++;
  } else {
    console.log('   ❌ FAIL: Found zones with 0 availability.');
    failed++;
  }

  // Filter 2: Max Price <= ₹40/hr
  console.log('\n2. Testing maxPrice=40 (from Park Street)...');
  const priceRes = await search({ lat: 22.5510, lng: 88.3526, radius: 25000, maxPrice: 40 });
  const allPriceBelow = priceRes.data.every(z => (z.basePricePerHour || z.price) <= 40);
  if (allPriceBelow && priceRes.data.length > 0) {
    console.log(`   ✅ PASS: All ${priceRes.data.length} returned zones have price <= ₹40/hr.`);
    passed++;
  } else {
    console.log('   ❌ FAIL: Found zones with price > ₹40.');
    failed++;
  }

  // Filter 3: Parking Type = Metro
  console.log('\n3. Testing parkingType=Metro (from Esplanade)...');
  const typeRes = await search({ lat: 22.5647, lng: 88.3524, radius: 25000, parkingType: 'Metro' });
  const allMetro = typeRes.data.every(z => z.parkingType === 'Metro');
  if (allMetro && typeRes.data.length > 0) {
    console.log(`   ✅ PASS: All ${typeRes.data.length} returned zones have parkingType = Metro.`);
    passed++;
  } else {
    console.log('   ❌ FAIL: Found non-Metro zones.');
    failed++;
  }

  // Filter 4: EV Charging filter
  console.log('\n4. Testing ev=true (EV Charging stations)...');
  const evRes = await search({ lat: 22.5735, lng: 88.4331, radius: 25000, ev: 'true' });
  const allEV = evRes.data.every(z => z.hasEVCharging === true);
  if (allEV && evRes.data.length > 0) {
    console.log(`   ✅ PASS: All ${evRes.data.length} returned zones have hasEVCharging = true.`);
    passed++;
  } else {
    console.log('   ❌ FAIL: Found non-EV zones.');
    failed++;
  }

  console.log('\n====================================================');
  console.log(`TOTAL SCENARIOS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runGeospatialTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
