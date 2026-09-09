const express = require('express');
const crypto = require('node:crypto');
const db = require('./db');
const h = require('./http');
const merchant = require('./merchantService');
const { createBooking, assertAvailable } = require('./bookingService');
const { publicUnit } = require('./calendarRoutes');
const auth = require('./adminAuth');
const access = require('./propertyScope');
const router = express.Router();
const pendingStates = ['initiating', 'pending'];
function statusBody(attempt) {
  return { ok: true, bookingId: attempt.record_id, status: attempt.status, amount: attempt.amount_kes, ref: `NYH-${attempt.id.slice(0, 8).toUpperCase()}`, mpesaReceiptNumber: attempt.receipt || null };
}
async function authorizedAttempt(req) {
  const id = h.z.uuid().parse(req.params.bookingId || req.body.bookingId);
  const token = h.required(100).parse(req.headers['x-booking-token']);
  const row = await db('payment_attempts').where('record_id', id).where('access_token_hash', h.hash(token)).first();
  if (!row) throw new h.HttpError(404, 'Payment not found');
  return row;
}
router.post('/stk-push', h.rateLimit('stk', 10, 60000), h.route(async (req, res) => {
  const key = h.z.string().uuid().parse(req.headers['idempotency-key']);
  let unit = await publicUnit(req.body.unitId);
  if (unit.property_id !== req.body.property) throw new h.HttpError(400, 'Unit and property do not match');
  const p = await db('properties').where('property_id', unit.property_id).first();
  const setting = await merchant.settings(p.id);
  const kind = h.z.enum(['bnb', 'rental']).parse(req.body.type);
  if ((unit.type === 'bnb') !== (kind === 'bnb')) throw new h.HttpError(400, 'Booking type does not match this unit');
  const payload = { type: kind, unitId: unit.unit_id, property: unit.property_id,
    guestName: h.required(100).parse(req.body.guestName), guestPhone: h.phone(req.body.guestPhone || req.body.phone),
    guestEmail: h.z.union([h.email, h.z.literal('')]).parse(req.body.guestEmail || ''), phone: h.phone(req.body.phone),
    checkin: h.date.parse(req.body.checkin), checkout: kind === 'bnb' ? h.date.parse(req.body.checkout) : null,
    guests: h.integer(1, unit.max_guests).parse(req.body.guests || 1), notes: h.text(3000).parse(req.body.notes || '') };
  if (payload.checkin < new Date().toISOString().slice(0, 10)) throw new h.HttpError(400, 'Choose today or a future date');
  const requestHash = h.hash(JSON.stringify(payload));
  const result = await db.transaction(async trx => {
    unit = await trx('units').where('id', unit.id).forUpdate().first();
    const existing = await trx('payment_attempts').where({ property_id: unit.property_id, idempotency_key: key }).first();
    if (existing) {
      if (existing.request_hash !== requestHash) throw new h.HttpError(409, 'This payment request has already been used. Check its status before starting again.');
      return { attempt: existing, created: false };
    }
    let record;
    if (kind === 'bnb') record = await createBooking(trx, unit, payload, 'pending');
    else {
      const end = new Date(Date.parse(payload.checkin) + 31 * 86400000).toISOString().slice(0, 10);
      await assertAvailable(trx, unit, payload.checkin, end);
      const other = await trx('rental_deposits').where('unit_id', unit.id).where(q => q.where('status', 'confirmed').orWhere(b => b.where('status', 'pending').where('created_at', '>', new Date(Date.now() - 900000)))).first();
      if (other) throw new h.HttpError(409, 'This unit already has a deposit or a payment in progress');
      [record] = await trx('rental_deposits').insert({ id: crypto.randomUUID(), unit_id: unit.id, property_id: unit.property_id,
        guest_name: payload.guestName, guest_phone: payload.guestPhone, guest_email: payload.guestEmail,
        intended_checkin_date: payload.checkin, deposit_amount_kes: unit.base_price_kes * 2 + unit.water_deposit_kes,
        monthly_rent_kes: unit.base_price_kes, security_deposit_kes: unit.base_price_kes, utilities_deposit_kes: unit.water_deposit_kes,
        guest_notes: payload.notes, reference: `NYH-${crypto.randomBytes(8).toString('hex').toUpperCase()}` }).returning('*');
    }
    const amount = kind === 'bnb' ? record.total_amount_kes : record.deposit_amount_kes;
    if (req.body.amount !== undefined && Number(req.body.amount) !== amount) throw new h.HttpError(409, 'The price has changed. Refresh the quote before paying.');
    const [attempt] = await trx('payment_attempts').insert({ id: crypto.randomUUID(), property_id: unit.property_id, unit_id: unit.id,
      idempotency_key: key, request_hash: requestHash, access_token_hash: h.hash(key), kind, record_id: record.id,
      amount_kes: amount, phone: payload.phone, expires_at: new Date(Date.now() + 900000) }).returning('*');
    return { attempt, created: true };
  });
  let attempt = result.attempt;
  if (result.created) {
    try {
      const response = await merchant.client(setting).stkPush({ phone: attempt.phone, amount: attempt.amount_kes, ref: statusBody(attempt).ref });
      if (String(response.ResponseCode) !== '0' || !response.CheckoutRequestID) {
        await db('payment_attempts').where('id', attempt.id).update({ status: 'failed', updated_at: db.fn.now() });
        await db(kind === 'bnb' ? 'bookings' : 'rental_deposits').where('id', attempt.record_id).update({ status: 'failed' });
        throw new h.HttpError(502, 'The payment request was rejected. Please try again later.');
      }
      [attempt] = await db('payment_attempts').where('id', attempt.id).update({ checkout_request_id: response.CheckoutRequestID, merchant_request_id: response.MerchantRequestID, status: 'pending', updated_at: db.fn.now() }).returning('*');
      await db(kind === 'bnb' ? 'bookings' : 'rental_deposits').where('id', attempt.record_id).update({ checkout_request_id: attempt.checkout_request_id });
    } catch (err) {
      if (err.status) throw err;
      // An ambiguous timeout must never send another STK push on an automatic retry.
      [attempt] = await db('payment_attempts').where('id', attempt.id).update({ status: 'needs_review', updated_at: db.fn.now() }).returning('*');
    }
  }
  res.json({ ...statusBody(attempt), checkoutRequestId: attempt.checkout_request_id, accessToken: key });
}));
router.post('/callback/:token', h.route(async (req, res) => {
  const token = h.z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.token);
  const setting = await db('property_merchant_settings').where('callback_token', token).first();
  if (!setting) throw new h.HttpError(404, 'Callback not found');
  const callback = h.z.object({ CheckoutRequestID: h.required(100), MerchantRequestID: h.required(100), ResultCode: h.z.number().int(), ResultDesc: h.text(500).optional(), CallbackMetadata: h.z.object({ Item: h.z.array(h.z.object({ Name: h.required(100), Value: h.z.union([h.z.string(), h.z.number()]).optional() })).max(20) }).optional() }).parse(req.body?.Body?.stkCallback);
  const p = await db('properties').where('id', setting.property_id).first();
  const attempt = await db('payment_attempts').where({ property_id: p.property_id, checkout_request_id: callback.CheckoutRequestID, merchant_request_id: callback.MerchantRequestID }).first();
  if (!attempt) throw new h.HttpError(404, 'Payment not found');
  // Persist before acknowledging. The maintenance worker retries across restarts.
  if (pendingStates.includes(attempt.status) || attempt.status === 'needs_review') {
    await db('payment_attempts').where('id', attempt.id).whereNull('callback').update({ callback: JSON.stringify(callback), updated_at: db.fn.now() });
  }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}));
