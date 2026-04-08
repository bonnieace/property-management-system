/**
 * Migration: Create waitlist table
 * Stores guest waitlist entries when unit is fully booked
 */

exports.up = function(knex) {
  return knex.schema.createTable('waitlist', function(table) {
    table.increments('id').primary();
    
    // Unit reference
    table.integer('unit_id').unsigned().notNullable().references('id').inTable('units').onDelete('CASCADE');
    
    // Guest info
    table.string('guest_name', 100).notNullable();
    table.string('guest_phone', 20).notNullable();
    table.string('guest_email', 100).notNullable();
    
    // Preferred dates
    table.date('preferred_checkin').notNullable();
    table.date('preferred_checkout').notNullable();
    
    // Waitlist tracking
    table.integer('position_in_queue').defaultTo(0);      // Position number (0 = most recent)
    table.boolean('notified').defaultTo(false);           // Has this guest been notified of availability?
    table.timestamp('notified_at').nullable();
    
    // Metadata
    table.timestamps(true, true);
    
    // Indexes
    table.index('unit_id');
    table.index('guest_phone');
    table.index('notified');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('waitlist');
};
