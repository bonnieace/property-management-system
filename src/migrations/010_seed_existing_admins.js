/**
 * Migration: Administrative marker for admin user setup
 * Note: Actual admin seeding is now done via seeds/003_initial_admins.js
 * This migration creates the admin_properties junction table.
 */

exports.up = function(knex) {
  // Check if admin_properties table already exists before creating
  return knex.schema.hasTable('admin_properties').then(exists => {
    if (!exists) {
      return knex.schema.createTable('admin_properties', function(table) {
        table.increments('id').primary();
        table.integer('admin_id').unsigned().notNullable().references('id').inTable('admin_users').onDelete('CASCADE');
        table.integer('property_id').unsigned().notNullable().references('id').inTable('properties').onDelete('CASCADE');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.unique(['admin_id', 'property_id']);
        table.index('admin_id');
        table.index('property_id');
      });
    }
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('admin_properties');
};