async function reconcile(id) {
  const attempt = await db('payment_attempts').where('id', id).first();
  if (!attempt?.callback || !['pending', 'initiating', 'needs_review'].includes(attempt.status)) return;
  const p = await db('properties').where('property_id', attempt.property_id).first();
  const setting = await db('property_merchant_settings').where('property_id', p.id).first();
  if (!setting) return;
  const provider = merchant.client({ ...setting, credentials: merchant.decrypt(setting.credentials_encrypted) });
  const verified = await provider.stkQuery(attempt.checkout_request_id);
  if (verified.ResultCode === undefined) return;
  const callback = attempt.callback;
  const get = name => callback.CallbackMetadata?.Item.find(i => i.Name === name)?.Value;
  let status = String(verified.ResultCode) === '0' ? 'confirmed' : (String(verified.ResultCode) === String(callback.ResultCode) && callback.ResultCode !== 0 ? 'failed' : 'needs_review');
  if (status === 'confirmed' && (callback.ResultCode !== 0 || Number(get('Amount')) !== attempt.amount_kes || String(get('PhoneNumber')) !== attempt.phone || !/^[A-Z0-9]{6,50}$/.test(String(get('MpesaReceiptNumber') || '')))) status = 'needs_review';
  await db.transaction(async trx => {
    const unit = await trx('units').where('id', attempt.unit_id).forUpdate().first();
    const current = await trx('payment_attempts').where('id', attempt.id).forUpdate().first();
    if (current.status === 'confirmed' || current.status === 'failed') return;
    const table = attempt.kind === 'bnb' ? 'bookings' : 'rental_deposits';
    const record = await trx(table).where('id', attempt.record_id).forUpdate().first();
    if (status === 'confirmed' && attempt.kind === 'bnb') {
      if (record.status === 'cancelled') status = 'needs_review';
      else try { await assertAvailable(trx, unit, record.checkin_date, record.checkout_date, record.id); } catch (err) { if (err.status !== 409) throw err; status = 'needs_review'; }
    }
    if (status === 'confirmed' && attempt.kind === 'rental') {
      const start = record.intended_checkin_date;
      const conflict = await trx('rental_contracts').where('unit_id', unit.id).whereIn('status', ['active', 'suspended']).where(q => q.whereNull('end_date').orWhere('end_date', '>', start)).first();
      const reserved = await trx('bookings').where('unit_id', unit.id).where('checkout_date', '>', start).where(q => q.where('status', 'confirmed').orWhere(b => b.where('status', 'pending').where('created_at', '>', new Date(Date.now() - 900000)))).first();
      const blocked = await trx('availability_blocks').where('unit_id', unit.id).where('end_date', '>', start).first();
      if (unit.status !== 'active' || conflict || reserved || blocked || record.contract_id || !record.monthly_rent_kes) status = 'needs_review';
      else {
        let tenant = await trx('tenants').where({ property_id: unit.property_id, tenant_phone: record.guest_phone }).first();
        if (!tenant) [tenant] = await trx('tenants').insert({ property_id: unit.property_id, tenant_phone: record.guest_phone, tenant_name: record.guest_name, tenant_email: record.guest_email }).onConflict(['property_id','tenant_phone']).merge(['tenant_phone']).returning('*');
        const [contract] = await trx('rental_contracts').insert({ tenant_id: tenant.id, unit_id: unit.id, property_id: unit.property_id,
          start_date: start, monthly_rent_kes: record.monthly_rent_kes, security_deposit_kes: record.security_deposit_kes,
          utilities_deposit_kes: record.utilities_deposit_kes, status: 'active', contract_notes: 'Created from verified move-in payment' }).returning('*');
        const [payment] = await trx('rental_payments').insert({ contract_id: contract.id, tenant_id: tenant.id, unit_id: unit.id,
          month: Number(start.slice(5,7)), year: Number(start.slice(0,4)), due_date: start, paid_date: new Date().toISOString().slice(0,10),
          amount_due_kes: record.monthly_rent_kes, amount_paid_kes: record.monthly_rent_kes, amount_outstanding_kes: 0,
          status: 'paid', mpesa_receipt_number: String(get('MpesaReceiptNumber')) }).returning('*');
        await trx('payment_ledger').insert({ contract_id: contract.id, payment_id: payment.id, idempotency_key: attempt.id,
          amount_kes: record.monthly_rent_kes, receipt: String(get('MpesaReceiptNumber')) });
        await trx('rental_deposits').where('id', record.id).update({ tenant_id: tenant.id, contract_id: contract.id });
      }
    }
    await trx('payment_attempts').where('id', attempt.id).update({ status, receipt: status === 'confirmed' ? String(get('MpesaReceiptNumber')) : null, updated_at: trx.fn.now() });
    if (status !== 'needs_review') await trx(table).where('id', record.id).update({ status, mpesa_receipt_number: status === 'confirmed' ? String(get('MpesaReceiptNumber')) : null, mpesa_phone: attempt.phone, updated_at: trx.fn.now() });
    if (attempt.kind === 'bnb') await trx('audit_log').insert({ booking_id: record.id, transaction_type: status === 'confirmed' ? 'confirmed' : status === 'failed' ? 'failed' : 'callback', amount_kes: attempt.amount_kes, result_code: Number(verified.ResultCode), result_desc: status === 'needs_review' ? 'Payment requires manual review' : status });
  });
}
router.get('/status/:bookingId', h.route(async (req, res) => { const attempt = await authorizedAttempt(req); res.json(statusBody(attempt)); }));
router.post('/query', h.rateLimit('payment-query', 20, 60000), h.route(async (req, res) => {
  const attempt = await authorizedAttempt(req);
  if (attempt.callback) await reconcile(attempt.id);
  res.json(statusBody(await db('payment_attempts').where('id', attempt.id).first()));
}));
router.get('/bookings', auth.adminAuthMiddleware, h.route(async (req, res) => res.json({ ok: true, bookings: await access.scope(db('bookings'), req).orderBy('created_at', 'desc').limit(100) })));
async function runMaintenance() {
  const attempts = await db('payment_attempts').whereNotNull('callback').whereIn('status', ['pending', 'initiating']).orderBy('updated_at').limit(30);
  for (const attempt of attempts) { try { await reconcile(attempt.id); } catch { /* Durable callback stays available for the next run. */ } }
  await db('payment_attempts').whereIn('status', pendingStates).where('expires_at', '<', new Date()).whereNull('callback').update({ status: 'needs_review', updated_at: db.fn.now() });
  await db('rate_limits').where('expires_at', '<', Date.now()).delete();
  await db('admin_sessions').where('expires_at', '<', new Date()).delete();
}
module.exports = router;
module.exports.reconcile = reconcile;
module.exports.runMaintenance = runMaintenance;
