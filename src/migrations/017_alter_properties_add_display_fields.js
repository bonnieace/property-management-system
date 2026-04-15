/**
 * Migration: Add property details fields
 * Extends properties table with display fields for the public website
 */

exports.up = function(knex) {
  return knex.schema.alterTable('properties', function(table) {
    // Display fields
    table.string('tagline', 200).nullable();           // Short hero subtitle
    table.json('features').nullable();                 // Array of amenities/features
    table.text('hero_image_url').nullable();           // Main property image
    table.string('maps_url', 500).nullable();          // Google Maps link
    
    // Coordinates for future map integration
    table.decimal('latitude', 10, 8).nullable();
    table.decimal('longitude', 11, 8).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('properties', function(table) {
    table.dropColumn('tagline');
    table.dropColumn('features');
    table.dropColumn('hero_image_url');
    table.dropColumn('maps_url');
    table.dropColumn('latitude');
    table.dropColumn('longitude');
  });
};
