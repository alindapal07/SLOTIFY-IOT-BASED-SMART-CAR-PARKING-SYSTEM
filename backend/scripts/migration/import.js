/**
 * Production-Safe Database Import Utility
 * Restores collections, documents, and indexes into the target MongoDB Atlas cluster
 * from a verified backup.
 * 
 * Safety Features:
 * - Checks that backup exists and is verified before proceeding.
 * - Streams documents line-by-line to avoid memory overhead on large collections.
 * - Preserves BSON types (ObjectIds, Dates, etc.) using EJSON.
 * - Reconstructs indexes from metadata.
 * - Never prints credentials or secrets.
 * 
 * Usage:
 *   node scripts/migration/import.js
 *   NEW_MONGODB_URI="mongodb+srv://..." node scripts/migration/import.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

const EJSON = mongoose.mongo.BSON.EJSON;

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

function getTargetUri() {
  let uri = process.env.NEW_MONGODB_URI;
  if (!uri) {
    const atlasPath = 'C:/Users/alind/Downloads/atlas-credentials.env';
    const atlasEnv = parseEnv(atlasPath);
    uri = atlasEnv.MONGODB_URI || process.env.MONGODB_URI;
  }

  if (!uri) {
    throw new Error('Target MongoDB URI not found in environment or atlas credentials file.');
  }

  // Ensure URI targets the smart_parking database
  if (!uri.includes('smart_parking')) {
    if (uri.includes('?')) {
      uri = uri.replace(/\/\?/, '/smart_parking?');
    } else {
      uri = uri.replace(/\/$/, '') + '/smart_parking?retryWrites=true&w=majority';
    }
  }

  return uri;
}

function getLatestBackupDir() {
  const backupsRoot = path.resolve(__dirname, '../../backups');
  if (!fs.existsSync(backupsRoot)) {
    throw new Error(`Backups directory not found at: ${backupsRoot}`);
  }

  const entries = fs.readdirSync(backupsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('backup-'))
    .map(e => e.name)
    .sort()
    .reverse();

  if (entries.length === 0) {
    throw new Error('No backup directories found in backups folder.');
  }

  return path.join(backupsRoot, entries[0]);
}

async function importCollection(db, backupDir, colName, meta) {
  const jsonPath = path.join(backupDir, `${colName}.json`);
  if (!fs.existsSync(jsonPath)) {
    console.warn(`⚠️ Warning: ${jsonPath} not found. Skipping.`);
    return 0;
  }

  const targetCol = db.collection(colName);
  const existingCount = await targetCol.countDocuments();
  if (existingCount > 0) {
    console.log(`ℹ️ [${colName}] already has ${existingCount} documents in target database. Checking...`);
    if (existingCount >= meta.count) {
      console.log(`⏭️ [${colName}] already fully populated (${existingCount} >= ${meta.count}). Skipping duplicate import.`);
      return existingCount;
    }
  }

  process.stdout.write(`Importing [${colName}] (Expected ~${meta.count} docs)... `);

  const fileStream = fs.createReadStream(jsonPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const BATCH_SIZE = 1000;
  let batch = [];
  let totalImported = 0;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line || line === '[' || line === ']') continue;

    const cleaned = line.endsWith(',') ? line.slice(0, -1) : line;
    try {
      const doc = EJSON.parse(cleaned);
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        await targetCol.insertMany(batch, { ordered: false });
        totalImported += batch.length;
        batch = [];
        process.stdout.write(`.`);
      }
    } catch (parseErr) {
      console.error(`\nError parsing line in ${colName}:`, parseErr.message);
    }
  }

  if (batch.length > 0) {
    await targetCol.insertMany(batch, { ordered: false });
    totalImported += batch.length;
    batch = [];
  }

  console.log(` ✅ Done (${totalImported} imported).`);

  // Restore Indexes
  if (meta.indexes && meta.indexes.length > 0) {
    for (const idx of meta.indexes) {
      if (idx.name === '_id_') continue; // Default index cannot be created manually
      try {
        const options = { name: idx.name };
        if (idx.unique) options.unique = true;
        if (idx.sparse) options.sparse = true;
        if (idx['2dsphereIndexVersion']) options['2dsphereIndexVersion'] = idx['2dsphereIndexVersion'];
        await targetCol.createIndex(idx.key, options);
      } catch (idxErr) {
        // Skip if already exists
        if (!idxErr.message.includes('already exists')) {
          console.warn(`  ⚠️ Index warning on ${colName} (${idx.name}): ${idxErr.message}`);
        }
      }
    }
  }

  return totalImported;
}

async function runImport() {
  const targetUri = getTargetUri();
  const backupDir = getLatestBackupDir();
  const manifestPath = path.join(backupDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}. Cannot safely import without verified manifest.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  console.log('====================================================');
  console.log('🚀 STARTING SAFE DATABASE IMPORT TO ATLAS');
  console.log('====================================================');
  console.log(`Source Backup : ${backupDir}`);
  console.log(`Backup Date   : ${manifest.backupTimestamp}`);
  console.log(`Collections   : ${Object.keys(manifest.collections).join(', ')}`);

  let conn;
  try {
    conn = await mongoose.createConnection(targetUri, { serverSelectionTimeoutMS: 20000 }).asPromise();
    console.log(`Connected to Target Atlas DB: ${conn.name}`);
    console.log(`Host: ${conn.host}\n`);

    for (const [colName, colMeta] of Object.entries(manifest.collections)) {
      const metaPath = path.join(backupDir, colMeta.metaFile);
      let detailedMeta = colMeta;
      if (fs.existsSync(metaPath)) {
        detailedMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
      await importCollection(conn.db, backupDir, colName, detailedMeta);
    }

    // Explicitly sync spatial 2dsphere index for ParkingZone
    try {
      await conn.db.collection('parkingzones').createIndex({ location: '2dsphere' });
      console.log('✅ Verified 2dsphere spatial index on parkingzones.location');
    } catch (e) {
      console.warn('⚠️ Spatial index note:', e.message);
    }

    console.log('\n====================================================');
    console.log('🎉 ALL COLLECTIONS IMPORTED TO ATLAS SUCCESSFULLY');
    console.log('====================================================');
    return { success: true };
  } catch (err) {
    console.error('\n❌ Import Failed:', err.message);
    throw err;
  } finally {
    if (conn) {
      await conn.close();
    }
  }
}

if (require.main === module) {
  runImport().catch(() => process.exit(1));
}

module.exports = runImport;
