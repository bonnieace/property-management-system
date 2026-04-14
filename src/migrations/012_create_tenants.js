/**
 * Migration: Create tenants table
 * Stores persistent tenant records (one-time creation per tenant)
 * Lookup key: tenant_phone (for repeat payments without re-entering data)
 */

exports.up = function(knex) {
  return knex.schema.createTable('tenants', function(table) {
    table.increments('id').primary();
    
    // Primary lookup key
    table.string('tenant_phone', 20).unique().notNullable();
    
    // Tenant info
    table.string('tenant_name', 100).notNullable();
    table.string('tenant_email', 100).nullable();
    table.string('id_number', 50).nullable();                     // National ID
    
    // Next of kin
    table.string('next_of_kin_phone', 20).nullable();
    table.string('next_of_kin_name', 100).nullable();
    
    // Notes
    table.text('notes').nullable();
    
    // Timestamps
    table.timestamps(true, true);
    
    // Indexes for lookups
    table.index('tenant_phone');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('tenants');
};
