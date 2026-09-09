function validateConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
  const origin = process.env.SITE_ORIGIN;
  let parsed; try { parsed = new URL(origin); } catch { throw new Error('SITE_ORIGIN must be the public HTTPS origin'); }
  if (parsed.protocol !== 'https:' || parsed.origin !== origin) throw new Error('SITE_ORIGIN must be the public HTTPS origin without a trailing slash');
  if (process.env.CREDENTIAL_ENCRYPTION_KEY && !/^[a-f0-9]{64}$/i.test(process.env.CREDENTIAL_ENCRYPTION_KEY)) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 32 random bytes encoded as 64 hex characters');
}
module.exports = { validateConfig };
