/**
 * Seed: Initial properties
 * Migrates existing hardcoded properties into database
 */

exports.seed = async function(knex) {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Demo seeding is disabled. Use the onboarding flow; set ALLOW_DEMO_SEED=true only for an empty disposable development database.');
  // Delete existing properties (if reseeding)
  await knex('properties').del();

  // Insert initial properties with all display fields
  await knex('properties').insert([
    {
      property_id: 'nyathira',
      name: 'Nyathira Square',
      description: 'Spacious B&B and rental apartments set right on the main road in Ngoigwa — easy access, CCTC security, free daily breakfast for B&B guests, and beautiful balcony views.',
      tagline: 'Cozy escape along the tarmac, Ngoigwa',
      address: 'Ngoigwa, Thika',
      city: 'Thika',
      country: 'Kenya',
      contact_person: 'Irene',
      contact_phone: '+254724211871',
      email: 'irene@nyathira.example.com',
      features: JSON.stringify([
        'Free daily breakfast (B&B)',
        'Fully equipped kitchen',
        'Fast Wi-Fi & Smart TV',
        'CCTV + secure parking',
        'Balcony with garden view',
        'Microwave, cooker & fridge'
      ]),
      hero_image_url: 'https://nyathirahomes.com/assets/images/DSC_0544.webp',
      maps_url: 'https://www.google.com/maps/place/NYATHIRA+SQUARE+APARTMENT/@-1.0381416,37.0300593',
      latitude: -1.0381416,
      longitude: 37.0300593,
      status: 'active',
    },
    {
      property_id: 'kibabu',
      name: 'Kibabu Square',
      description: '2 km from Ananas Mall, 1.6 km from MKU. Peaceful environment, high cleanliness standards, 24/7 security and parking available for all tenants and guests.',
      tagline: 'Comfortable & convenient, central Thika',
      address: 'Kibabu, Thika',
      city: 'Thika',
      country: 'Kenya',
      contact_person: 'Susan',
      contact_phone: '+254724101548',
      email: 'susan@kibabu.example.com',
      features: JSON.stringify([
        '24/7 security on-site',
        'Ample parking',
        'High cleanliness standards',
        'Quiet, peaceful setting',
        'Near Ananas Mall (2 km)',
        'Near MKU campus (1.6 km)'
      ]),
      hero_image_url: 'https://nyathirahomes.com/assets/images/DSC_0617.webp',
      maps_url: 'https://www.google.com/maps/place/Kibabu+Square/@-1.062158,37.1214928',
      latitude: -1.062158,
      longitude: 37.1214928,
      status: 'active',
    }
  ]);
};
