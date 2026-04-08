/**
 * Migration: Create units table
 * Stores property/unit metadata (B&B and rental units)
 */

exports.up = function(knex) {
  return knex.schema.createTable('units', function(table) {
    table.increments('id').primary();
    
    // Unit identifiers
    table.string('unit_id', 50).unique().notNullable();   // e.g., 'bnb1b-nyathira', 'bedsit-kibabu'
    table.string('property_id', 20).notNullable();         // e.g., 'nyathira', 'kibabu'
    table.enu('type', ['bnb', 'bedsit', '1bed', '2bed']).notNullable(); // Unit category
    
    // Basic info
    table.string('name', 100).notNullable();               // e.g., '1-Bed B&B Suite'
    table.text('description').nullable();
    
    // Capacity & layout
    table.integer('bedrooms').notNullable();
    table.integer('bathrooms').notNullable();
    table.integer('max_guests').defaultTo(4);             // Max occupancy (B&B only)
    
    // Pricing
    table.integer('base_price_kes').notNullable();         // Price per night (B&B) or month (rental)
    table.integer('extra_guest_charge').defaultTo(800);    // Extra KES per night per guest (B&B only)
    table.integer('water_deposit_kes').defaultTo(0);       // Water deposit (rental only)
    
    // Constraints
    table.integer('min_night_stay').defaultTo(1);          // Minimum stay in nights (1 for B&B, 180+ for rental)
    
    // Status
    table.enu('status', ['active', 'inactive', 'maintenance']).defaultTo('active');
    
    // Metadata
    table.timestamps(true, true);                          // created_at, updated_at
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('units');
};
