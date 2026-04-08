/**
 * Migration: Alter admin_users table to add new columns
 * Adds: username, name, status
 * Changes: role enum values from (admin, manager, viewer) to (property_admin, full_admin)
 */

exports.up = async function(knex) {
  // Check if columns already exist before adding them
  const hasUsername = await knex.schema.hasColumn('admin_users', 'username');
  const hasName = await knex.schema.hasColumn('admin_users', 'name');
  const hasStatus = await knex.schema.hasColumn('admin_users', 'status');

  if (!hasUsername || !hasName || !hasStatus) {
    await knex.schema.table('admin_users', function(table) {
      if (!hasUsername) {
        table.string('username', 50).unique().nullable();
      }
      if (!hasName) {
        table.string('name', 100).nullable();
      }
      if (!hasStatus) {
        table.enu('status', ['active', 'inactive']).defaultTo('active').nullable();
      }
    });
  }

  // Add index for username if it hasn't been created yet
  try {
    await knex.schema.raw('CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_unique ON admin_users(username) WHERE username IS NOT NULL');
  } catch (e) {
    // Index might already exist
  }

  // Migrate existing admin records
  // Generate username from email if not set
  await knex.raw(`
    UPDATE admin_users 
    SET username = LOWER(SUBSTRING(email, 1, POSITION('@' IN email) - 1)),
        name = COALESCE(name, 'Admin User'),
        status = COALESCE(status, 'active')
    WHERE username IS NULL
  `);

  // Update role values and drop/recreate the check constraint
  await knex.raw('ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check');

  await knex.raw(`
    UPDATE admin_users 
    SET role = 'full_admin'
    WHERE role = 'manager'
  `);

  await knex.raw(`
    UPDATE admin_users 
    SET role = 'property_admin'
    WHERE role IN ('admin', 'viewer')
  `);

  // Add new role check constraint
  await knex.raw(`
    ALTER TABLE admin_users 
    ADD CONSTRAINT admin_users_role_check 
    CHECK (role IN ('property_admin', 'full_admin'))
  `);
};

exports.down = async function(knex) {
  // These columns are not removed in downgrade to preserve data
  // Only the down function is provided for safety
  console.log('Downgrade will preserve username, name, and status columns');
};
