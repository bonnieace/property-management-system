/**
 * Migration: Create admin_users table
 * Stores admin dashboard access credentials
 */

exports.up = function(knex) {
  return knex.schema.createTable('admin_users', function(table) {
    table.increments('id').primary();
    
    // Credentials
    table.string('email', 100).unique().notNullable();
    table.string('password_hash', 255).notNullable();      // bcrypt hashed password
    
    // Access control
    table.enu('role', ['admin', 'manager', 'viewer']).defaultTo('manager');
    
    // Activity tracking
    table.timestamp('last_login').nullable();
    
    // Metadata
    table.timestamps(true, true);
    
    // Index
    table.index('email');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('admin_users');
};
