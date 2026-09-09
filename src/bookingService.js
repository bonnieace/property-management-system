const crypto = require('node:crypto');
const db = require('./db');
const h = require('./http');
const { calculatePrice } = require('./priceCalculator');
async function assertAvailable(trx, unit, start, end, excludeId) {
  h.dateRange(start, end);
  if (unit.status !== 'active') throw new h.HttpError(409, 'This unit is not available');
  const booked = trx('bookings').where('unit_id', unit.id).where('checkin_date', '<', end).where('checkout_date', '>', start)
    .where(q => q.where('status', 'confirmed').orWhere(b => b.where('status', 'pending').where('created_at', '>', new Date(Date.now() - 15 * 60000))));
  if (excludeId) booked.whereNot('id', excludeId);
  const block = await trx('availability_blocks').where('unit_id', unit.id).where('start_date', '<', end).where('end_date', '>', start).first();
  const contract = await trx('rental_contracts').where('unit_id', unit.id).whereIn('status', ['active', 'suspended']).where('start_date', '<', end).where(q => q.whereNull('end_date').orWhere('end_date', '>', start)).first();
  if (await booked.first() || block || contract) throw new h.HttpError(409, 'This unit is unavailable for the selected dates');
}
async function createBooking(trx, unit, body, status = 'confirmed') {
  // Every booking/block/contract writer locks the same unit before checking dates.
  unit = await trx('units').where('id', unit.id).forUpdate().first();
  const start = body.checkin_date || body.checkinDate || body.checkin;
  const end = body.checkout_date || body.checkoutDate || body.checkout;
  const nights = h.dateRange(start, end);
  const guests = h.integer(1, unit.max_guests).parse(body.total_guests ?? body.guests ?? 2);
  if (nights < unit.min_night_stay) throw new h.HttpError(400, `Minimum stay is ${unit.min_night_stay} nights`);
  await assertAvailable(trx, unit, start, end);
  const pricing = await calculatePrice(unit.id, start, end, guests, trx);
  const [booking] = await trx('bookings').insert({
    id: crypto.randomUUID(), unit_id: unit.id, property_id: unit.property_id,
    guest_name: h.required(100).parse(body.guest_name || body.guestName),
    guest_phone: h.phone(body.guest_phone || body.guestPhone),
    guest_email: h.z.union([h.email, h.z.literal('')]).parse(body.guest_email || body.guestEmail || ''),
    checkin_date: start, checkout_date: end, nights, total_guests: guests, booking_type: unit.type === 'bnb' ? 'bnb' : 'rental',
    total_amount_kes: pricing.finalPrice, pricing_breakdown: JSON.stringify(pricing.breakdown),
    status, reference: `NYH-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
    notes: h.text(3000).parse(body.notes || '')
  }).returning('*');
  return booking;
}
module.exports = { assertAvailable, createBooking };
