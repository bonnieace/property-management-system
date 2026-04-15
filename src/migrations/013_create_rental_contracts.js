/**
 * Migration: Create rental_contracts table
 * Stores lease agreements (tenant + unit combination)
 * Independent from bookings table (rental is separate system)
 */

exports.up = function(knex) {
  return knex.schema.createTable('rental_contracts', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Relationships
    table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('unit_id').unsigned().notNullable().references('id').inTable('units').onDelete('CASCADE');
    table.string('property_id', 20).notNullable();
    
    // Contract terms
    table.date('start_date').notNullable();
    table.date('end_date').nullable();                            // NULL = indefinite lease
    table.integer('monthly_rent_kes').notNullable();
    table.enu('payment_frequency', ['weekly', 'biweekly', 'monthly']).defaultTo('monthly');
    table.integer('security_deposit_kes').nullable();
    table.integer('utilities_deposit_kes').nullable();
    
    // Status
    table.enu('status', ['active', 'suspended', 'ended', 'terminated']).defaultTo('active');
    table.text('termination_reason').nullable();
    table.date('termination_date').nullable();
    
    // Notes
    table.text('contract_notes').nullable();
    
    // Timestamps
    table.timestamps(true, true);
    
    // Indexes for common queries
    table.index('tenant_id');
    table.index('unit_id');
    table.index('status');
    table.index('start_date');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('rental_contracts');
};
