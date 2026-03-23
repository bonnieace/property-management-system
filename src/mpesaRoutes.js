const express  = require('express');
const daraja   = require('./daraja');
const store    = require('./bookingStore');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Normalise a Kenyan phone number to 254XXXXXXXXX format.
 * Accepts: 07XX, 01XX, +2547XX, 2547XX
 */
function normalisePhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0')   && digits.length === 10)  return '254' + digits.slice(1);
  if (digits.startsWith('7')   && digits.length === 9)   return '254' + digits;
  if (digits.startsWith('1')   && digits.length === 9)   return '254' + digits;
  return null;
}

function validateAmount(amount) {
  const n = parseInt(amount, 10);
  if (isNaN(n) || n < 1) return null;
  return n;
}

// ─── POST /api/mpesa/stk-push ──────────────────────────────────────────────
//
// Creates a booking record then fires the STK Push to Safaricom.
// Browser receives { bookingId, checkoutRequestId } and polls /status.
//
router.post('/stk-push', async (req, res) => {
  try {
    const {
      phone, amount,
      type, unitId, property,
      guestName, guestPhone, guestEmail,
      checkin, checkout, nights, guests, notes,
    } = req.body;

    // ── Validate ──
    const normPhone = normalisePhone(phone);
    if (!normPhone) {
      return res.status(400).json({ ok: false, error: 'Invalid phone number. Use 07XX or 01XX format.' });
    }

    const normAmount = validateAmount(amount);
    if (!normAmount) {
      return res.status(400).json({ ok: false, error: 'Invalid amount.' });
    }

    if (!guestName || !guestName.trim()) {
      return res.status(400).json({ ok: false, error: 'Guest name is required.' });
    }

    // ── Create pending booking ──
    const booking = store.create({
      type:        type || 'bnb',
      unitId:      unitId || 'unknown',
      property:    property || 'nyathira',
      guestName:   guestName.trim(),
      guestPhone:  guestPhone || phone,
      guestEmail:  guestEmail || '',
      checkin:     checkin || null,
      checkout:    checkout || null,
      nights:      nights || 1,
      guests:      guests || 1,
      amount:      normAmount,
      notes:       notes || '',
    });

    // ── Fire STK Push ──
    const darajaRes = await daraja.stkPush({
      phone:  normPhone,
      amount: normAmount,
      ref:    booking.ref,
    });

    // Daraja always returns ResponseCode "0" for accepted requests
    if (darajaRes.ResponseCode !== '0') {
      return res.status(502).json({
        ok:    false,
        error: darajaRes.errorMessage || 'STK Push rejected by Safaricom.',
        daraja: darajaRes,
      });
    }

    // ── Attach CheckoutRequestID ──
    store.attachCheckout(booking.bookingId, darajaRes.CheckoutRequestID);

    console.log(`[STK] Sent → bookingId=${booking.bookingId}  checkout=${darajaRes.CheckoutRequestID}  amount=${normAmount}  phone=${normPhone}`);

    return res.json({
      ok:               true,
      bookingId:        booking.bookingId,
      ref:              booking.ref,
      checkoutRequestId: darajaRes.CheckoutRequestID,
      customerMessage:  darajaRes.CustomerMessage,
    });

  } catch (err) {
    console.error('[STK] Error:', err.response?.data || err.message);
    return res.status(500).json({
      ok:    false,
      error: err.response?.data?.errorMessage || err.message || 'Server error',
    });
  }
});

