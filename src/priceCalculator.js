/**
 * Price Calculator
 * Calculates booking prices with dynamic pricing, extra guest charges, and seasonal overrides
 * PRICING PRECEDENCE: Highest price wins if multiple rules overlap
 */

const db = require('./db');

/**
 * Calculate total booking price for a unit
 * Returns: { basePrice, extraGuestCharge, priceOverride, finalPrice, breakdown }
 */
async function calculatePrice(unitId, checkinDate, checkoutDate, totalGuests = 2) {
  try {
    // Get unit base price and extra guest charge
    const unit = await db('units')
      .where('id', unitId)
      .first(['id', 'base_price_kes', 'extra_guest_charge', 'type']);

    if (!unit) {
      return { error: 'Unit not found' };
    }

    // Calculate nights (exclusive of checkout date)
    const nights = Math.ceil(
      (new Date(checkoutDate) - new Date(checkinDate)) / (1000 * 60 * 60 * 24)
    );

    // Base price for stay
    const basePrice = unit.base_price_kes * nights;

    // Extra guest surcharge (B&B only, above 4 guests)
    let extraGuestCharge = 0;
    if (unit.type === 'bnb' && totalGuests > 4) {
      const extraGuests = totalGuests - 4;
      extraGuestCharge = extraGuests * unit.extra_guest_charge * nights;
    }

    // Check for pricing rules (seasonal overrides)
    // HIGHEST PRICE WINS: If multiple rules overlap, use the highest price
    const priceRules = await db('pricing_rules')
      .where('unit_id', unitId)
      .where('is_active', true)
      .where(function() {
        this.whereRaw('end_date > ?', [checkinDate])
            .whereRaw('start_date < ?', [checkoutDate]);
      })
      .orderBy('price_per_night_kes', 'desc');

    // Calculate override scenario (highest price wins principle)
    let highestOverridePrice = null;
    let appliedRule = null;

    if (priceRules.length > 0) {
      highestOverridePrice = priceRules[0].price_per_night_kes;
      appliedRule = priceRules[0];

      // Compare with base price - use highest
      if (highestOverridePrice > unit.base_price_kes) {
        // Override price is higher, use it
        const overriddenBasePrice = highestOverridePrice * nights;
        const finalPrice = overriddenBasePrice + extraGuestCharge;

        return {
          nights,
          basePrice: unit.base_price_kes * nights,
          overriddenBasePrice,
          overridePricePerNight: highestOverridePrice,
          appliedRule,
          extraGuestCharge,
          finalPrice,
          breakdown: {
            'Base Nights': `${nights}x @ ${highestOverridePrice} KES/night = ${overriddenBasePrice}`,
            'Extra Guests': extraGuestCharge > 0 ? `${Math.ceil(extraGuestCharge / nights)} guests × 800 KES/night × ${nights} nights = ${extraGuestCharge}` : 'None',
            'Total': finalPrice,
            'Applied Pricing Rule': appliedRule.reason || 'Seasonal override',
          },
        };
      }
    }

    // No override or base price is higher - use base price
    const finalPrice = basePrice + extraGuestCharge;

    return {
      nights,
      basePrice,
      overriddenBasePrice: null,
      overridePricePerNight: null,
      appliedRule: null,
      extraGuestCharge,
      finalPrice,
      breakdown: {
        'Base Nights': `${nights}x @ ${unit.base_price_kes} KES/night = ${basePrice}`,
        'Extra Guests': extraGuestCharge > 0 ? `+${extraGuestCharge} KES` : 'None',
        'Total': finalPrice,
      },
    };
  } catch (err) {
    console.error('[calculatePrice]', err.message);
    return { error: err.message };
  }
}

/**
 * Get applicable pricing rules for a unit within date range
 */
async function getPricingRules(unitId, startDate, endDate) {
  try {
    const rules = await db('pricing_rules')
      .where('unit_id', unitId)
      .where('is_active', true)
      .where(function() {
        this.whereRaw('end_date > ?', [startDate])
            .whereRaw('start_date < ?', [endDate]);
      })
      .orderBy('price_per_night_kes', 'desc');

    return rules;
  } catch (err) {
    console.error('[getPricingRules]', err.message);
    return [];
  }
}

/**
 * Validate calculated price (optional: for audit/security)
 */
async function validatePriceCalculation(unitId, checkinDate, checkoutDate, expectedTotal, totalGuests = 2) {
  const calc = await calculatePrice(unitId, checkinDate, checkoutDate, totalGuests);
  
  if (calc.error) {
    return { valid: false, error: calc.error };
  }

  // Allow 1% variance (for rounding errors)
  const variance = Math.abs(calc.finalPrice - expectedTotal) / expectedTotal;
  
  return {
    valid: variance <= 0.01,
    calculatedPrice: calc.finalPrice,
    expectedPrice: expectedTotal,
    variance: (variance * 100).toFixed(2) + '%',
    details: calc,
  };
}

module.exports = {
  calculatePrice,
  getPricingRules,
  validatePriceCalculation,
};
