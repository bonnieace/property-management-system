const crypto = require('node:crypto');
const axios = require('axios');
const db = require('./db');
const { HttpError } = require('./http');
function encryptionKey() {
  const value = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(value || '')) throw new HttpError(503, 'Payment configuration is not available. Contact the platform administrator.');
  return Buffer.from(value, 'hex');
}
function encrypt(value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString('base64')).join('.');
}
function decrypt(value) {
  const [iv, tag, encrypted] = value.split('.').map(v => Buffer.from(v, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
}
async function settings(propertyId) {
  const row = await db('property_merchant_settings').where('property_id', propertyId).first();
  if (!row?.enabled) throw new HttpError(503, 'Online payments are not enabled for this property. Please contact the property.');
  return { ...row, credentials: decrypt(row.credentials_encrypted) };
}
function client(setting) {
  const c = setting.credentials;
  const baseURL = c.environment === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const http = axios.create({ baseURL, timeout: 8000, maxRedirects: 0 });
  async function request(endpoint, payload) {
    const tokenResponse = await http.get('/oauth/v1/generate?grant_type=client_credentials', { auth: { username: c.consumer_key, password: c.consumer_secret } });
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const result = await http.post(endpoint, { BusinessShortCode: c.shortcode, Password: Buffer.from(`${c.shortcode}${c.passkey}${timestamp}`).toString('base64'), Timestamp: timestamp, ...payload }, { headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` } });
    return result.data;
  }
  return {
    stkPush: ({ phone, amount, ref }) => request('/mpesa/stkpush/v1/processrequest', {
      TransactionType: c.transaction_type, Amount: amount, PartyA: phone, PartyB: c.shortcode, PhoneNumber: phone,
      CallBackURL: `${process.env.SITE_ORIGIN}/api/mpesa/callback/${setting.callback_token}`,
      AccountReference: ref.slice(0, 12), TransactionDesc: 'Property booking'
    }),
    stkQuery: checkoutRequestId => request('/mpesa/stkpushquery/v1/query', { CheckoutRequestID: checkoutRequestId })
  };
}
module.exports = { encrypt, decrypt, settings, client };
