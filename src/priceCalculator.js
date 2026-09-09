const db = require('./db');
const { dateRange, integer, HttpError } = require('./http');
async function calculatePrice(unitId, checkinDate, checkoutDate, totalGuests = 2, connection = db) {
  const unit = await connection('units').where('id', unitId).first();
  if (!unit) throw new HttpError(404, 'Unit not found');
  const nights = dateRange(checkinDate, checkoutDate);
  integer(1, unit.max_guests).parse(totalGuests);
  const rules = await getPricingRules(unitId, checkinDate, checkoutDate, connection);
  const daily = [];
  for (let i = 0; i < nights; i++) {
    const date = new Date(Date.parse(checkinDate) + i * 86400000).toISOString().slice(0, 10);
    const applicable = rules.filter(r => String(r.start_date).slice(0, 10) <= date && String(r.end_date).slice(0, 10) > date);
    const rate = Math.max(unit.base_price_kes, ...applicable.map(r => r.price_per_night_kes));
    daily.push({ date, rate });
  }
  const basePrice = unit.base_price_kes * nights;
  const pricedNights = daily.reduce((sum, d) => sum + d.rate, 0);
  const extraGuestCharge = unit.type === 'bnb' ? Math.max(0, totalGuests - 4) * unit.extra_guest_charge * nights : 0;
  const finalPrice = pricedNights + extraGuestCharge;
  return { nights, basePrice, extraGuestCharge, finalPrice, daily, breakdown: { 'Nightly charges': pricedNights, 'Extra guests': extraGuestCharge, Total: finalPrice } };
}
async function getPricingRules(unitId, startDate, endDate, connection = db) {
  return connection('pricing_rules').where({ unit_id: unitId, is_active: true }).where('end_date', '>', startDate).where('start_date', '<', endDate).orderBy('price_per_night_kes', 'desc');
}
async function validatePriceCalculation(unitId, start, end, expected, guests = 2) {
  const details = await calculatePrice(unitId, start, end, guests);
  return { valid: details.finalPrice === expected, calculatedPrice: details.finalPrice, expectedPrice: expected, details };
}
module.exports = { calculatePrice, getPricingRules, validatePriceCalculation };
