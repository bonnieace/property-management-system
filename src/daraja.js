const axios = require('axios');

const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const PROD_BASE    = 'https://api.safaricom.co.ke';

function base() {
  return process.env.MPESA_ENV === 'production' ? PROD_BASE : SANDBOX_BASE;
}

// ─── In-memory token cache ────────────────────────────────────────────────
let _tokenCache = { token: null, expiresAt: 0 };

/**
 * Fetch (or return cached) OAuth2 Bearer token.
 * Daraja tokens are valid for 3600s — we refresh 60s early.
 */
async function getToken() {
  const now = Date.now();
  if (_tokenCache.token && now < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error('MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET not set in .env');
  }

  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await axios.get(
    `${base()}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  const token     = res.data.access_token;
  const expiresIn = parseInt(res.data.expires_in, 10) || 3600;

  _tokenCache = {
    token,
    expiresAt: now + (expiresIn - 60) * 1000,
  };

  return token;
}

/**
 * Build the base64 password Daraja requires:
 *   base64(BusinessShortCode + Passkey + Timestamp)
 */
function buildPassword(timestamp) {
  const raw = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  return Buffer.from(raw).toString('base64');
}

/**
 * Returns current timestamp in Daraja format: YYYYMMDDHHmmss
 */
function getTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
}

/**
 * Initiate STK Push (Lipa Na M-Pesa Online).
 * @param {string} phone   - Kenyan phone in international format without +, e.g. 254712345678
 * @param {number} amount  - Integer amount in KES
 * @param {string} ref     - Account reference (booking ID)
 * @returns Daraja response including CheckoutRequestID
 */
async function stkPush({ phone, amount, ref }) {
  const token     = await getToken();
  const timestamp = getTimestamp();
  const password  = buildPassword(timestamp);

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.round(amount),
    PartyA:            phone,
    PartyB:            process.env.MPESA_SHORTCODE,
    PhoneNumber:       phone,
    CallBackURL:       process.env.MPESA_CALLBACK_URL,
    AccountReference:  (ref || process.env.MPESA_ACCOUNT_REF).slice(0, 12),
    TransactionDesc:   process.env.MPESA_TRANSACTION_DESC || 'Booking',
  };

  const res = await axios.post(
    `${base()}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data;
}

/**
 * Query the status of a pending STK Push.
 * Use this to poll if the callback is delayed.
 * @param {string} checkoutRequestId - From the original stkPush response
 */
async function stkQuery(checkoutRequestId) {
  const token     = await getToken();
  const timestamp = getTimestamp();
  const password  = buildPassword(timestamp);

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const res = await axios.post(
    `${base()}/mpesa/stkpushquery/v1/query`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data;
}

module.exports = { getToken, stkPush, stkQuery };
