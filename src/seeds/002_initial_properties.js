/**
 * Seed: Initial properties
 * Migrates existing hardcoded properties into database
 */

exports.seed = async function(knex) {
  // Delete existing properties (if reseeding)
  await knex('properties').del();

  // Insert initial properties
  await knex('properties').insert([
    {
      property_id: 'nyathira',
      name: 'Nyathira B&B',
      description: 'A comfortable bed and breakfast with mixed B&B and rental units',
      address: 'Nairobi',
      city: 'Nairobi',
      country: 'Kenya',
      contact_person: 'Irene',
      contact_phone: '+254700000000',
      email: 'nyathira@example.com',
      status: 'active',
    },
    {
      property_id: 'kibabu',
      name: 'Kibabu Lodge',
      description: 'A lodge property with B&B and rental accommodation options',
      address: 'Kiambu',
      city: 'Kiambu',
      country: 'Kenya',
      contact_person: 'Susan',
      contact_phone: '+254700000001',
      email: 'kibabu@example.com',
      status: 'active',
    }
  ]);
};
