const express = require('express');
const db = require('./db');
const h = require('./http');
const { publicProperties, publicUnits } = require('./websiteRoutes');
const { assertAvailable } = require('./bookingService');
const { calculatePrice, getPricingRules } = require('./priceCalculator');
const router = express.Router();
async function publicUnit(id) {
  const value = String(id || '');
  const row = await db('units').where(/^\d+$/.test(value) ? 'id' : 'unit_id', value).where('status', 'active').first();
  if (!row || !(await publicProperties()).some(p => p.property_id === row.property_id)) throw new h.HttpError(404, 'Unit not found');
  return row;
}
const unitData = u => ({ id: u.id, unitId: u.unit_id, name: u.name, basePriceKes: u.base_price_kes, extraGuestCharge: u.extra_guest_charge, minNightStay: u.min_night_stay, bedrooms: u.bedrooms, bathrooms: u.bathrooms, maxGuests: u.max_guests });
router.get('/properties', h.route(async (req, res) => res.json({ ok: true, data: await publicProperties() })));
router.get('/units', h.route(async (req, res) => res.json({ ok: true, data: await publicUnits(req.query.property_id) })));
router.get('/availability/:unitId', h.route(async (req, res) => {
  const u = await publicUnit(req.params.unitId), { startDate, endDate } = req.query;
  h.dateRange(startDate, endDate);
  const booked = await db('bookings').where('unit_id', u.id).where('checkin_date', '<', endDate).where('checkout_date', '>', startDate)
    .where(q => q.where('status', 'confirmed').orWhere(b => b.where('status', 'pending').where('created_at', '>', new Date(Date.now() - 900000))))
    .select('checkin_date', 'checkout_date');
  const blocks = await db('availability_blocks').where('unit_id', u.id).where('start_date', '<', endDate).where('end_date', '>', startDate).select('start_date', 'end_date');
  const leases = await db('rental_contracts').where('unit_id', u.id).whereIn('status', ['active', 'suspended']).where('start_date', '<', endDate).where(q => q.whereNull('end_date').orWhere('end_date', '>', startDate)).select('start_date', 'end_date');
  const rules = await getPricingRules(u.id, startDate, endDate);
  res.json({ ok: true, data: { unit: unitData(u), calendar: {
    startDate, endDate,
    bookedDates: [...booked.map(b => ({ checkin: b.checkin_date, checkout: b.checkout_date, status: 'unavailable' })), ...leases.map(l => ({ checkin: l.start_date, checkout: l.end_date || endDate, status: 'unavailable' }))],
    blockedDates: blocks.map(b => ({ start: b.start_date, end: b.end_date, type: 'blocked' })),
    pricingRules: rules.map(r => ({ startDate: r.start_date, endDate: r.end_date, pricePerNight: r.price_per_night_kes }))
  } } });
}));
router.post('/check-availability', h.route(async (req, res) => {
  const { unitId, checkinDate, checkoutDate } = req.body;
  const u = await publicUnit(unitId);
  const nights = h.dateRange(checkinDate, checkoutDate);
  const totalGuests = h.integer(1, u.max_guests).parse(req.body.totalGuests ?? 2);
  if (nights < u.min_night_stay) throw new h.HttpError(400, `Minimum stay is ${u.min_night_stay} nights`);
  try { await assertAvailable(db, u, checkinDate, checkoutDate); }
  catch (err) { if (err.status !== 409) throw err; return res.json({ ok: true, data: { isAvailable: false, reason: 'Dates unavailable', alternatives: [] } }); }
  res.json({ ok: true, data: { isAvailable: true, nights, totalGuests, pricing: await calculatePrice(u.id, checkinDate, checkoutDate, totalGuests) } });
}));
router.get('/pricing/:unitId', h.route(async (req, res) => {
  const u = await publicUnit(req.params.unitId), { startDate, endDate } = req.query;
  if (startDate || endDate) h.dateRange(startDate, endDate);
  res.json({ ok: true, data: { unit: unitData(u), rules: startDate ? await getPricingRules(u.id, startDate, endDate) : [] } });
}));
module.exports = router;
module.exports.publicUnit = publicUnit;
