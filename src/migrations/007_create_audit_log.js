/**
 * Migration: Create audit_log table
 * Stores M-Pesa transaction history and payment audit trail
 */

exports.up = function(knex) {
  return knex.schema.createTable('audit_log', function(table) {
    table.increments('id').primary();
    
    // Booking reference
    table.uuid('booking_id').nullable().references('id').inTable('bookings').onDelete('SET NULL');
    
    // Transaction type
    table.enu('transaction_type', ['initiated', 'callback', 'confirmed', 'failed', 'timeout', 'retry']).notNullable();
    
    // M-Pesa data
    table.string('checkout_request_id', 100).nullable();
    table.string('mpesa_phone', 20).nullable();
    table.integer('amount_kes').nullable();
    
    // Status
    table.integer('result_code').nullable();               // 0 = success, other = error code
    table.string('result_desc', 255).nullable();           // Error description from Safaricom
    
    // Response details (raw JSON from Safaricom)
    table.jsonb('response_data').nullable();
    
    // Metadata
    table.string('request_id', 100).nullable();            // Unique request identifier
    table.text('notes').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes for audit trail queries
    table.index('booking_id');
    table.index('transaction_type');
    table.index('result_code');
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('audit_log');
};
