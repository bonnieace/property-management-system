/**
 * Seed: Initial units and properties data
 * Seeds all B&B and rental units from hardcoded data
 */

exports.seed = async function(knex) {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Demo seeding is disabled. Use the onboarding flow; set ALLOW_DEMO_SEED=true only for an empty disposable development database.');
  // Clear existing data
  await knex('units').del();
  
  // Seed units data
  const units = [
    // ──────────────────────────────────────────────────────────────────
    // NYATHIRA SQUARE — B&B UNITS
    // ──────────────────────────────────────────────────────────────────
    {
      unit_id: 'bnb1b-nyathira',
      property_id: 'nyathira',
      type: 'bnb',
      name: '1-Bedroom B&B Suite',
      description: 'Spacious 1-bed, 1-bath B&B suite with free daily breakfast, Wi-Fi, and Smart TV',
      bedrooms: 1,
      bathrooms: 1,
      max_guests: 4,
      base_price_kes: 2000,
      extra_guest_charge: 800,
      water_deposit_kes: 0,
      min_night_stay: 1,
      status: 'active',
    },
    {
      unit_id: 'bnb2b-nyathira',
      property_id: 'nyathira',
      type: 'bnb',
      name: '2-Bedroom B&B Suite',
      description: 'Spacious 2-bed, 1-bath B&B suite with balcony views, free daily breakfast, Wi-Fi, and Smart TV',
      bedrooms: 2,
      bathrooms: 1,
      max_guests: 4,
      base_price_kes: 3000,
      extra_guest_charge: 800,
      water_deposit_kes: 0,
      min_night_stay: 1,
      status: 'active',
    },
    
    // ──────────────────────────────────────────────────────────────────
    // NYATHIRA SQUARE — RENTAL UNITS
    // ──────────────────────────────────────────────────────────────────
    {
      unit_id: 'bedsit-nyathira',
      property_id: 'nyathira',
      type: 'bedsit',
      name: 'Bedsitter Apartment',
      description: 'Studio bedsitter with 1 bathroom and kitchen. Includes 2,500 KES water deposit and 1-month security deposit.',
      bedrooms: 0,  // Studio
      bathrooms: 1,
      max_guests: 2,
      base_price_kes: 6500,
      extra_guest_charge: 0,
      water_deposit_kes: 2500,
      min_night_stay: 180,  // 6 months minimum
      status: 'active',
    },
    {
      unit_id: '1bed-nyathira',
      property_id: 'nyathira',
      type: '1bed',
      name: '1-Bedroom Apartment',
      description: '1 bedroom, 1 bathroom with kitchen. Includes 2,500 KES water deposit and 1-month security deposit.',
      bedrooms: 1,
      bathrooms: 1,
      max_guests: 2,
      base_price_kes: 12000,
      extra_guest_charge: 0,
      water_deposit_kes: 2500,
      min_night_stay: 180,  // 6 months minimum
      status: 'active',
    },
    {
      unit_id: '2bed-nyathira',
      property_id: 'nyathira',
      type: '2bed',
      name: '2-Bedroom Apartment',
      description: '2 bedrooms, 2 bathrooms with kitchen. Includes 2,500 KES water deposit and 1-month security deposit.',
      bedrooms: 2,
      bathrooms: 2,
      max_guests: 4,
      base_price_kes: 13500,
      extra_guest_charge: 0,
      water_deposit_kes: 2500,
      min_night_stay: 180,  // 6 months minimum
      status: 'active',
    },
    
    // ──────────────────────────────────────────────────────────────────
    // KIBABU SQUARE — B&B UNITS
    // ──────────────────────────────────────────────────────────────────
    {
      unit_id: 'bnb2b-kibabu',
      property_id: 'kibabu',
      type: 'bnb',
      name: '2-Bedroom B&B Suite',
      description: '2-bed, 1-bath B&B suite with 24/7 security, free parking, balcony views, free daily breakfast, Wi-Fi, and Smart TV',
      bedrooms: 2,
      bathrooms: 1,
      max_guests: 4,
      base_price_kes: 3000,
      extra_guest_charge: 800,
      water_deposit_kes: 0,
      min_night_stay: 1,
      status: 'active',
    },
    
    // ──────────────────────────────────────────────────────────────────
    // KIBABU SQUARE — RENTAL UNITS
    // ──────────────────────────────────────────────────────────────────
    {
      unit_id: 'bedsit-kibabu',
      property_id: 'kibabu',
      type: 'bedsit',
      name: 'Bedsitter Apartment',
      description: 'Studio bedsitter with 1 bathroom and kitchen. Includes 2,500 KES water deposit and 1-month security deposit.',
      bedrooms: 0,  // Studio
      bathrooms: 1,
      max_guests: 2,
      base_price_kes: 6500,
      extra_guest_charge: 0,
      water_deposit_kes: 2500,
      min_night_stay: 180,  // 6 months minimum
      status: 'active',
    },
    {
      unit_id: '1bed-kibabu',
      property_id: 'kibabu',
      type: '1bed',
      name: '1-Bedroom Apartment',
      description: '1 bedroom, 1 bathroom with kitchen. Includes 2,500 KES water deposit and 1-month security deposit.',
      bedrooms: 1,
      bathrooms: 1,
      max_guests: 2,
      base_price_kes: 12000,
      extra_guest_charge: 0,
      water_deposit_kes: 2500,
      min_night_stay: 180,  // 6 months minimum
      status: 'active',
    },
    {
      unit_id: '2bed-kibabu',
      property_id: 'kibabu',
      type: '2bed',
      name: '2-Bedroom Apartment',
      description: '2 bedrooms, 2 bathrooms with kitchen. Includes 2,500 KES water deposit and 1-month security deposit.',
      bedrooms: 2,
      bathrooms: 2,
      max_guests: 4,
      base_price_kes: 13500,
      extra_guest_charge: 0,
      water_deposit_kes: 2500,
      min_night_stay: 180,  // 6 months minimum
      status: 'active',
    },
  ];

  // Insert units
  await knex('units').insert(units);
  console.log(`✓ Seeded ${units.length} units successfully`);
};
