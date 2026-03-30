/**
 * Migration: Create availability_blocks table
 * Stores manual maintenance/blocked date windows per unit
 */

exports.up = function(knex) {
  return knex.schema.createTable('availability_blocks', function(table) {
    table.increments('id').primary();
    
    // Unit reference
    table.integer('unit_id').unsigned().notNullable().references('id').inTable('units').onDelete('CASCADE');
    
    // Block period
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    
    // Block type & reason
    table.enu('block_type', ['maintenance', 'blocked', 'cleaning']).defaultTo('maintenance');
    table.string('reason', 255).nullable();                // e.g., 'Plumbing repairs', 'Owner unavailable'
    
    // Metadata
    table.timestamps(true, true);
    
    // Indexes
    table.index('unit_id');
    table.index('start_date');
    table.index('end_date');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('availability_blocks');
};
