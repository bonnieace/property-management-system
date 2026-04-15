/**
 * Migration: Create unit images table
 * Stores image URLs and metadata for units
 * Supports gallery (multiple images per unit) with primary image designation
 */

exports.up = function(knex) {
  return knex.schema.createTable('unit_images', function(table) {
    table.increments('id').primary();
    
    // Foreign key to units table
    table.integer('unit_id').unsigned().notNullable();
    table.foreign('unit_id').references('id').inTable('units').onDelete('CASCADE');
    
    // Image metadata
    table.text('image_url').notNullable();           // URL to image (local path or CDN)
    table.string('alt_text', 255).nullable();        // Alt text for accessibility
    table.integer('display_order').defaultTo(0);     // Order in gallery (0 = first/primary)
    table.boolean('is_primary').defaultTo(false);    // Flag for primary display image
    
    // Metadata
    table.timestamps(true, true);                    // created_at, updated_at
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('unit_images');
};
