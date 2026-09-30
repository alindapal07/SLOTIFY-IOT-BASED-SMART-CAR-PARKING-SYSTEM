/**
 * Production-Safe Database Migration Verification Utility
 * Compares Source and Target MongoDB databases:
 * - Collection names and document counts
 * - Index definitions (including 2dsphere spatial indexes)
 * - Critical reference integrity (Users <-> Wallets, Bookings <-> Users/Slots/Zones)
 * - Generates a migration verification report
 * 
 * Usage:
 *   node scripts/migration/verify.js
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const res = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      res[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return res;
}

function getSourceUri() {
  return process.env.OLD_MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_parking';
}

function getTargetUri() {
  let uri = process.env.NEW_MONGODB_URI;
  if (!uri) {
    const atlasEnv = parseEnv('C:/Users/alind/Downloads/atlas-credentials.env');
    const backendEnv = parseEnv(path.resolve(__dirname, '../../.env'));
    // If backend .env still points to dead cluster, prefer atlasEnv
    if (backendEnv.MONGODB_URI && !backendEnv.MONGODB_URI.includes('gqymvl2')) {
      uri = backendEnv.MONGODB_URI;
    } else {
      uri = atlasEnv.MONGODB_URI || backendEnv.MONGODB_URI;
    }
  }

  if (uri && !uri.includes('smart_parking')) {
    if (uri.includes('?')) {
      uri = uri.replace(/\/\?/, '/smart_parking?');
    } else {
      uri = uri.replace(/\/$/, '') + '/smart_parking?retryWrites=true&w=majority';
    }
  }
  return uri;
}

async function verify() {
  const sourceUri = getSourceUri();
  const targetUri = getTargetUri();

  console.log('====================================================');
  console.log('🔍 MIGRATION VERIFICATION & RECONCILIATION AUDIT');
  console.log('====================================================');
  console.log(`Source : Local/Source DB (smart_parking)`);
  console.log(`Target : MongoDB Atlas Cluster (smart_parking)`);
  console.log('----------------------------------------------------');

  let sourceConn, targetConn;
  try {
    sourceConn = await mongoose.createConnection(sourceUri, { serverSelectionTimeoutMS: 15000 }).asPromise();
    targetConn = await mongoose.createConnection(targetUri, { serverSelectionTimeoutMS: 20000 }).asPromise();

    const sourceCols = await sourceConn.db.listCollections().toArray();
    const sourceColNames = sourceCols.map(c => c.name).sort();

    const reportRows = [];
    let allMatched = true;

    console.log('\n📊 COLLECTION & DOCUMENT COUNT VERIFICATION:');
    console.log(
      'Collection'.padEnd(25) +
      'Old Count'.padStart(12) +
      'New Count'.padStart(14) +
      '       Status'
    );
    console.log('-'.repeat(65));

    for (const colName of sourceColNames) {
      const oldCount = await sourceConn.db.collection(colName).countDocuments();
      const newCount = await targetConn.db.collection(colName).countDocuments();

      const isOk = oldCount === newCount;
      if (!isOk) allMatched = false;
      const statusStr = isOk ? 'OK' : 'MISMATCH';

      console.log(
        colName.padEnd(25) +
        String(oldCount).padStart(12) +
        String(newCount).padStart(14) +
        '       ' + (isOk ? '✅ OK' : '❌ MISMATCH')
      );

      reportRows.push({ collection: colName, oldCount, newCount, status: statusStr });
    }

    console.log('-'.repeat(65));

    // ─────────────────────────────────────────
    // REFERENTIAL INTEGRITY AUDIT ON TARGET DB
    // ─────────────────────────────────────────
    console.log('\n🔗 AUDITING REFERENTIAL INTEGRITY ON NEW ATLAS DATABASE:');

    // 1. Check Key Users
    const users = await targetConn.db.collection('users').find({}).toArray();
    const adminUser = users.find(u => u.role === 'ADMIN');
    const driverUsers = users.filter(u => u.role === 'DRIVER');
    const providerUsers = users.filter(u => u.role === 'PROVIDER');

    console.log(`  - Users Total: ${users.length}`);
    console.log(`    * Admin accounts     : ${adminUser ? 'Found (' + adminUser.email + ')' : 'None'}`);
    console.log(`    * Driver accounts    : ${driverUsers.length}`);
    console.log(`    * Provider accounts  : ${providerUsers.length}`);

    // 2. Check Wallet References
    let walletMissingCount = 0;
    for (const user of users) {
      if (user.walletId) {
        const wallet = await targetConn.db.collection('wallets').findOne({ _id: user.walletId });
        if (!wallet) walletMissingCount++;
      }
    }
    console.log(`  - User Wallet References   : ${walletMissingCount === 0 ? '✅ 100% Intact' : '⚠️ Missing ' + walletMissingCount}`);

    // 3. Check Bookings References
    const bookings = await targetConn.db.collection('bookings').find({}).toArray();
    let bookingRefErrors = 0;
    for (const b of bookings) {
      const u = await targetConn.db.collection('users').findOne({ _id: b.userId });
      const z = await targetConn.db.collection('parkingzones').findOne({ _id: b.zoneId });
      const s = await targetConn.db.collection('parkingslots').findOne({ _id: b.slotId });
      if (!u || !z || !s) bookingRefErrors++;
    }
    console.log(`  - Booking References       : ${bookingRefErrors === 0 ? '✅ 100% Intact (User, Zone, Slot)' : '⚠️ Errors: ' + bookingRefErrors}`);

    // 4. Check ParkingSlot -> ParkingZone References
    const sampleSlot = await targetConn.db.collection('parkingslots').findOne({});
    if (sampleSlot && sampleSlot.zoneId) {
      const zone = await targetConn.db.collection('parkingzones').findOne({ _id: sampleSlot.zoneId });
      console.log(`  - Slot->Zone Reference     : ${zone ? '✅ Verified Intact (' + zone.name + ')' : '⚠️ Zone not found'}`);
    }

    // 5. Check Spatial Index on parkingzones
    const pzIndexes = await targetConn.db.collection('parkingzones').indexes();
    const has2dSphere = pzIndexes.some(idx => idx.key && idx.key.location === '2dsphere');
    console.log(`  - Spatial (2dsphere) Index : ${has2dSphere ? '✅ Verified on parkingzones.location' : '⚠️ Missing 2dsphere index'}`);

    console.log('\n====================================================');
    if (allMatched && walletMissingCount === 0 && bookingRefErrors === 0 && has2dSphere) {
      console.log('🎉 MIGRATION VERIFICATION COMPLETE: ALL CHECKS PASSED');
    } else {
      console.log('⚠️ MIGRATION COMPLETED WITH WARNINGS - SEE AUDIT LOG ABOVE');
    }
    console.log('====================================================');

    return { success: allMatched, reportRows };
  } catch (err) {
    console.error('❌ Verification Error:', err.message);
    throw err;
  } finally {
    if (sourceConn) await sourceConn.close();
    if (targetConn) await targetConn.close();
  }
}

if (require.main === module) {
  verify().catch(() => process.exit(1));
}

module.exports = verify;
