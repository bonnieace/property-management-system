/**
 * Migration: Create admin_users table
 * Stores admin dashboard access credentials
 */

exports.up = function(knex) {
  return knex.schema.createTable('admin_users', function(table) {
    table.increments('id').primary();
    
    // Identity
    table.string('username', 50).unique().notNullable();
    table.string('name', 100).notNullable();
    table.string('email', 100).unique().notNullable();
    table.string('password_hash', 255).notNullable();      // bcrypt hashed password
    
    // Access control
    table.enu('role', ['property_admin', 'full_admin']).defaultTo('property_admin');
    
    // Status
    table.enu('status', ['active', 'inactive']).defaultTo('active');
    
    // Activity tracking
    table.timestamp('last_login').nullable();
    
    // Metadata
    table.timestamps(true, true);
    
    // Indexes
    table.index('email');
    table.index('username');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('admin_users');
};
