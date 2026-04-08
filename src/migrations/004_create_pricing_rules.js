/**
 * Migration: Create pricing_rules table
 * Stores seasonal pricing overrides (higher price takes precedence)
 */

exports.up = function(knex) {
  return knex.schema.createTable('pricing_rules', function(table) {
    table.increments('id').primary();
    
    // Unit reference
    table.integer('unit_id').unsigned().notNullable().references('id').inTable('units').onDelete('CASCADE');
    
    // Rule period
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    
    // Override pricing
    table.integer('price_per_night_kes').notNullable();    // Override price (takes precedence if highest)
    
    // Details
    table.string('reason', 200).nullable();                // e.g., 'Peak season', 'Weekend premium', 'Holiday'
    table.boolean('is_active').defaultTo(true);
    
    // Metadata
    table.timestamps(true, true);
    
    // Indexes for efficient conflict detection
    table.index('unit_id');
    table.index('start_date');
    table.index('end_date');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('pricing_rules');
};
