/**
 * Database Connection & Inspection Utility
 * Tests connectivity to the source and target MongoDB databases and reports collection info.
 * Safe & Read-Only.
 */
const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const fs = require('fs');

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

// 1. Source (Old DB) from backend/.env
const backendEnvPath = path.resolve(__dirname, '../../.env');
const backendEnv = parseEnv(backendEnvPath);
const oldUri = process.env.OLD_MONGODB_URI || backendEnv.MONGODB_URI;

// 2. Target (New DB) from environment or downloads
const atlasEnvPath = 'C:/Users/alind/Downloads/atlas-credentials.env';
const atlasEnv = parseEnv(atlasEnvPath);
let newUri = process.env.NEW_MONGODB_URI || atlasEnv.MONGODB_URI;

if (newUri && !newUri.includes('smart_parking')) {
  if (newUri.includes('?')) {
    newUri = newUri.replace(/\/\?/, '/smart_parking?');
  } else {
    newUri = newUri.replace(/\/$/, '') + '/smart_parking?retryWrites=true&w=majority';
  }
}

async function inspect(uri, label) {
  console.log(`\n========================================`);
  console.log(`Testing Connection: ${label}`);
  console.log(`========================================`);
  if (!uri) {
    console.error(`❌ URI for ${label} is not defined!`);
    return { success: false, error: 'No URI' };
  }

  try {
    const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 15000 }).asPromise();
    console.log(`✅ Successfully connected to ${label}!`);
    console.log(`   Host: ${conn.host}`);
    console.log(`   Database Name: ${conn.name}`);
    
    const collections = await conn.db.listCollections().toArray();
    console.log(`   Total Collections: ${collections.length}`);
    const details = {};
    for (const col of collections) {
      const count = await conn.db.collection(col.name).countDocuments();
      const indexes = await conn.db.collection(col.name).indexes();
      details[col.name] = { count, indexCount: indexes.length };
      console.log(`   - ${col.name.padEnd(25)} : ${count} docs, ${indexes.length} indexes`);
    }
    await conn.close();
    return { success: true, host: conn.host, dbName: conn.name, details };
  } catch (err) {
    console.error(`❌ Failed connecting to ${label}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function main() {
  const oldRes = await inspect(oldUri, 'SOURCE (Old) MongoDB');
  const newRes = await inspect(newUri, 'TARGET (New) MongoDB Atlas');

  console.log(`\n========================================`);
  console.log(`Connectivity Summary`);
  console.log(`========================================`);
  console.log(`Old DB Accessible: ${oldRes.success ? 'YES' : 'NO'}`);
  console.log(`New DB Accessible: ${newRes.success ? 'YES' : 'NO'}`);
}

main();
