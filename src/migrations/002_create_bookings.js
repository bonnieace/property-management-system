/**
 * Migration: Create bookings table
 * Stores booking records linked to M-Pesa payments
 */

exports.up = function(knex) {
  return knex.schema.createTable('bookings', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Unit & property references
    table.integer('unit_id').unsigned().notNullable().references('id').inTable('units').onDelete('CASCADE');
    table.string('property_id', 20).notNullable();
    
    // Guest info
    table.string('guest_name', 100).notNullable();
    table.string('guest_email', 100).notNullable();
    table.string('guest_phone', 20).notNullable();
    
    // Booking dates
    table.date('checkin_date').notNullable();
    table.date('checkout_date').notNullable();
    table.integer('nights').notNullable();
    table.integer('total_guests').notNullable();
    
    // Booking type
    table.enu('booking_type', ['bnb', 'rental']).notNullable();
    
    // Pricing
    table.integer('total_amount_kes').notNullable();       // Total booking amount in KES
    table.text('pricing_breakdown').nullable();            // JSON: {basePrice, extraGuestCharge, total, notes}
    
    // Payment status
    table.enu('status', ['pending', 'confirmed', 'failed', 'expired', 'cancelled']).defaultTo('pending');
    
    // M-Pesa data
    table.string('reference', 50).unique().nullable();     // e.g., 'NYH-ABC123'
    table.string('checkout_request_id', 100).nullable();   // Safaricom STK push request ID
    table.string('mpesa_receipt_number', 50).nullable();   // M-Pesa receipt after payment
    table.string('mpesa_phone', 20).nullable();            // Phone used for M-Pesa
    
    // Booking notes
    table.text('notes').nullable();
    
    // Timestamps
    table.timestamps(true, true);
    
    // Indexes for common queries
    table.index('unit_id');
    table.index('property_id');
    table.index('checkin_date');
    table.index('checkout_date');
    table.index('status');
    table.index('guest_phone');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('bookings');
};
