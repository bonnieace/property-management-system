/**
 * Seed: Initial unit images
 * Populates primary images for all 9 units
 * Run after units are created
 */

exports.seed = async function(knex) {
  // First, clear existing images
  await knex('unit_images').del();

  // Get all units to map unit_id to database id
  const units = await knex('units').select('id', 'unit_id');

  // Create mapping for easier reference
  const unitMap = {};
  units.forEach(u => {
    unitMap[u.unit_id] = u.id;
  });

  // Image data: unit_id → image URL
  const images = [
    // Nyathira Square - B&B
    {
      unit_id: unitMap['bnb1b-nyathira'],
      image_url: 'https://nyathirahomes.com/assets/images/bnbsit.jpg',
      alt_text: '1-Bed B&B Suite at Nyathira Square',
      is_primary: true,
      display_order: 0
    },
    {
      unit_id: unitMap['bnb2b-nyathira'],
      image_url: 'https://nyathirahomes.com/assets/images/DSC_0544.webp',
      alt_text: '2-Bed B&B Suite at Nyathira Square',
      is_primary: true,
      display_order: 0
    },

    // Nyathira Square - Rental
    {
      unit_id: unitMap['bedsit-nyathira'],
      image_url: 'https://nyathirahomes.com/assets/images/DSC_0595.webp',
      alt_text: 'Bedsitter at Nyathira Square',
      is_primary: true,
      display_order: 0
    },
    {
      unit_id: unitMap['1bed-nyathira'],
      image_url: 'https://nyathirahomes.com/assets/images/DSC_0665.webp',
      alt_text: '1-Bedroom Apartment at Nyathira Square',
      is_primary: true,
      display_order: 0
    },
    {
      unit_id: unitMap['2bed-nyathira'],
      image_url: 'https://nyathirahomes.com/assets/images/DSC_0593.webp',
      alt_text: '2-Bedroom Apartment at Nyathira Square',
      is_primary: true,
      display_order: 0
    },

    // Kibabu Square - B&B
    {
      unit_id: unitMap['bnb2b-kibabu'],
      image_url: 'https://nyathirahomes.com/assets/images/DSC_0622.webp',
      alt_text: '2-Bed B&B Suite at Kibabu Square',
      is_primary: true,
      display_order: 0
    },

    // Kibabu Square - Rental
    {
      unit_id: unitMap['bedsit-kibabu'],
      image_url: 'https://nyathirahomes.com/assets/images/DSC_0700.webp',
      alt_text: 'Bedsitter at Kibabu Square',
      is_primary: true,
      display_order: 0
    },
    {
      unit_id: unitMap['1bed-kibabu'],
      image_url: 'https://nyathirahomes.com/assets/images/DSC_0654.webp',
      alt_text: '1-Bedroom Apartment at Kibabu Square',
      is_primary: true,
      display_order: 0
    },
    {
      unit_id: unitMap['2bed-kibabu'],
      image_url: 'https://nyathirahomes.com/assets/images/DSC_0647.webp',
      alt_text: '2-Bedroom Apartment at Kibabu Square',
      is_primary: true,
      display_order: 0
    }
  ];

  // Filter out any undefined unit_ids (in case a unit doesn't exist)
  const validImages = images.filter(img => img.unit_id !== undefined);

  if (validImages.length > 0) {
    await knex('unit_images').insert(validImages);
    console.log(`✓ Seeded ${validImages.length} unit images`);
  } else {
    console.warn('⚠ No images seeded - units may not exist yet');
  }
};
