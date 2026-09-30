/**
 * Production-Safe Database Backup Utility
 * Exports all collections and index definitions from source MongoDB using BSON EJSON.
 * Ensures 100% type fidelity (ObjectIds, Dates, Decimals, RegExps).
 * 
 * Usage:
 *   node scripts/migration/backup.js
 *   OLD_MONGODB_URI="mongodb://127.0.0.1:27017/smart_parking" node scripts/migration/backup.js
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

const EJSON = mongoose.mongo.BSON.EJSON;

function getSourceUri() {
  if (process.env.OLD_MONGODB_URI) {
    return process.env.OLD_MONGODB_URI;
  }
  // Default to local smart_parking database
  return 'mongodb://127.0.0.1:27017/smart_parking';
}

async function backup() {
  const sourceUri = getSourceUri();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, '../../backups', `backup-${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('====================================================');
  console.log('📦 STARTING SAFE DATABASE BACKUP');
  console.log('====================================================');
  console.log(`Timestamp   : ${new Date().toISOString()}`);
  console.log(`Target Dir  : ${backupDir}`);

  let conn;
  try {
    conn = await mongoose.createConnection(sourceUri, { serverSelectionTimeoutMS: 15000 }).asPromise();
    console.log(`Connected to Source DB: ${conn.name}`);

    const collections = await conn.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections to backup.\n`);

    const manifest = {
      backupTimestamp: new Date().toISOString(),
      databaseName: conn.name,
      collections: {}
    };

    for (const col of collections) {
      const colName = col.name;
      process.stdout.write(`Exporting [${colName}]... `);
      
      const collection = conn.db.collection(colName);
      const totalDocs = await collection.countDocuments();
      const indexes = await collection.indexes();

      const filePath = path.join(backupDir, `${colName}.json`);
      const metaPath = path.join(backupDir, `${colName}.meta.json`);

      // Write metadata (including index specs)
      fs.writeFileSync(metaPath, JSON.stringify({ name: colName, count: totalDocs, indexes }, null, 2));

      // Stream documents with cursor to handle large collections efficiently
      const fileStream = fs.createWriteStream(filePath, { flags: 'w' });
      fileStream.write('[\n');

      const cursor = collection.find({}).batchSize(1000);
      let count = 0;
      let first = true;

      for await (const doc of cursor) {
        if (!first) {
          fileStream.write(',\n');
        }
        fileStream.write('  ' + EJSON.stringify(doc));
        first = false;
        count++;
      }

      fileStream.write('\n]\n');
      fileStream.end();

      await new Promise(resolve => fileStream.on('finish', resolve));

      manifest.collections[colName] = {
        count,
        file: `${colName}.json`,
        metaFile: `${colName}.meta.json`,
        indexCount: indexes.length
      };

      console.log(`✅ ${count} documents exported.`);
    }

    const manifestPath = path.join(backupDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log('\n====================================================');
    console.log('✅ BACKUP COMPLETED SUCCESSFULLY');
    console.log(`Manifest written to: ${manifestPath}`);
    console.log('====================================================');

    return { success: true, backupDir, manifest };
  } catch (err) {
    console.error('\n❌ Backup Failed:', err.message);
    throw err;
  } finally {
    if (conn) {
      await conn.close();
    }
  }
}

if (require.main === module) {
  backup().catch(() => process.exit(1));
}

module.exports = backup;
