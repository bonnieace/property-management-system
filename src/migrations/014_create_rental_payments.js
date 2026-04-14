/**
 * Migration: Create rental_payments table
 * Tracks monthly payment records (multiple payments per tenant/month possible)
 * Supports partial payments, overpayments, and payment history
 */

exports.up = function(knex) {
  return knex.schema.createTable('rental_payments', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Relationships
    table.uuid('contract_id').notNullable().references('id').inTable('rental_contracts').onDelete('CASCADE');
    table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    table.integer('unit_id').unsigned().notNullable().references('id').inTable('units').onDelete('CASCADE');
    
    // Period identification (month/year composite)
    table.integer('month').notNullable();                         // 1-12
    table.integer('year').notNullable();
    
    // Amount tracking
    table.integer('amount_due_kes').notNullable();                // Monthly rent
    table.integer('amount_paid_kes').defaultTo(0);               // Cumulative paid
    table.integer('amount_outstanding_kes').notNullable();       // amount_due - amount_paid
    
    // Payment status
    table.enu('status', ['pending', 'partial', 'paid', 'late']).defaultTo('pending');
    table.date('due_date').notNullable();                         // When payment is due
    table.date('paid_date').nullable();                           // When fully paid
    
    // M-Pesa tracking (for auto-payments)
    table.string('mpesa_receipt_number', 50).nullable();
    table.string('mpesa_phone', 20).nullable();
    table.string('reference', 50).nullable();                     // M-Pesa order ref
    
    // Notes (for partial payment tracking or issues)
    table.text('notes').nullable();
    
    // Timestamps
    table.timestamps(true, true);
    
    // Indexes for common queries
    table.index('contract_id');
    table.index('tenant_id');
    table.index(['month', 'year']);
    table.index('status');
    table.index('paid_date');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('rental_payments');
};
