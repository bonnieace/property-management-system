require('dotenv').config();
const db = require('../src/db');
const { inspectUpgrade } = require('../src/upgradePreflight');

const migrationName = value => typeof value === 'string' ? value : value?.name;

(async () => {
  try {
    const [completed, pending] = await db.migrate.list();
    const completedNames = completed.map(migrationName).filter(Boolean);
    const pendingNames = pending.map(migrationName).filter(Boolean);

    if (!pendingNames.length) {
      console.log('Database schema is already current.');
      return;
    }

    console.log(`Pending migrations: ${pendingNames.join(', ')}`);

    if (completedNames.length === 0) {
      // A truly empty database can be migrated from scratch. If application tables
      // already exist without Knex history, stop rather than guessing their schema.
      const hasLegacyTables = await db.schema.hasTable('properties');
      if (hasLegacyTables) {
        throw new Error('Database has application tables but no Knex migration history. Refusing automatic migration; reconcile migration history first.');
      }
      console.log('Fresh database detected; applying all migrations.');
    } else if (pendingNames.includes('018_property_workspaces.js')) {
      if (!completedNames.includes('017_alter_properties_add_display_fields.js')) {
        throw new Error('Migration 018 is pending but migration 017 is not recorded as complete. Refusing unsafe automatic upgrade.');
      }

      console.log('Existing 001-017 installation detected; running guarded upgrade preflight before migration 018.');
      const report = await db.transaction(async trx => {
        await trx.raw('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
        return inspectUpgrade(trx);
      });
      console.log(JSON.stringify(report));
      if (!report.ok) {
        throw new Error('Production upgrade preflight found blockers. Database was not migrated.');
      }
    }

    const [batch, applied] = await db.migrate.latest();
    console.log(`Migration batch ${batch} applied: ${applied.length ? applied.join(', ') : 'none'}`);
  } catch (err) {
    console.error(`Automatic migration failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
