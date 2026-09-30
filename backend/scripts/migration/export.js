/**
 * Migration Export Utility
 * Exports database data and schemas for migration.
 * Delegates to the safe backup utility.
 */

const backup = require('./backup');

async function runExport() {
  console.log('--- Triggering Migration Export ---');
  return await backup();
}

if (require.main === module) {
  runExport().then(() => {
    console.log('Export completed successfully.');
    process.exit(0);
  }).catch((err) => {
    console.error('Export failed:', err.message);
    process.exit(1);
  });
}

module.exports = runExport;