// ─── POST /api/mpesa/callback ──────────────────────────────────────────────
//
// Safaricom POSTs here after the user enters their PIN.
// Must respond with { ResultCode: 0, ResultDesc: "Success" } quickly
// — Safaricom retries if you take >10 seconds or return non-200.
//
router.post('/callback', (req, res) => {
  // Acknowledge immediately — never let Safaricom wait
  res.json({ ResultCode: 0, ResultDesc: 'Success' });

  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) {
      console.warn('[Callback] Unexpected payload shape:', JSON.stringify(req.body));
      return;
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = body;
    console.log(`[Callback] CheckoutRequestID=${CheckoutRequestID}  ResultCode=${ResultCode}  Desc="${ResultDesc}"`);

    if (ResultCode === 0) {
      // Payment successful — extract metadata items
      const items = CallbackMetadata?.Item || [];
      const get   = (name) => items.find(i => i.Name === name)?.Value ?? null;

      const booking = store.confirm(CheckoutRequestID, {
        mpesaReceiptNumber: get('MpesaReceiptNumber'),
        transactionDate:    String(get('TransactionDate')),
        phoneNumber:        String(get('PhoneNumber')),
      });

      if (booking) {
        console.log(`[Callback] CONFIRMED bookingId=${booking.bookingId}  receipt=${booking.mpesaReceiptNumber}`);
        // TODO: send confirmation SMS/email here
        // TODO: notify frontend via WebSocket / Server-Sent Events here
      } else {
        console.warn(`[Callback] No booking found for CheckoutRequestID=${CheckoutRequestID}`);
      }

    } else {
      // Payment failed (wrong PIN, cancelled, insufficient funds, timeout)
      const booking = store.fail(CheckoutRequestID, ResultDesc);
      if (booking) {
        console.log(`[Callback] FAILED bookingId=${booking.bookingId}  reason="${ResultDesc}"`);
      }
    }
  } catch (err) {
    console.error('[Callback] Processing error:', err.message);
  }
});

// ─── GET /api/mpesa/status/:bookingId ─────────────────────────────────────
//
// Browser polls this every 3 seconds while showing the countdown timer.
// Returns the current booking status without hitting Daraja.
//
router.get('/status/:bookingId', (req, res) => {
  const booking = store.getById(req.params.bookingId);
  if (!booking) {
    return res.status(404).json({ ok: false, error: 'Booking not found.' });
  }

  return res.json({
    ok:                true,
    status:            booking.status,          // pending | confirmed | failed | expired
    ref:               booking.ref,
    mpesaReceiptNumber: booking.mpesaReceiptNumber,
    amount:            booking.amount,
    guestName:         booking.guestName,
    property:          booking.property,
    unitId:            booking.unitId,
    checkin:           booking.checkin,
    checkout:          booking.checkout,
  });
});

// ─── POST /api/mpesa/query ─────────────────────────────────────────────────
//
// Manually query Daraja for a specific CheckoutRequestID.
// Use this as a fallback when the callback hasn't arrived after ~30s.
//
router.post('/query', async (req, res) => {
  try {
    const { checkoutRequestId, bookingId } = req.body;

    if (!checkoutRequestId) {
      return res.status(400).json({ ok: false, error: 'checkoutRequestId required.' });
    }

    const darajaRes = await daraja.stkQuery(checkoutRequestId);
    console.log(`[Query] checkoutRequestId=${checkoutRequestId}  ResultCode=${darajaRes.ResultCode}`);

    // If the query itself says success and callback hadn't arrived yet, confirm now
    if (darajaRes.ResultCode === '0' && bookingId) {
      const b = store.getById(bookingId);
      if (b && b.status === 'pending') {
        store.confirm(checkoutRequestId, {
          mpesaReceiptNumber: null,   // query response doesn't include receipt
          transactionDate:    new Date().toISOString(),
          phoneNumber:        b.guestPhone,
        });
      }
    }

    return res.json({ ok: true, daraja: darajaRes });
  } catch (err) {
    console.error('[Query] Error:', err.response?.data || err.message);
    return res.status(500).json({
      ok:    false,
      error: err.response?.data?.errorMessage || err.message,
    });
  }
});

// ─── GET /api/mpesa/bookings ───────────────────────────────────────────────
// Simple admin view — list all bookings (protect with auth in production!)
router.get('/bookings', (req, res) => {
  res.json({ ok: true, bookings: store.list() });
});

module.exports = router;
