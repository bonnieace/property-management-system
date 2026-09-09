/**
 * Seed: Initial admin users
 * Migrates existing hardcoded credentials to admin_users table with bcrypt hashing
 */

const bcrypt = require('bcrypt');

exports.seed = async function(knex) {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Demo seeding is disabled. Use the onboarding flow; set ALLOW_DEMO_SEED=true only for an empty disposable development database.');
  // Delete existing admins (if reseeding)
  await knex('admin_users').del();
  await knex('admin_properties').del();

  const SALT_ROUNDS = 10;
  
  // Hash passwords for existing admins
  const ireneHash = await bcrypt.hash(process.env.ADMIN_PASSWORD_IRENE || 'secure-password-ireneS', SALT_ROUNDS);
  const susanHash = await bcrypt.hash(process.env.ADMIN_PASSWORD_SUSAN || 'secure-password-susan', SALT_ROUNDS);
  const managerHash = await bcrypt.hash(process.env.ADMIN_PASSWORD_MANAGER || 'secure-password-managerS', SALT_ROUNDS);

  // Insert irene
  await knex('admin_users').insert({
    username: 'irene',
    name: 'Irene Kariuki',
    email: 'irene@nyathirahomes.com',
    password_hash: ireneHash,
    role: 'property_admin',
    status: 'active'
  });
  const irene = await knex('admin_users').where('username', 'irene').first();

  // Insert susan
  await knex('admin_users').insert({
    username: 'susan',
    name: 'Susan Koech',
    email: 'susan@nyathirahomes.com',
    password_hash: susanHash,
    role: 'property_admin',
    status: 'active'
  });
  const susan = await knex('admin_users').where('username', 'susan').first();

  // Insert manager
  await knex('admin_users').insert({
    username: 'manager',
    name: 'Property Manager',
    email: 'manager@nyathirahomes.com',
    password_hash: managerHash,
    role: 'full_admin',
    status: 'active'
  });
  const manager = await knex('admin_users').where('username', 'manager').first();

  // Get property IDs for linking
  const nyathiraProperty = await knex('properties').where('property_id', 'nyathira').first();
  const kibabuProperty = await knex('properties').where('property_id', 'kibabu').first();

  // Assign properties to admins (only property_admin role gets property assignments)
  if (nyathiraProperty && irene) {
    await knex('admin_properties').insert({
      admin_id: irene.id,
      property_id: nyathiraProperty.id
    });
  }

  if (kibabuProperty && susan) {
    await knex('admin_properties').insert({
      admin_id: susan.id,
      property_id: kibabuProperty.id
    });
  }

  // Manager (full_admin) gets NO property assignments (identified by role='full_admin')
  console.log('✅ Seeded 3 admin users: irene, susan, manager');
};
