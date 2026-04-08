/**
 * Migration: Create properties table
 * Stores property/building metadata for multi-tenant support
 */

exports.up = function(knex) {
  return knex.schema.createTable('properties', function(table) {
    table.increments('id').primary();
    
    // Property identifiers
    table.string('property_id', 50).unique().notNullable();   // e.g., 'nyathira', 'kibabu' (slug)
    table.string('name', 100).notNullable();                  // e.g., 'Nyathira B&B'
    
    // Details
    table.text('description').nullable();
    table.string('address', 200).nullable();
    table.string('city', 50).nullable();
    table.string('country', 50).defaultTo('Kenya');
    
    // Contact
    table.string('contact_person', 100).nullable();
    table.string('contact_phone', 20).nullable();
    table.string('email', 100).nullable();
    
    // Status
    table.enu('status', ['active', 'inactive']).defaultTo('active');
    
    // Metadata
    table.timestamps(true, true);                             // created_at, updated_at
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('properties');
};
