const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('./db');
const { route, hash, HttpError } = require('./http');
const COOKIE = 'pms_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_MS });
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);
async function getAdminWithProperties(id) {
  const admin = await db('admin_users').where({ id, status: 'active' }).select('id', 'username', 'name', 'email', 'role', 'status').first();
  if (!admin) return null;
  admin.properties = await db('admin_properties as m').join('properties as p', 'm.property_id', 'p.id')
    .where('m.admin_id', id).where('p.status', 'active').select('p.id', 'p.property_id', 'p.name', 'm.is_owner');
  return admin;
}
async function createSession(adminId, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db('admin_sessions').insert({ token_hash: hash(token), admin_id: adminId, expires_at: new Date(Date.now() + SESSION_MS) });
  res.cookie(COOKIE, token, cookieOptions());
  return getAdminWithProperties(adminId);
}
function sessionToken(req) {
  const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
  return cookie?.slice(COOKIE.length + 1);
}
const adminAuthMiddleware = route(async (req, res, next) => {
  if (req.admin) return next();
  const token = sessionToken(req);
  const session = token && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? await db('admin_sessions').where('token_hash', hash(token)).where('expires_at', '>', new Date()).first() : null;
  const admin = session && await getAdminWithProperties(session.admin_id);
  if (!admin) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  req.admin = admin; req.sessionHash = hash(token);
  res.set('Cache-Control', 'no-store'); next();
});
async function authenticateUser(username, password, res) {
  const admin = await db('admin_users').whereRaw('lower(username) = ?', [username.toLowerCase()]).first();
  const matched = await bcrypt.compare(password, admin?.password_hash || dummyHash);
  if (!matched || admin?.status !== 'active') throw new HttpError(401, 'Invalid username or password');
  await db('admin_users').where({ id: admin.id }).update({ last_login: db.fn.now() });
  return createSession(admin.id, res);
}
function fullAccessMiddleware(req, res, next) {
  if (req.admin.role !== 'full_admin') return next(new HttpError(403, 'Platform administrator access required'));
  next();
}
async function logout(req, res) {
  const token = sessionToken(req);
  if (token) await db('admin_sessions').where('token_hash', hash(token)).delete();
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined }); res.json({ ok: true });
}
module.exports = { adminAuthMiddleware, fullAccessMiddleware, getAdminWithProperties, createSession, authenticateUser, logout };
