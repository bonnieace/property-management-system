/**
 * Migration: Create admin_properties junction table
 * Maps admins to properties they have access to (many-to-many relationship)
 * Full-access admins have NO entries here (identified by role='full_admin')
 */

exports.up = function(knex) {
  return knex.schema.createTable('admin_properties', function(table) {
    table.increments('id').primary();
    
    // Foreign keys
    table.integer('admin_id').unsigned().notNullable().references('id').inTable('admin_users').onDelete('CASCADE');
    table.integer('property_id').unsigned().notNullable().references('id').inTable('properties').onDelete('CASCADE');
    
    // Metadata
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes & constraints
    table.unique(['admin_id', 'property_id']);
    table.index('admin_id');
    table.index('property_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('admin_properties');
};
