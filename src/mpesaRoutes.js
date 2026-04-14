const express    = require('express');
const daraja     = require('./daraja');
const store      = require('./bookingStore');
const msgQueue   = require('./messageQueue');
const db         = require('./db');
const tenantService = require('./tenantService');
const paymentService = require('./paymentService');

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

/**
 * Handle rental payment from M-Pesa callback
 * Finds active contract for tenant and applies payment
 */
async function handleRentalPayment({
  phone,
  amount,
  mpesaReceiptNumber,
  transactionDate,
}) {
  try {
    console.log(`[Callback Rental] Processing rental payment for ${phone} | amount=${amount} KES | receipt=${mpesaReceiptNumber}`);

    // Lookup tenant by phone
    const tenant = await tenantService.getTenantByPhone(phone);
    if (!tenant) {
      console.warn(`[Callback Rental] Tenant not found for phone ${phone}, falling through to BnB`);
      return null; // Signal to fall through to BnB flow
    }

    console.log(`[Callback Rental] Found tenant ID ${tenant.id} (${tenant.tenant_name})`);

    // Get active contract for tenant
    const contract = await db('rental_contracts')
      .where('tenant_id', tenant.id)
      .where('status', 'active')
      .orderBy('start_date', 'desc')
      .first();

    if (!contract) {
      console.warn(`[Callback Rental] No active contract for tenant ${tenant.id}`);
      return { success: false, reason: 'No active contract' };
    }

    console.log(`[Callback Rental] Found active contract ${contract.id} | monthly rent = ${contract.monthly_rent_kes} KES`);

    // Determine payment month (current month)
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();

    // Record payment (handles partial, full, overpayment automatically)
    const payment = await paymentService.recordPayment({
      contract_id: contract.id,
      tenant_id: tenant.id,
      unit_id: contract.unit_id,
      month,
      year,
      amount_paid_kes: amount,
      mpesa_receipt: mpesaReceiptNumber,
      mpesa_phone: phone,
      mpesa_reference: `received_${mpesaReceiptNumber}`,
      notes: `M-Pesa payment on ${new Date().toISOString().split('T')[0]}`
    });

    console.log(`[Callback Rental] Payment recorded ID=${payment.id} | status=${payment.status} | outstanding=${payment.amount_outstanding_kes} KES`);

    // Queue SMS notification to tenant
    try {
      msgQueue.queueMessage('sms', normPhone, 'rental_payment_confirmation', {
        tenant_name: tenant.tenant_name,
        month: payment.month,
        year: payment.year,
        amount_paid: amount,
        outstanding: payment.amount_outstanding_kes,
        mpesa_receipt: mpesaReceiptNumber
      });
      console.log(`[Callback Rental] SMS queued for tenant ${normPhone}`);
    } catch (err) {
      console.error(`[Callback Rental] Failed to queue SMS: ${err.message}`);
    }

    return {
      success: true,
      tenant_id: tenant.id,
      contract_id: contract.id,
      payment_id: payment.id,
      status: payment.status,
      outstanding_kes: payment.amount_outstanding_kes
    };
  } catch (err) {
    console.error(`[Callback Rental] Error: ${err.message}`);
    return { success: false, reason: err.message };
  }
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
    const booking = await store.create({
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
    await store.attachCheckout(booking.bookingId, darajaRes.CheckoutRequestID);

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
// DUAL-FLOW ROUTING:
//   1. Extract phone from callback metadata
//   2. Check if phone matches a tenant (rental payment)
//   3. If yes → apply payment to rental contract
//   4. If no → apply payment to BnB booking (existing logic)
// 
// Must respond with { ResultCode: 0, ResultDesc: "Success" } quickly
// — Safaricom retries if you take >10 seconds or return non-200.
//
router.post('/callback', async (req, res) => {
  // Acknowledge immediately — never let Safaricom wait
  res.json({ ResultCode: 0, ResultDesc: 'Success' });
  console.log('[Callback] Received:', JSON.stringify(req.body));

  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) {
      console.warn('[Callback] Unexpected payload shape:', JSON.stringify(req.body));
      return;
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = body;
    console.log(`[Callback] CheckoutRequestID=${CheckoutRequestID}  ResultCode=${ResultCode}  Desc="${ResultDesc}"`);

    if (String(ResultCode) === '0') {
      // Payment successful — extract metadata items
      const items = CallbackMetadata?.Item || [];
      const get   = (name) => items.find(i => i.Name === name)?.Value ?? null;

      const mpesaReceiptNumber = get('MpesaReceiptNumber');
      const transactionDate = String(get('TransactionDate'));
      const phoneNumber = String(get('PhoneNumber'));
      const amount = validateAmount(get('Amount'));

      const normPhone = normalisePhone(phoneNumber);
      if (!normPhone) {
        console.error(`[Callback] Invalid phone in callback: ${phoneNumber}`);
        return;
      }

      // ─────────────────────────────────────────────────────────────────
      // DUAL-FLOW ROUTING: Try rental first, fall through to BnB
      // ─────────────────────────────────────────────────────────────────
      console.log(`[Callback] Attempting dual-flow routing for ${normPhone}...`);

      let rentalResult = null;
      try {
        rentalResult = await handleRentalPayment({
          phone: normPhone,
          amount,
          mpesaReceiptNumber,
          transactionDate
        });
      } catch (err) {
        console.error(`[Callback] Rental flow error: ${err.message}`);
        rentalResult = { success: false, reason: err.message };
      }

      // If rental payment was processed successfully, we're done
      if (rentalResult && rentalResult.success) {
        console.log(`[Callback] ✅ RENTAL PAYMENT processed | tenant_id=${rentalResult.tenant_id} | payment_id=${rentalResult.payment_id}`);
        return;
      }

      // If no tenant found, or rental flow signaled fallthrough → process as BnB
      if (rentalResult === null || !rentalResult.success) {
        console.log(`[Callback] Rotating to BnB flow (rental: ${rentalResult ? 'failed' : 'not_found'})`);

        const booking = await store.confirm(CheckoutRequestID, {
          mpesaReceiptNumber,
          transactionDate,
          phoneNumber: normPhone,
        });

        if (booking) {
          console.log(`[Callback] ✅ BNB BOOKING confirmed | bookingId=${booking.bookingId} | receipt=${booking.mpesaReceiptNumber}`);

          // ── Queue booking with payment confirmation notifications (SMS + Email) ──
          if (booking.guestEmail) {
            try {
              const messagePhoneNumber = booking.confirmedPhone || booking.guestPhone;
              msgQueue.queueBookingWithPaymentConfirmationMessages(
                messagePhoneNumber,
                booking.guestEmail,
                {
                  ref: booking.ref,
                  guestName: booking.guestName,
                  mpesaReceiptNumber: booking.mpesaReceiptNumber,
                  amount: booking.amount,
                  checkin: booking.checkin,
                  checkout: booking.checkout,
                  property: booking.property,
                  transactionDate: booking.transactionDate,
                  nights: booking.nights,
                }
              );
              console.log(`[Callback] Messages queued for booking ${booking.bookingId}`);
            } catch (msgErr) {
              console.error(`[Callback] Failed to queue messages: ${msgErr.message}`);
            }
          }
        } else {
          console.warn(`[Callback] No booking found for CheckoutRequestID=${CheckoutRequestID}`);
        }
      }

    } else {
      // Payment failed (wrong PIN, cancelled, insufficient funds, timeout)
      const booking = await store.fail(CheckoutRequestID, ResultDesc);
      if (booking) {
        console.log(`[Callback] ❌ BNB BOOKING FAILED | bookingId=${booking.bookingId} | reason="${ResultDesc}"`);
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
router.get('/status/:bookingId', async (req, res) => {
  const booking = await store.getById(req.params.bookingId);
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
    if (String(darajaRes.ResultCode) === '0' && bookingId) {
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
