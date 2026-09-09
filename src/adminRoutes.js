const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const h = require('./http');
const auth = require('./adminAuth');
const a = require('./propertyScope');
const workspace = require('./workspaceRoutes');
const bookings = require('./bookingService');
const payments = require('./paymentService');
const router = express.Router();
const ok = (res, data) => res.json({ ok: true, data });
router.post('/login', h.rateLimit('login-ip', 50), h.rateLimit('login-user', 10, 900000, req => String(req.body.username || '').toLowerCase()), h.route(async (req, res) => {
  const username = h.required(50).parse(req.body.username);
  const password = h.z.string().min(1).max(72).parse(req.body.password);
  res.json({ ok: true, user: await auth.authenticateUser(username, password, res) });
}));
router.post('/logout', h.route(auth.logout));
router.use(workspace.router);
router.use(auth.adminAuthMiddleware);
router.post('/verify', (req, res) => res.json({ ok: true, user: req.admin }));
router.post('/account/password', h.route(async (req, res) => {
  const current = h.z.string().min(1).max(72).parse(req.body.current_password);
  const password = h.password.parse(req.body.password);
  const account = await db('admin_users').where('id', req.admin.id).first();
  if (!await bcrypt.compare(current, account.password_hash)) throw new h.HttpError(400, 'Current password is incorrect');
  await db.transaction(async trx => {
    await trx('admin_users').where('id', account.id).update({ password_hash: await bcrypt.hash(password, 12) });
    await trx('admin_sessions').where('admin_id', account.id).delete();
  });
  res.json({ ok: true, user: await auth.createSession(account.id, res) });
}));
router.get('/dashboard', h.route(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const monthEnd = new Date(Date.UTC(Number(today.slice(0,4)), Number(today.slice(5,7)), 1)).toISOString().slice(0,10);
  const bnb = () => a.scope(db('bookings'), req).where({ status: 'confirmed', booking_type: 'bnb' });
  const [summary, rent, contracts, recent, upcoming, chart, units, stays, leases] = await Promise.all([
    bnb().count('* as count').sum('total_amount_kes as value').first(),
    a.unitScope(db('rental_payments'), req).sum('amount_paid_kes as value').first(),
    a.scope(db('rental_contracts'), req).where('status','active').count('* as count').first(),
    bnb().orderBy('created_at','desc').limit(5),
    bnb().where('checkin_date','>=',today).orderBy('checkin_date').limit(5),
    bnb().where('created_at','>=',`${today.slice(0,4)}-01-01`).select('created_at','checkin_date','total_amount_kes','booking_type'),
    a.scope(db('units'), req).select('id','name','type'),
    a.scope(db('bookings'), req).where('status','confirmed').where('checkin_date','<',monthEnd).where('checkout_date','>',monthStart).select('unit_id','checkin_date as start','checkout_date as end'),
    a.scope(db('rental_contracts'), req).whereIn('status',['active','suspended']).where('start_date','<',monthEnd).where(q=>q.whereNull('end_date').orWhere('end_date','>',monthStart)).select('unit_id','start_date as start','end_date as end')
  ]);
  const days = (Date.parse(monthEnd)-Date.parse(monthStart))/86400000;
  const occupancy = units.map(unit => {
    const occupied = new Set();
    for (const stay of [...stays,...leases].filter(s=>s.unit_id===unit.id)) {
      const start = Math.max(Date.parse(stay.start),Date.parse(monthStart));
      const end = Math.min(Date.parse(stay.end || monthEnd),Date.parse(monthEnd));
      for(let day=start;day<end;day+=86400000) occupied.add(day);
    }
    return {...unit, percentage:Math.round(occupied.size/days*100)};
  });
  ok(res, { bookings:Number(summary.count), bookingValue:Number(summary.value||0), activeLeases:Number(contracts.count), rentReceived:Number(rent.value||0), recent, upcoming, chart, occupancy });
}));
router.get('/properties', h.route(async (req, res) => {
  const query = a.scope(db('properties'), req);
  if (req.query.status) query.where('status', h.z.enum(['active', 'inactive']).parse(req.query.status));
  ok(res, await query.orderBy('name'));
}));
router.put('/properties/:id', h.route(async (req, res) => {
  const p = await a.property(req, req.params.id, true);
  const updates = h.patchSchema(workspace.propertySchema.omit({ property_id: true }).extend({
    description: h.text(3000), country: h.text(50), contact_person: h.text(100), email: h.z.union([h.email, h.z.literal('')]), status: h.z.enum(['active', 'inactive'])
  })).parse(req.body);
  if (updates.status === 'inactive' && req.admin.role !== 'full_admin') throw new h.HttpError(403, 'Contact the platform administrator to deactivate a property');
  const [data] = await db('properties').where('id', p.id).update({ ...updates, updated_at: db.fn.now() }).returning('*');
  await a.activity(req, 'property.updated', p.property_id); ok(res, data);
}));
const unitSchema = h.z.object({
  unit_id: h.z.string().regex(/^[a-z0-9][a-z0-9-]{1,49}$/), property_id: h.slug,
  type: h.z.enum(['bnb', 'bedsit', '1bed', '2bed']), name: h.required(100), description: h.text(3000).default(''),
  bedrooms: h.integer(0, 30), bathrooms: h.integer(0, 30), max_guests: h.integer(1, 100).default(4),
  base_price_kes: h.integer(1), extra_guest_charge: h.integer().default(800), water_deposit_kes: h.integer().default(0),
  min_night_stay: h.integer(1, 366).default(1), status: h.z.enum(['active', 'inactive', 'maintenance']).default('active')
});
router.get('/units', h.route(async (req, res) => {
  const query = a.scope(db('units'), req);
  for (const key of ['status', 'type', 'id']) if (req.query[key]) query.where(key, req.query[key]);
  const data = await query.orderBy('name');
  const images = await db('unit_images').whereIn('unit_id', data.map(u => u.id)).orderBy('display_order');
  ok(res, data.map(u => ({ ...u, images: images.filter(i => i.unit_id === u.id) })));
}));
router.post('/units', h.route(async (req, res) => {
  const input = unitSchema.parse(req.body); await a.property(req, input.property_id);
  const [data] = await db('units').insert(input).returning('*');
  await a.activity(req, 'unit.created', data.property_id, data.id); res.status(201); ok(res, data);
}));
router.put('/units/:id', h.route(async (req, res) => {
  const unit = await a.unit(req, req.params.id);
  const input = h.patchSchema(unitSchema.omit({ unit_id: true })).parse(req.body);
  if (input.property_id && input.property_id !== unit.property_id) throw new h.HttpError(400, 'A unit cannot be moved between properties');
  const [data] = await db('units').where('id', unit.id).update({ ...input, updated_at: db.fn.now() }).returning('*');
  ok(res, data);
}));
router.put('/units/:id/images', h.route(async (req, res) => {
  const unit = await a.unit(req, req.params.id);
  const images = h.z.array(h.z.object({ image_url: h.url.refine(v => !!v), alt_text: h.text(255).default('') })).max(20).parse(req.body.images);
  await db.transaction(async trx => {
    await trx('units').where('id', unit.id).forUpdate().first();
    await trx('unit_images').where('unit_id', unit.id).delete();
    if (images.length) await trx('unit_images').insert(images.map((i, index) => ({ ...i, unit_id: unit.id, display_order: index, is_primary: index === 0 })));
  });
  ok(res, await db('unit_images').where('unit_id', unit.id).orderBy('display_order'));
}));
for (const [path, table] of [['pricing-rules', 'pricing_rules'], ['blocked-dates', 'availability_blocks']]) {
  router.get(`/${path}`, h.route(async (req, res) => {
    const query = a.unitScope(db(table), req);
    if (req.query.unitId) query.where('unit_id', (await a.unit(req, req.query.unitId)).id);
    if (req.query.startDate) query.where('end_date', '>', h.date.parse(req.query.startDate));
    if (req.query.endDate) query.where('start_date', '<', h.date.parse(req.query.endDate));
    if (path === 'pricing-rules' && req.query.isActive) query.where('is_active', req.query.isActive === 'true');
    ok(res, await query.orderBy('start_date'));
  }));
  router.post(`/${path}`, h.route(async (req, res) => {
    const unit = await a.unit(req, req.body.unitId);
    const start_date = h.date.parse(req.body.startDate), end_date = h.date.parse(req.body.endDate);
    h.dateRange(start_date, end_date);
    const input = { unit_id: unit.id, start_date, end_date, reason: h.text(200).parse(req.body.reason || '') };
    if (path === 'pricing-rules') input.price_per_night_kes = h.integer(1).parse(req.body.pricePerNightKes);
    const data = await db.transaction(async trx => {
      await trx('units').where('id', unit.id).forUpdate().first();
      if (path === 'blocked-dates') await bookings.assertAvailable(trx, unit, start_date, end_date);
      return (await trx(table).insert(input).returning('*'))[0];
    });
    res.status(201).json({ ok: true, id: data.id, data });
  }));
  router.delete(`/${path}/:id`, h.route(async (req, res) => {
    await a.record(req, table, req.params.id); await db(table).where('id', req.params.id).delete(); res.json({ ok: true });
  }));
}
router.put('/pricing-rules/:id', h.route(async (req, res) => {
  const r = await a.record(req, 'pricing_rules', req.params.id);
  const input = h.z.object({ pricePerNightKes: h.integer(1), reason: h.text(200), isActive: h.z.boolean() }).partial().parse(req.body);
  const update = { updated_at: db.fn.now() };
  if (input.pricePerNightKes !== undefined) update.price_per_night_kes = input.pricePerNightKes;
  if (input.isActive !== undefined) update.is_active = input.isActive;
  if (input.reason !== undefined) update.reason = input.reason;
  await db('pricing_rules').where('id', r.id).update(update); res.json({ ok: true });
}));
router.get('/bookings', h.route(async (req, res) => {
  const query = a.scope(db('bookings'), req);
  const q = req.query;
  if (q.status) query.where('status', h.z.enum(['pending', 'confirmed', 'failed', 'expired', 'cancelled']).parse(q.status));
  if (q.unitId) query.where('unit_id', (await a.unit(req, q.unitId)).id);
  if (q.bookingType) query.where('booking_type', h.z.enum(['bnb', 'rental']).parse(q.bookingType));
  if (q.phone) query.where('guest_phone', 'like', `%${h.text(20).parse(q.phone)}%`);
  if (q.startDate || q.dateFrom) query.where('checkout_date', '>', h.date.parse(q.startDate || q.dateFrom));
  if (q.endDate || q.dateTo) query.where('checkin_date', '<', h.date.parse(q.endDate || q.dateTo));
  const { limit, offset } = h.page(q);
  const total = Number((await query.clone().count('id as count').first()).count);
  const data = await query.orderBy('checkin_date', 'desc').limit(limit).offset(offset);
  res.json({ ok: true, data: data.map(b => ({ ...b, booking_ref: b.reference, total_kes: b.total_amount_kes })), total, count: data.length, limit, offset });
}));
router.get('/bookings/:id', h.route(async (req, res) => {
  const b = await a.record(req, 'bookings', h.z.uuid().parse(req.params.id));
  const auditTrail = await db('audit_log').where('booking_id', b.id).orderBy('created_at', 'desc');
  ok(res, { ...b, booking_ref: b.reference, total_kes: b.total_amount_kes, auditTrail });
}));
router.get('/bookings/:id/audit', h.route(async (req, res) => {
  const b = await a.record(req, 'bookings', h.z.uuid().parse(req.params.id));
  ok(res, await db('audit_log').where('booking_id', b.id).orderBy('created_at', 'desc'));
}));
router.post('/bookings', h.route(async (req, res) => {
  const unit = await a.unit(req, req.body.unitId || req.body.unit_id);
  if (req.body.property_id && req.body.property_id !== unit.property_id) throw new h.HttpError(400, 'Unit and property do not match');
  const data = await db.transaction(async trx => {
    const b = await bookings.createBooking(trx, unit, req.body);
    await a.activity(req, 'booking.created', unit.property_id, b.id, trx); return b;
  });
  res.status(201).json({ ok: true, id: data.id, data });
}));
router.put('/bookings/:id', h.route(async (req, res) => {
  const b = await a.record(req, 'bookings', h.z.uuid().parse(req.params.id));
  const input = h.z.object({ status: h.z.enum(['confirmed', 'cancelled']), notes: h.text(3000), adminNotes: h.text(3000), guest_name: h.required(100), guest_phone: h.text(20), guest_email: h.z.union([h.email, h.z.literal('')]), checkin_date: h.date, checkout_date: h.date, total_guests: h.integer(1, 100) }).partial().parse(req.body);
  if (input.adminNotes !== undefined) { input.admin_notes = input.adminNotes; delete input.adminNotes; }
  if (input.guest_phone) input.guest_phone = h.phone(input.guest_phone);
  const data = await db.transaction(async trx => {
    const unit = await trx('units').where('id', b.unit_id).forUpdate().first();
    const current = await trx('bookings').where('id', b.id).forUpdate().first();
    if (input.status === 'confirmed' && current.status !== 'confirmed' && current.checkout_request_id) throw new h.HttpError(409, 'M-Pesa bookings are confirmed by payment verification');
    const changedDates = input.checkin_date !== undefined && input.checkin_date !== current.checkin_date || input.checkout_date !== undefined && input.checkout_date !== current.checkout_date || input.total_guests !== undefined && input.total_guests !== current.total_guests;
    const guests = input.total_guests ?? current.total_guests;
    if (guests > unit.max_guests) throw new h.HttpError(400, 'Guest count exceeds unit capacity');
    const nights = h.dateRange(input.checkin_date || current.checkin_date, input.checkout_date || current.checkout_date);
    if (nights < unit.min_night_stay) throw new h.HttpError(400, 'This stay is shorter than the unit minimum');
    if (changedDates && current.checkout_request_id) throw new h.HttpError(409, 'Paid reservation dates require a separate adjustment; do not overwrite the payment record');
    if ((input.status || current.status) === 'confirmed') await bookings.assertAvailable(trx, unit, input.checkin_date || current.checkin_date, input.checkout_date || current.checkout_date, b.id);
    if (changedDates) {
      const quote = await require('./priceCalculator').calculatePrice(unit.id, input.checkin_date || current.checkin_date, input.checkout_date || current.checkout_date, input.total_guests || current.total_guests, trx);
      input.nights = quote.nights; input.total_amount_kes = quote.finalPrice; input.pricing_breakdown = JSON.stringify(quote.breakdown);
    }
    const [saved] = await trx('bookings').where('id', b.id).update({ ...input, updated_at: trx.fn.now() }).returning('*');
    await a.activity(req, 'booking.updated', b.property_id, b.id, trx); return saved;
  });
  ok(res, data);
}));
router.delete('/bookings/:id', h.route(async (req, res) => {
  const b = await a.record(req, 'bookings', h.z.uuid().parse(req.params.id));
  await db.transaction(async trx => {
    await trx('units').where('id', b.unit_id).forUpdate().first();
    await trx('bookings').where('id', b.id).update({ status: 'cancelled', updated_at: trx.fn.now() });
    await a.activity(req, 'booking.cancelled', b.property_id, b.id, trx);
  });
  res.json({ ok: true, message: 'Booking cancelled. Any refund must be handled separately.' });
}));
router.get('/waitlist', h.route(async (req, res) => {
  const query = a.unitScope(db('waitlist'), req);
  if (req.query.unitId) query.where('unit_id', (await a.unit(req, req.query.unitId)).id);
  if (req.query.status) query.where('notified', req.query.status === 'notified');
  const { limit, offset } = h.page(req.query);
  const data = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);
  res.json({ ok: true, data, count: data.length });
}));
router.post('/waitlist/:id/notify', h.route(async (req, res) => {
  await a.record(req, 'waitlist', req.params.id);
  throw new h.HttpError(503, 'Automatic notifications are not configured. Contact the guest using their listed number.');
}));
router.get('/audit-log', h.route(async (req, res) => {
  const query = db('audit_log').whereIn('booking_id', a.scope(db('bookings').select('id'), req));
  if (req.query.bookingId) query.where('booking_id', h.z.uuid().parse(req.query.bookingId));
  if (req.query.eventType) query.where('transaction_type', h.text(30).parse(req.query.eventType));
  const { limit, offset } = h.page(req.query);
  const data = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);
  ok(res, data.map(r => ({ ...r, event_type: r.transaction_type, event_data: r.response_data })));
}));
router.get('/activity', h.route(async (req, res) => {
  const { limit, offset } = h.page(req.query);
  ok(res, await a.scope(db('property_activity'), req).orderBy('created_at', 'desc').limit(limit).offset(offset));
}));
const tenantSchema = h.z.object({ tenant_name: h.required(100), tenant_phone: h.text(20).transform(h.phone), tenant_email: h.z.union([h.email, h.z.literal('')]).nullable().default(null), id_number: h.text(50).nullable().default(null), next_of_kin_phone: h.text(20).nullable().default(null), next_of_kin_name: h.text(100).nullable().default(null), notes: h.text(3000).nullable().default(null) });
router.get('/tenants', h.route(async (req, res) => {
  const { limit, offset } = h.page(req.query);
  ok(res, await a.scope(db('tenants'), req).orderBy('tenant_name').limit(limit).offset(offset));
}));
router.post('/tenants', h.route(async (req, res) => {
  const p = await a.property(req, req.body.property_id || a.requestedProperty(req));
  const input = tenantSchema.parse(req.body);
  const [data] = await db('tenants').insert({ ...input, property_id: p.property_id }).returning('*');
  res.status(201); ok(res, data);
}));
router.get('/tenants/:phone', h.route(async (req, res) => {
  const data = await a.scope(db('tenants'), req).where('tenant_phone', h.phone(req.params.phone)).first();
  if (!data) throw new h.HttpError(404, 'Tenant not found'); ok(res, data);
}));
router.put('/tenants/:id', h.route(async (req, res) => {
  const tenant = await a.record(req, 'tenants', h.integer(1).parse(req.params.id));
  const input = h.patchSchema(tenantSchema).parse(req.body);
  const [data] = await db('tenants').where('id', tenant.id).update({ ...input, updated_at: db.fn.now() }).returning('*'); ok(res, data);
}));
// Tenant records with financial/lease history are retained, not deleted.
router.delete('/tenants/:id', h.route(async (req, res) => {
  const tenant = await a.record(req, 'tenants', h.integer(1).parse(req.params.id));
  if (await db('rental_contracts').where('tenant_id', tenant.id).first()) throw new h.HttpError(409, 'Tenants with contracts must be retained for payment history');
  await db('tenants').where('id', tenant.id).delete(); res.json({ ok: true });
}));
const contractSchema = h.z.object({ tenant_id: h.integer(1), unit_id: h.integer(1), property_id: h.slug, start_date: h.date, end_date: h.date.nullable().optional(), monthly_rent_kes: h.integer(1), payment_frequency: h.z.literal('monthly').default('monthly'), security_deposit_kes: h.integer().default(0), utilities_deposit_kes: h.integer().default(0), notes: h.text(3000).default('') });
const contractQuery = req => a.scope(db('rental_contracts as c').join('tenants as t', 'c.tenant_id', 't.id').join('units as u', 'c.unit_id', 'u.id').select('c.*', 't.tenant_name', 't.tenant_phone', 'u.unit_id as unit_code', 'c.contract_notes as notes'), req, 'c.property_id');
router.post('/contracts', h.route(async (req, res) => {
  const input = contractSchema.parse(req.body);
  const unit = await a.unit(req, input.unit_id);
  const tenant = await a.record(req, 'tenants', input.tenant_id);
  if (unit.property_id !== input.property_id || tenant.property_id !== unit.property_id) throw new h.HttpError(400, 'Tenant, unit and contract must belong to the same property');
  if (unit.type === 'bnb') throw new h.HttpError(400, 'Choose a rental unit');
  if (input.end_date) h.dateRange(input.start_date, input.end_date, 36500);
  const { notes, ...fields } = input;
  const data = await db.transaction(async trx => {
    await trx('units').where('id', unit.id).forUpdate().first();
    const conflict = await trx('rental_contracts').where('unit_id', unit.id).whereIn('status', ['active', 'suspended']).where('start_date', '<', input.end_date || '9999-12-31').where(q => q.whereNull('end_date').orWhere('end_date', '>', input.start_date)).first();
    if (conflict) throw new h.HttpError(409, 'This unit already has an overlapping lease');
    const booked = await trx('bookings').where('unit_id', unit.id).whereIn('status', ['confirmed', 'pending']).where('checkout_date', '>', input.start_date).where('checkin_date', '<', input.end_date || '9999-12-31').first();
    if (booked) throw new h.HttpError(409, 'This unit has a reservation during that lease');
    const [data] = await trx('rental_contracts').insert({ ...fields, contract_notes: notes }).returning('*');
    await a.activity(req, 'contract.created', unit.property_id, data.id, trx); return data;
  });
  res.status(201); ok(res, data);
}));
router.get('/contracts', h.route(async (req, res) => {
  const query = contractQuery(req);
  for (const key of ['tenant_id', 'unit_id', 'status']) if (req.query[key]) query.where(`c.${key}`, req.query[key]);
  const { limit, offset } = h.page(req.query); ok(res, await query.orderBy('c.start_date', 'desc').limit(limit).offset(offset));
}));
router.get('/contracts/tenant/:tenantId/active', h.route(async (req, res) => {
  const tenant = await a.record(req, 'tenants', h.integer(1).parse(req.params.tenantId));
  ok(res, await contractQuery(req).where('c.tenant_id', tenant.id).where('c.status', 'active').first() || null);
}));
router.get('/contracts/:id', h.route(async (req, res) => {
  const c = await a.record(req, 'rental_contracts', h.z.uuid().parse(req.params.id));
  ok(res, await contractQuery(req).where('c.id', c.id).first());
}));
router.put('/contracts/:id', h.route(async (req, res) => {
  const c = await a.record(req, 'rental_contracts', h.z.uuid().parse(req.params.id));
  // Terms/relationships are fixed once a lease is created; end it before moving a tenant.
  const input = h.patchSchema(contractSchema).parse(req.body);
  for (const key of ['tenant_id', 'unit_id', 'property_id', 'start_date', 'end_date', 'monthly_rent_kes', 'security_deposit_kes', 'utilities_deposit_kes']) {
    if (input[key] !== undefined && (input[key] || null) !== (c[key] || null)) throw new h.HttpError(409, 'End this lease and create a new one to change its tenant, unit, dates or financial terms');
  }
  const updates = { updated_at: db.fn.now() };
  for (const key of ['monthly_rent_kes', 'security_deposit_kes', 'utilities_deposit_kes']) if (input[key] !== undefined) updates[key] = input[key];
  if (input.notes !== undefined) updates.contract_notes = input.notes;
  const [data] = await db('rental_contracts').where('id', c.id).update(updates).returning('*'); ok(res, data);
}));
router.post('/contracts/:id/end', h.route(async (req, res) => {
  const c = await a.record(req, 'rental_contracts', h.z.uuid().parse(req.params.id));
  const today = new Date().toISOString().slice(0, 10);
  const [data] = await db('rental_contracts').where('id', c.id).update({ status: 'ended', end_date: today > c.start_date ? today : c.start_date, termination_date: today, termination_reason: h.text(1000).parse(req.body.termination_reason || '') }).returning('*'); ok(res, data);
}));
const paymentQuery = req => a.unitScope(db('rental_payments as p').join('tenants as t', 'p.tenant_id', 't.id').select('p.*', 't.tenant_name', 't.tenant_phone'), req, 'p.unit_id');
router.post('/payments', h.route(async (req, res) => {
  const c = await a.record(req, 'rental_contracts', h.z.uuid().parse(req.body.contract_id));
  if (req.body.tenant_id && Number(req.body.tenant_id) !== c.tenant_id || req.body.unit_id && Number(req.body.unit_id) !== c.unit_id) throw new h.HttpError(400, 'Payment must match the contract');
  const input = h.z.object({ month: h.integer(1, 12), year: h.integer(2000, 2200), amount_paid_kes: h.integer(1), notes: h.text(3000).optional(), mpesa_receipt: h.text(50).optional() }).parse(req.body);
  const key = h.required(100).parse(req.headers['idempotency-key'] || req.body.idempotency_key);
  const data = await payments.recordPayment({ ...input, contract_id: c.id, tenant_id: c.tenant_id, unit_id: c.unit_id, idempotency_key: key });
  res.status(201); ok(res, data);
}));
router.get('/payments', h.route(async (req, res) => {
  const query = paymentQuery(req);
  for (const key of ['contract_id', 'tenant_id', 'unit_id', 'status']) if (req.query[key]) query.where(`p.${key}`, req.query[key]);
  const { limit, offset } = h.page(req.query); ok(res, await query.orderBy('p.created_at', 'desc').limit(limit).offset(offset));
}));
router.get('/payments/contract/:id/month/:month', h.route(async (req, res) => {
  const c = await a.record(req, 'rental_contracts', h.z.uuid().parse(req.params.id));
  const value = h.z.string().regex(/^\d{4}-\d{2}$/).parse(req.params.month);
  const [year, month] = value.split('-').map(Number);
  ok(res, await payments.getMonthlyPayment(c.id, month, year));
}));
router.get('/payments/:id', h.route(async (req, res) => {
  const p = await a.record(req, 'rental_payments', h.z.uuid().parse(req.params.id));
  ok(res, await paymentQuery(req).where('p.id', p.id).first());
}));
router.post('/payments/:id/mark-late', h.route(async (req, res) => {
  const p = await a.record(req, 'rental_payments', h.z.uuid().parse(req.params.id)); ok(res, await payments.updatePaymentStatusToLate(p.id));
}));
router.get('/arrears', h.route(async (req, res) => {
  const contracts = await contractQuery(req);
  const byTenant = new Map();
  for (const c of contracts) if (!byTenant.has(c.tenant_id)) byTenant.set(c.tenant_id, await payments.getTenantArrears(c.tenant_id));
  ok(res, contracts.map(c => {
    const records = byTenant.get(c.tenant_id).records.filter(p => p.contract_id === c.id);
    return {...c, records, total_outstanding_kes: records.reduce((sum,p)=>sum+p.amount_outstanding_kes,0)};
  }).filter(c=>c.total_outstanding_kes>0));
}));
router.get('/tenants/:id/arrears', h.route(async (req, res) => {
  const t = await a.record(req, 'tenants', h.integer(1).parse(req.params.id)); ok(res, await payments.getTenantArrears(t.id));
}));
router.get('/contracts/:id/payment-summary', h.route(async (req, res) => {
  const c = await a.record(req, 'rental_contracts', h.z.uuid().parse(req.params.id)); ok(res, await payments.getContractPaymentSummary(c.id));
}));
const adminFields = ['id', 'username', 'name', 'email', 'role', 'status', 'last_login', 'created_at'];
router.get('/admins', auth.fullAccessMiddleware, h.route(async (req, res) => {
  const data = await db('admin_users').select(adminFields).orderBy('name');
  for (const user of data) user.properties = await db('admin_properties as m').join('properties as p', 'm.property_id', 'p.id').where('m.admin_id', user.id).select('p.id', 'p.property_id', 'p.name', 'm.is_owner');
  ok(res, data);
}));
router.post('/admins', auth.fullAccessMiddleware, h.route(async (req, res) => {
  const input = workspace.accountSchema.extend({ role: h.z.enum(['full_admin', 'property_admin']), status: h.z.enum(['active', 'inactive']).default('active') }).parse(req.body);
  const { password, ...data } = input;
  const [user] = await db('admin_users').insert({ ...data, password_hash: await bcrypt.hash(password, 12) }).returning(adminFields); res.status(201); ok(res, user);
}));
router.put('/admins/:id', auth.fullAccessMiddleware, h.route(async (req, res) => {
  const id = h.integer(1).parse(req.params.id);
  const input = workspace.accountSchema.extend({ role: h.z.enum(['full_admin', 'property_admin']), status: h.z.enum(['active', 'inactive']) }).partial().parse(req.body);
  if (id === req.admin.id && (input.role === 'property_admin' || input.status === 'inactive')) throw new h.HttpError(409, 'You cannot remove your own platform access');
  if (input.password) { input.password_hash = await bcrypt.hash(input.password, 12); delete input.password; }
  const data = await db.transaction(async trx => {
    const [user] = await trx('admin_users').where({ id }).update({ ...input, updated_at: trx.fn.now() }).returning(adminFields);
    if (!user) throw new h.HttpError(404, 'Account not found');
    await trx('admin_sessions').where('admin_id', id).delete(); return user;
  });
  ok(res, data);
}));
router.delete('/admins/:id', auth.fullAccessMiddleware, h.route(async (req, res) => {
  const id = h.integer(1).parse(req.params.id);
  if (id === req.admin.id) throw new h.HttpError(409, 'You cannot deactivate yourself');
  await db.transaction(async trx => {
    await trx('admin_users').where({ id }).update({ status: 'inactive' }); await trx('admin_sessions').where('admin_id', id).delete();
  }); res.json({ ok: true });
}));
router.get('/admins/:id/properties', auth.fullAccessMiddleware, h.route(async (req, res) => {
  ok(res, await db('admin_properties as m').join('properties as p', 'm.property_id', 'p.id').where('m.admin_id', h.integer(1).parse(req.params.id)).select('p.id', 'p.property_id', 'p.name', 'm.is_owner'));
}));
router.post('/admins/:id/properties', auth.fullAccessMiddleware, h.route(async (req, res) => {
  const p = await a.property(req, req.body.property_id);
  await db('admin_properties').insert({ admin_id: h.integer(1).parse(req.params.id), property_id: p.id, is_owner: req.body.is_owner === true }).onConflict(['admin_id', 'property_id']).merge(['is_owner']); res.json({ ok: true });
}));
router.delete('/admins/:id/properties/:propertyId', auth.fullAccessMiddleware, h.route(async (req, res) => {
  const p = await a.property(req, req.params.propertyId);
  const member = await db('admin_properties').where({ admin_id: h.integer(1).parse(req.params.id), property_id: p.id }).first();
  if (member?.is_owner) throw new h.HttpError(409, 'Assign another owner before removing property ownership');
  if (member) await db('admin_properties').where('id', member.id).delete(); res.json({ ok: true });
}));
router.get('/payment-attempts', h.route(async (req, res) => {
  const rows = await a.scope(db('payment_attempts'), req).orderBy('created_at', 'desc').limit(200);
  ok(res, rows.map(p => ({ id: p.id, kind: p.kind, amount_kes: p.amount_kes, status: p.status, has_callback: !!p.callback, reference: `NYH-${p.id.slice(0,8).toUpperCase()}`, created_at: p.created_at })));
}));
router.post('/payment-attempts/:id/reconcile', h.rateLimit('admin-reconcile', 20, 60000), h.route(async (req, res) => {
  const p = await a.record(req, 'payment_attempts', h.z.uuid().parse(req.params.id));
  if (!p.callback) throw new h.HttpError(409, 'No callback has arrived. Check the merchant statement before resolving this payment.');
  await require('./mpesaRoutes').reconcile(p.id); res.json({ ok: true });
}));
module.exports = router;
