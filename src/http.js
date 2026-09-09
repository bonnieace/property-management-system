const { z } = require('zod');
const crypto = require('node:crypto');
const db = require('./db');
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const route = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const text = (max = 200) => z.string().trim().max(max);
const required = (max = 200) => text(max).min(1);
const integer = (min = 0, max = 100000000) => z.coerce.number().int().min(min).max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Enter a valid date');
const slug = z.string().regex(/^[a-z][a-z0-9-]{2,19}$/, 'Use 3–20 lowercase letters, numbers or hyphens');
const password = z.string().min(12, 'Use at least 12 characters').refine(v => Buffer.byteLength(v) <= 72, 'Password is too long');
const email = z.string().trim().toLowerCase().max(100).email();
const url = z.union([z.literal(''), z.string().max(2000).url().refine(v => new URL(v).protocol === 'https:' && !new URL(v).username && !new URL(v).password, 'Use an HTTPS URL')]);
function phone(value) {
  const digits = String(value || '').replace(/[\s+()-]/g, '');
  const normalized = digits.startsWith('0') ? `254${digits.slice(1)}` : /^[17]\d{8}$/.test(digits) ? `254${digits}` : digits;
  if (!/^254[17]\d{8}$/.test(normalized)) throw new HttpError(400, 'Enter a valid Kenyan mobile number');
  return normalized;
}
function dateRange(start, end, maxDays = 366) {
  date.parse(start); date.parse(end);
  const nights = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (nights <= 0 || nights > maxDays) throw new HttpError(400, `Choose a date range of 1–${maxDays} days`);
  return nights;
}
function patchSchema(schema) {
  return z.object(Object.fromEntries(Object.entries(schema.shape).map(([key, field]) => [key, (typeof field.removeDefault === 'function' ? field.removeDefault() : field).optional()])));
}
function page(query, defaultLimit = 100) {
  return { limit: integer(1, 1000).parse(query.limit ?? defaultLimit), offset: integer(0, 1000000).parse(query.offset ?? 0) };
}
function rateLimit(name, max = 30, windowMs = 900000, keyFn = req => req.ip) {
  return route(async (req, res, next) => {
    const now = Date.now(); const key = hash(`${name}:${keyFn(req)}:${Math.floor(now / windowMs)}`);
    const result = await db.raw('INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1 RETURNING count', [key, now + windowMs]);
    if (result.rows[0].count > max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      throw new HttpError(429, 'Too many attempts. Please try again later.');
    }
    next();
  });
}
module.exports = { z, HttpError, route, hash, text, required, integer, date, slug, password, email, url, phone, dateRange, page, rateLimit, patchSchema };
