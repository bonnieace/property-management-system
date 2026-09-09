const express = require('express');
const crypto = require('node:crypto');
const db = require('./db');
const h = require('./http');
const a = require('./propertyScope');
const auth = require('./adminAuth');
const merchant = require('./merchantService');
const router = express.Router();
async function publicProperties() {
  const rows = await db('properties as p').join('property_websites as w', 'p.id', 'w.property_id').where('p.status', 'active').whereNotNull('w.published').select('p.id', 'p.property_id', 'w.published');
  return rows.map(r => ({ ...r.published, id: r.id, property_id: r.property_id, status: 'active' }));
}
async function publicUnits(propertyId) {
  const query = db('units as u').join('properties as p', 'u.property_id', 'p.property_id').join('property_websites as w', 'p.id', 'w.property_id').where('u.status', 'active').where('p.status', 'active').whereNotNull('w.published').select('u.*');
  if (propertyId) query.where('u.property_id', propertyId);
  const units = await query.orderBy('u.name');
  const images = await db('unit_images').whereIn('unit_id', units.map(u => u.id)).orderBy('display_order');
  return units.map(u => ({ ...u, images: images.filter(i => i.unit_id === u.id) }));
}
router.get('/websites/:slug', h.route(async (req, res) => {
  const p = (await publicProperties()).find(p => p.property_id === req.params.slug);
  if (!p) throw new h.HttpError(404, 'This property website is not available');
  const setting = await db('property_merchant_settings').where({ property_id: p.id, enabled: true }).first('property_id');
  res.json({ ok: true, data: p, units: await publicUnits(p.property_id), payments_enabled: !!setting });
}));
router.get('/admin/websites/:slug/preview', auth.adminAuthMiddleware, h.route(async (req, res) => {
  const p = await a.property(req, req.params.slug);
  const site = await db('property_websites').where('property_id', p.id).first();
  const units = await db('units').where('property_id', p.property_id).where('status', 'active');
  const images = await db('unit_images').whereIn('unit_id', units.map(u => u.id)).orderBy('display_order');
  res.json({ ok: true, data: { ...site.draft, id: p.id, property_id: p.property_id }, units: units.map(u => ({ ...u, images: images.filter(i => i.unit_id === u.id) })), preview: true, payments_enabled: false });
}));
router.get('/admin/properties/:id/payments-settings', auth.adminAuthMiddleware, h.route(async (req, res) => {
  const p = await a.property(req, req.params.id, true);
  const row = await db('property_merchant_settings').where('property_id', p.id).first();
  if (!row) return res.json({ ok: true, data: { enabled: false, configured: false } });
  const c = merchant.decrypt(row.credentials_encrypted);
  res.json({ ok: true, data: { enabled: row.enabled, configured: true, environment: c.environment, shortcode: c.shortcode, transaction_type: c.transaction_type } });
}));
router.put('/admin/properties/:id/payments-settings', auth.adminAuthMiddleware, h.route(async (req, res) => {
  const p = await a.property(req, req.params.id, true);
  const schema = h.z.object({ enabled: h.z.boolean(), environment: h.z.enum(['sandbox', 'production']), shortcode: h.z.string().regex(/^\d{5,10}$/), transaction_type: h.z.enum(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline']), consumer_key: h.required(200).optional(), consumer_secret: h.required(200).optional(), passkey: h.required(300).optional() });
  const { enabled, ...input } = schema.parse(req.body);
  if (enabled && !process.env.SITE_ORIGIN?.startsWith('https://')) throw new h.HttpError(503, 'Set the public HTTPS origin before enabling online payments');
  const old = await db('property_merchant_settings').where('property_id', p.id).first();
  const credentials = { ...(old ? merchant.decrypt(old.credentials_encrypted) : {}), ...input };
  for (const key of ['consumer_key', 'consumer_secret', 'passkey']) h.required(300).parse(credentials[key]);
  // Credential changes are blocked while callbacks may still need the old merchant.
  if (old && await db('payment_attempts').where('property_id', p.property_id).whereIn('status', ['initiating', 'pending']).first()) throw new h.HttpError(409, 'Resolve pending payments before changing merchant settings');
  await db('property_merchant_settings').insert({ property_id: p.id, enabled, credentials_encrypted: merchant.encrypt(credentials), callback_token: old?.callback_token || crypto.randomBytes(32).toString('hex') }).onConflict('property_id').merge();
  await a.activity(req, 'payments.settings_updated', p.property_id);
  res.json({ ok: true });
}));
module.exports = router;
module.exports.publicProperties = publicProperties;
module.exports.publicUnits = publicUnits;
