const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('./db');
const h = require('./http');
const auth = require('./adminAuth');
const access = require('./propertyScope');
const router = express.Router();
const username = h.z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{3,50}$/);
const accountSchema = h.z.object({ username, name: h.required(100), email: h.email, password: h.password });
const propertySchema = h.z.object({ property_id: h.slug, name: h.required(100), city: h.text(50).default(''), contact_phone: h.text(20).default(''), address: h.text(200).default('') });
const contentSchema = h.z.object({
  name: h.required(100), tagline: h.text(200).default(''), description: h.text(3000).default(''),
  hero_image_url: h.url.default(''), address: h.text(200).default(''), city: h.text(50).default(''),
  contact_phone: h.text(20).default(''), email: h.z.union([h.email, h.z.literal('')]).default(''), maps_url: h.url.default(''),
  features: h.z.array(h.required(100)).max(20).default([]),
  gallery: h.z.array(h.z.object({ url: h.url.refine(v => !!v), caption: h.text(200).default('') })).max(30).default([]),
  about_title: h.text(200).default('Make yourself at home'), about_text: h.text(5000).default(''),
  policies: h.text(5000).default(''), seo_description: h.text(160).default('')
});
async function createProperty(input, adminId, trx) {
  const [property] = await trx('properties').insert({ ...input, status: 'active' }).returning('*');
  await trx('admin_properties').insert({ property_id: property.id, admin_id: adminId, is_owner: true });
  await trx('property_websites').insert({ property_id: property.id, draft: JSON.stringify(contentSchema.parse(input)) });
  return property;
}
router.post('/onboard', h.rateLimit('onboard', 8), h.route(async (req, res) => {
  const data = h.z.object({ account: accountSchema, property: propertySchema }).parse(req.body);
  const password_hash = await bcrypt.hash(data.account.password, 12);
  const result = await db.transaction(async trx => {
    const { password, ...account } = data.account;
    const [admin] = await trx('admin_users').insert({ ...account, password_hash, role: 'property_admin', status: 'active' }).returning('id');
    const property = await createProperty(data.property, admin.id, trx);
    return { admin, property };
  });
  const user = await auth.createSession(result.admin.id, res);
  res.status(201).json({ ok: true, user, property: result.property });
}));
router.post('/accept-invite', h.rateLimit('invite', 12), h.route(async (req, res) => {
  const data = h.z.object({ token: h.required(100), account: accountSchema }).parse(req.body);
  const password_hash = await bcrypt.hash(data.account.password, 12);
  const adminId = await db.transaction(async trx => {
    const invite = await trx('property_invitations').where('token_hash', h.hash(data.token)).whereNull('accepted_at').where('expires_at', '>', new Date()).forUpdate().first();
    if (!invite || invite.email !== data.account.email) throw new h.HttpError(400, 'Invitation is invalid or expired');
    const existing = await trx('admin_users').where('email', invite.email).first();
    if (existing) throw new h.HttpError(409, 'Sign in to your existing account to accept this invitation');
    const { password, ...account } = data.account;
    const [admin] = await trx('admin_users').insert({ ...account, password_hash, role: 'property_admin', status: 'active' }).returning('id');
    await trx('admin_properties').insert({ admin_id: admin.id, property_id: invite.property_id });
    await trx('property_invitations').where('id', invite.id).update({ accepted_at: trx.fn.now() });
    return admin.id;
  });
  res.json({ ok: true, user: await auth.createSession(adminId, res) });
}));
router.use(auth.adminAuthMiddleware);
router.post('/invitations/accept', h.route(async (req, res) => {
  const token = h.required(100).parse(req.body.token);
  await db.transaction(async trx => {
    const invite = await trx('property_invitations').where('token_hash', h.hash(token)).whereNull('accepted_at').where('expires_at', '>', new Date()).forUpdate().first();
    if (!invite || invite.email !== req.admin.email) throw new h.HttpError(400, 'Invitation is invalid or expired');
    await trx('admin_properties').insert({ admin_id: req.admin.id, property_id: invite.property_id }).onConflict(['admin_id', 'property_id']).ignore();
    await trx('property_invitations').where('id', invite.id).update({ accepted_at: trx.fn.now() });
  });
  res.json({ ok: true, user: await auth.getAdminWithProperties(req.admin.id) });
}));
router.post('/properties', h.route(async (req, res) => {
  const data = propertySchema.extend({ description: h.text(3000).optional(), country: h.text(50).optional(), contact_person: h.text(100).optional(), email: h.z.union([h.email, h.z.literal('')]).optional() }).parse(req.body);
  const property = await db.transaction(trx => createProperty(data, req.admin.id, trx));
  res.status(201).json({ ok: true, data: property });
}));
router.get('/properties/:id/website', h.route(async (req, res) => {
  const p = await access.property(req, req.params.id);
  const site = await db('property_websites').where('property_id', p.id).first();
  res.json({ ok: true, data: site, path: `/p/${p.property_id}` });
}));
router.put('/properties/:id/website', h.route(async (req, res) => {
  const p = await access.property(req, req.params.id);
  const content = contentSchema.parse(req.body.content);
  const version = h.integer(1).parse(req.body.version);
  const [saved] = await db('property_websites').where({ property_id: p.id, version }).update({ draft: JSON.stringify(content), version: version + 1, updated_at: db.fn.now() }).returning('*');
  if (!saved) throw new h.HttpError(409, 'This website was edited elsewhere. Reload before saving.');
  await access.activity(req, 'website.draft_saved', p.property_id);
  res.json({ ok: true, data: saved });
}));
router.post('/properties/:id/website/publish', h.route(async (req, res) => {
  const p = await access.property(req, req.params.id);
  const version = h.integer(1).parse(req.body.version);
  const data = await db.transaction(async trx => {
    const site = await trx('property_websites').where({ property_id: p.id, version }).forUpdate().first();
    if (!site) throw new h.HttpError(409, 'This website was edited elsewhere. Reload before publishing.');
    const content = contentSchema.parse(site.draft);
    if (!content.description || !content.contact_phone || !content.hero_image_url) throw new h.HttpError(400, 'Add a description, contact number and hero image before publishing');
    const [saved] = await trx('property_websites').where('property_id', p.id).update({ published: JSON.stringify(content), published_at: trx.fn.now(), updated_at: trx.fn.now(), version: version + 1 }).returning('*');
    await access.activity(req, 'website.published', p.property_id, null, trx);
    return saved;
  });
  res.json({ ok: true, data });
}));
router.post('/properties/:id/website/unpublish', h.route(async (req, res) => {
  const p = await access.property(req, req.params.id);
  const version = h.integer(1).parse(req.body.version);
  const [data] = await db('property_websites').where({ property_id: p.id, version }).update({ published: null, published_at: null, version: version + 1, updated_at: db.fn.now() }).returning('*');
  if (!data) throw new h.HttpError(409, 'This website was edited elsewhere. Reload before unpublishing.');
  await access.activity(req, 'website.unpublished', p.property_id);
  res.json({ ok: true, data });
}));
router.get('/properties/:id/team', h.route(async (req, res) => {
  const p = await access.property(req, req.params.id, true);
  const data = await db('admin_properties as m').join('admin_users as a', 'm.admin_id', 'a.id').where('m.property_id', p.id).select('a.id', 'a.name', 'a.email', 'a.username', 'a.status', 'm.is_owner');
  const invitations = await db('property_invitations').where('property_id', p.id).whereNull('accepted_at').where('expires_at', '>', new Date()).select('id', 'email', 'expires_at');
  res.json({ ok: true, data, invitations });
}));
router.post('/properties/:id/team', h.route(async (req, res) => {
  const p = await access.property(req, req.params.id, true);
  const email = h.email.parse(req.body.email);
  const token = crypto.randomBytes(32).toString('base64url');
  await db('property_invitations').insert({ property_id: p.id, email, token_hash: h.hash(token), expires_at: new Date(Date.now() + 48 * 3600000) });
  await access.activity(req, 'team.invited', p.property_id);
  res.status(201).json({ ok: true, path: `/onboard.html#invite=${token}`, message: 'Share this invitation privately. It expires in 48 hours.' });
}));
router.delete('/properties/:id/team/:adminId', h.route(async (req, res) => {
  const p = await access.property(req, req.params.id, true);
  const member = await db('admin_properties').where({ property_id: p.id, admin_id: h.integer(1).parse(req.params.adminId) }).first();
  if (!member) throw new h.HttpError(404, 'Team member not found');
  if (member.is_owner) throw new h.HttpError(409, 'The property owner cannot be removed');
  await db('admin_properties').where('id', member.id).delete();
  await access.activity(req, 'team.removed', p.property_id, member.admin_id);
  res.json({ ok: true });
}));
router.delete('/properties/:id/invitations/:inviteId', h.route(async (req, res) => {
  const p = await access.property(req, req.params.id, true);
  await db('property_invitations').where({ property_id: p.id, id: h.integer(1).parse(req.params.inviteId) }).whereNull('accepted_at').delete();
  res.json({ ok: true });
}));
module.exports = { router, contentSchema, accountSchema, propertySchema };
