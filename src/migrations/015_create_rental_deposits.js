/**
 * Migration: Create rental_deposits table
 * Tracks initial rental deposits from public website forms
 * Separates rental payment initiation from bookings table
 * Once payment confirmed, this feeds into tenant+contract creation
 */

exports.up = function(knex) {
  return knex.schema.createTable('rental_deposits', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Guest info from rental form
    table.string('guest_name').notNullable();
    table.string('guest_phone', 20).notNullable();
    table.string('guest_email', 100).nullable();
    
    // Unit & property selection
    table.integer('unit_id').unsigned().notNullable().references('id').inTable('units').onDelete('CASCADE');
    table.string('property_id', 20).notNullable();
    
    // Rental details
    table.date('intended_checkin_date').notNullable();
    table.integer('deposit_amount_kes').notNullable();
    table.text('guest_notes').nullable();
    
    // M-Pesa tracking
    table.string('reference', 50).nullable().unique();             // NYH-XXXXXX booking ref
    table.string('checkout_request_id', 100).nullable().unique(); // Daraja request ID
    table.string('mpesa_receipt_number', 50).nullable();          // M-Pesa receipt
    table.string('mpesa_phone', 20).nullable();                   // Actual phone that paid
    table.string('mpesa_reference', 100).nullable();              // received_XXXXX
    table.datetime('mpesa_transaction_date').nullable();
    
    // Status tracking
    table.enu('status', ['pending', 'confirmed', 'failed']).defaultTo('pending');
    
    // Once tenant+contract created, link them
    table.integer('tenant_id').unsigned().nullable().references('id').inTable('tenants').onDelete('SET NULL');
    table.uuid('contract_id').nullable().references('id').inTable('rental_contracts').onDelete('SET NULL');
    
    // Timestamps
    table.timestamps(true, true);
    
    // Indexes for common queries
    table.index('guest_phone');
    table.index('property_id');
    table.index('status');
    table.index('checkout_request_id');
    table.index(['property_id', 'intended_checkin_date']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('rental_deposits');
};
