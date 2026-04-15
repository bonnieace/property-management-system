const express    = require('express');
const daraja     = require('./daraja');
const store      = require('./bookingStore');
const rentalStore = require('./rentalDepositStore');
const msgQueue   = require('./messageQueue');
const db         = require('./db');
const tenantService = require('./tenantService');
const contractService = require('./contractService');
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
 * Creates tenant + contract on first payment (using transactions)
 * Then applies payment
 */
async function handleRentalPayment({
  phone,
  amount,
  mpesaReceiptNumber,
  transactionDate,
  booking, // NEW: pass booking object from callback
}) {
  const trx = await db.transaction(); // Start transaction
  
  try {
    console.log(`[Callback Rental] Processing rental payment for ${phone} | amount=${amount} KES | receipt=${mpesaReceiptNumber}`);

    // Get or create tenant (using transaction)
    let tenant = await trx('tenants')
      .where('tenant_phone', phone)
      .first();
    
    if (!tenant && booking) {
      console.log(`[Callback Rental] Creating new tenant for phone ${phone}...`);
      try {
        // Create tenant within transaction and get the ID
        const result = await trx('tenants').insert({
          tenant_phone: phone,
          tenant_name: booking.guestName,
          tenant_email: booking.guestEmail || null,
          id_number: null, // Collect later via admin form
          next_of_kin_phone: null,
          next_of_kin_name: null,
          notes: `Auto-registered from rental deposit | Booking ref: ${booking.ref}`
        }).returning('id');
        
        // Extract tenant ID from result
        let tenantId;
        if (Array.isArray(result) && result.length > 0) {
          tenantId = result[0].id || result[0];
        } else if (typeof result === 'number') {
          tenantId = result;
        } else {
          throw new Error('Failed to get tenant ID from insert result');
        }
        
        // Fetch the full tenant record from transaction
        tenant = await trx('tenants').where('id', tenantId).first();
        
        if (!tenant) {
          throw new Error(`Tenant created but could not be fetched (ID: ${tenantId})`);
        }
        
        console.log(`[Callback Rental] ✅ Tenant created ID=${tenant.id} (${tenant.tenant_name})`);
      } catch (createErr) {
        if (createErr.message.includes('already exists') || createErr.message.includes('unique')) {
          // Race condition — fetch it from transaction
          tenant = await trx('tenants')
            .where('tenant_phone', phone)
            .first();
          console.log(`[Callback Rental] Tenant was created by concurrent request`);
        } else {
          throw createErr;
        }
      }
    }

    if (!tenant) {
      await trx.rollback();
      console.warn(`[Callback Rental] Could not find or create tenant for phone ${phone}`);
      return null; // Signal to fall through to BnB flow
    }

    console.log(`[Callback Rental] Using tenant ID ${tenant.id} (${tenant.tenant_name})`);

    // Get active contract for tenant (using transaction)
    let contract = await trx('rental_contracts')
      .where('tenant_id', tenant.id)
      .where('status', 'active')
      .orderBy('start_date', 'desc')
      .first();

    // If no contract exists and we have booking info, create one (with transaction)
    if (!contract && booking) {
      console.log(`[Callback Rental] No active contract found — creating one...`);
      try {
        // Fetch unit details from transaction
        const unit = await trx('units')
          .where('id', booking.unit_id)
          .first();

        if (!unit) {
          throw new Error(`Unit not found: ${booking.unit_id}`);
        }

        // Verify property exists in transaction
        const property = await trx('properties')
          .where('property_id', booking.property_id)
          .first();

        if (!property) {
          throw new Error(`Property not found: ${booking.property_id}`);
        }

        // Determine start date (move-in or today)
        const startDate = booking.checkin_date || new Date().toISOString().split('T')[0];

        // Create contract within transaction
        const contractResult = await trx('rental_contracts').insert({
          tenant_id: tenant.id,
          unit_id: booking.unit_id,
          property_id: booking.property_id,
          start_date: startDate,
          end_date: null,
          monthly_rent_kes: unit.base_price_kes,
          payment_frequency: 'monthly',
          security_deposit_kes: amount, // First payment as security deposit
          utilities_deposit_kes: unit.water_deposit_kes || 0,
          status: 'active',
          contract_notes: `Auto-created from rental deposit | Booking: ${booking.ref}`
        }).returning('id');

        // Extract contract ID and fetch full record
        let contractId;
        if (Array.isArray(contractResult) && contractResult.length > 0) {
          contractId = contractResult[0].id || contractResult[0];
        } else if (typeof contractResult === 'string') {
          contractId = contractResult;
        } else {
          throw new Error('Failed to get contract ID from insert result');
        }
        
        contract = await trx('rental_contracts').where('id', contractId).first();

        if (!contract) {
          throw new Error(`Contract created but could not be fetched (ID: ${contractId})`);
        }

        console.log(`[Callback Rental] ✅ Contract created ID=${contract.id} | monthly_rent=${unit.base_price_kes} KES`);
      } catch (contractErr) {
        await trx.rollback();
        console.error(`[Callback Rental] Error creating contract: ${contractErr.message}`);
        return { success: false, reason: `Failed to create contract: ${contractErr.message}` };
      }
    }

    if (!contract) {
      await trx.rollback();
      console.warn(`[Callback Rental] No active contract for tenant ${tenant.id}`);
      return { success: false, reason: 'No active contract' };
    }

    console.log(`[Callback Rental] Using contract ${contract.id} | monthly rent = ${contract.monthly_rent_kes} KES`);

    // Determine payment month (current month)
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();
    const dueDate = new Date(year, month, 1); // First of next month (or same month)

    // Record payment within transaction
    const paymentResult = await trx('rental_payments').insert({
      contract_id: contract.id,
      tenant_id: tenant.id,
      unit_id: contract.unit_id,
      month,
      year,
      amount_due_kes: contract.monthly_rent_kes,
      amount_paid_kes: Math.min(amount, contract.monthly_rent_kes),
      amount_outstanding_kes: Math.max(0, contract.monthly_rent_kes - amount),
      status: amount >= contract.monthly_rent_kes ? 'paid' : 'partial',
      due_date: dueDate.toISOString().split('T')[0],
      paid_date: amount >= contract.monthly_rent_kes ? now.toISOString().split('T')[0] : null,
      mpesa_receipt_number: mpesaReceiptNumber,
      mpesa_phone: phone,
      reference: `received_${mpesaReceiptNumber}`,
      notes: `M-Pesa payment on ${now.toISOString().split('T')[0]}`
    }).returning('id');

    // Extract payment ID and fetch full record
    let paymentId;
    if (Array.isArray(paymentResult) && paymentResult.length > 0) {
      paymentId = paymentResult[0].id || paymentResult[0];
    } else if (typeof paymentResult === 'number') {
      paymentId = paymentResult;
    } else {
      throw new Error('Failed to get payment ID from insert result');
    }
    
    const payment = await trx('rental_payments').where('id', paymentId).first();

    if (!payment) {
      throw new Error(`Payment recorded but could not be fetched (ID: ${paymentId})`);
    }

    console.log(`[Callback Rental] Payment recorded ID=${payment.id} | status=confirmed | amount=${amount} KES`);

    // Commit transaction
    await trx.commit();

    // Queue SMS notification to tenant (outside transaction)
    try {
      msgQueue.queueMessage('sms', phone, 'rental_payment_confirmation', {
        tenant_name: tenant.tenant_name,
        month: payment.month,
        year: payment.year,
        amount_paid: payment.amount_paid_kes,
        outstanding: payment.amount_outstanding_kes,
        mpesa_receipt: payment.mpesa_receipt_number
      });
      console.log(`[Callback Rental] SMS queued for tenant ${phone}`);
    } catch (err) {
      console.error(`[Callback Rental] Failed to queue SMS: ${err.message}`);
    }

    return {
      success: true,
      tenant_id: tenant.id,
      contract_id: contract.id,
      payment_id: payment.id,
      status: 'confirmed',
      amount_paid: payment.amount_paid_kes
    };
  } catch (err) {
    await trx.rollback();
    console.error(`[Callback Rental] Transaction error: ${err.message}`);
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

    // ── Determine flow: Rental vs B&B ──
    const isRental = type === 'rental';
    
    // ── Create pending record (booking or rental deposit) ──
    let record;
    if (isRental) {
      record = await rentalStore.create({
        unitId:      unitId || 'unknown',
        property:    property || 'nyathira',
        guestName:   guestName.trim(),
        guestPhone:  guestPhone || phone,
        guestEmail:  guestEmail || '',
        checkin:     checkin || null,
        amount:      normAmount,
        notes:       notes || '',
      });
    } else {
      record = await store.create({
        type:        'bnb',
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
    }

    // ── Fire STK Push ──
    const darajaRes = await daraja.stkPush({
      phone:  normPhone,
      amount: normAmount,
      ref:    record.ref,
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
    const recordId = isRental ? record.depositId : record.bookingId;
    const activeStore = isRental ? rentalStore : store;
    await activeStore.attachCheckout(recordId, darajaRes.CheckoutRequestID);

    const logId = isRental ? `depositId=${recordId}` : `bookingId=${recordId}`;
    console.log(`[STK] Sent → ${logId}  checkout=${darajaRes.CheckoutRequestID}  amount=${normAmount}  phone=${normPhone}`);

    return res.json({
      ok:               true,
      bookingId:        recordId,
      ref:              record.ref,
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
      // DUAL-FLOW ROUTING: Check rental_deposits first, then fall to BnB
      // ─────────────────────────────────────────────────────────────────
      console.log(`[Callback] Attempting dual-flow routing for ${normPhone}...`);

      // Step 1: Check if this is a rental deposit
      let rentalDeposit = null;
      try {
        rentalDeposit = await db('rental_deposits')
          .where('checkout_request_id', CheckoutRequestID)
          .first();
        
        if (rentalDeposit) {
          console.log(`[Callback] Found rental_deposit: id=${rentalDeposit.id} | status=${rentalDeposit.status}`);
        }
      } catch (err) {
        console.warn(`[Callback] Error checking rental_deposits: ${err.message}`);
      }

      // Step 2: If rental deposit found, get the unit details for rental flow context
      let rentalBooking = null;
      if (rentalDeposit) {
        try {
          const unit = await db('units').where('id', rentalDeposit.unit_id).first();
          rentalBooking = {
            ref: rentalDeposit.reference,
            guestName: rentalDeposit.guest_name,
            guestEmail: rentalDeposit.guest_email,
            guestPhone: rentalDeposit.guest_phone,
            unit_id: rentalDeposit.unit_id,
            property_id: rentalDeposit.property_id,
            checkin_date: rentalDeposit.checkin_date,
            amount: rentalDeposit.amount_kes
          };
          console.log(`[Callback] Prepared rental booking context: ${rentalBooking.guestName}`);
        } catch (err) {
          console.warn(`[Callback] Error preparing rental context: ${err.message}`);
        }
      }

      // Step 3: Try rental flow if deposit found
      let rentalResult = null;
      if (rentalDeposit) {
        try {
          rentalResult = await handleRentalPayment({
            phone: normPhone,
            amount,
            mpesaReceiptNumber,
            transactionDate,
            booking: rentalBooking
          });
          
          if (rentalResult && rentalResult.success) {
            // Update rental_deposits record with tenant+contract IDs
            await db('rental_deposits')
              .where('id', rentalDeposit.id)
              .update({
                tenant_id: rentalResult.tenant_id,
                contract_id: rentalResult.contract_id,
                mpesa_receipt_number: mpesaReceiptNumber,
                mpesa_phone: normPhone,
                status: 'confirmed'
              });
            
            console.log(`[Callback] ✅ RENTAL DEPOSIT confirmed | tenant_id=${rentalResult.tenant_id} | contract_id=${rentalResult.contract_id}`);
            return;
          }
        } catch (err) {
          console.error(`[Callback] Rental flow error: ${err.message}`);
          rentalResult = { success: false, reason: err.message };
        }
      }

      // Step 4: If no rental deposit or rental flow failed, try BnB booking
      if (!rentalDeposit || !rentalResult || !rentalResult.success) {
        console.log(`[Callback] Falling back to BnB flow (rental_deposit=${!!rentalDeposit}, result=${rentalResult ? rentalResult.success : 'none'})`);

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
          console.warn(`[Callback] No booking or deposit found for CheckoutRequestID=${CheckoutRequestID}`);
        }
      }

    } else {
      // Payment failed (wrong PIN, cancelled, insufficient funds, timeout)
      
      // Check rental_deposits first
      let rentalDeposit = await db('rental_deposits')
        .where('checkout_request_id', CheckoutRequestID)
        .first();
      
      if (rentalDeposit) {
        // Mark rental deposit as failed
        await db('rental_deposits')
          .where('id', rentalDeposit.id)
          .update({ status: 'failed' });
        
        console.log(`[Callback] ❌ RENTAL DEPOSIT FAILED | depositId=${rentalDeposit.id} | reason="${ResultDesc}"`);
      } else {
        // Fall back to BnB booking failure
        const booking = await store.fail(CheckoutRequestID, ResultDesc);
        if (booking) {
          console.log(`[Callback] ❌ BNB BOOKING FAILED | bookingId=${booking.bookingId} | reason="${ResultDesc}"`);
        }
      }
    }
  } catch (err) {
    console.error('[Callback] Processing error:', err.message);
  }
});

// ─── GET /api/mpesa/status/:bookingId ─────────────────────────────────────
//
// Browser polls this every 3 seconds while showing the countdown timer.
// Returns the current booking/deposit status without hitting Daraja.
// Checks rental_deposits first, then falls back to bookings.
//
router.get('/status/:bookingId', async (req, res) => {
  // Try rental_deposits first
  let record = await db('rental_deposits')
    .where('id', req.params.bookingId)
    .first();
  
  if (!record) {
    // Fall back to bookings
    record = await store.getById(req.params.bookingId);
  }
  
  if (!record) {
    return res.status(404).json({ ok: false, error: 'Record not found.' });
  }

  return res.json({
    ok:                true,
    status:            record.status,          // pending | confirmed | failed | expired
    ref:               record.reference || record.ref,
    mpesaReceiptNumber: record.mpesa_receipt_number || record.mpesaReceiptNumber,
    amount:            record.amount_kes || record.amount,
    guestName:         record.guest_name || record.guestName,
    property:          record.property_id || record.property,
    unitId:            record.unit_id || record.unitId,
    checkin:           record.checkin_date || record.checkin,
    checkout:          record.checkout_date || record.checkout,
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
