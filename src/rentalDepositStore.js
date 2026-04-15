/**
 * Rental Deposit Store
 * Tracks pending rental deposits from public website
 * Separates rental payment initiation from bookings table
 * Once M-Pesa payment confirmed → creates tenant + contract
 */

const { v4: uuidv4 } = require('uuid');
const db = require('./db');

function _ref() {
  return 'NYH-' + uuidv4().replace(/-/g, '').toUpperCase().slice(0, 6);
}

/**
 * Create a new rental deposit record (PENDING state)
 */
async function create({ 
  unitId, 
  property, 
  guestName, 
  guestPhone, 
  guestEmail,
  checkin, 
  amount, 
  notes 
}) {
  try {
    // Get unit database ID from unitId (string)
    const unit = await db('units')
      .where('unit_id', unitId)
      .first('id');

    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }

    const depositId = uuidv4();
    const ref = _ref();

    const deposit = {
      id: depositId,
      unit_id: unit.id,
      property_id: property,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      intended_checkin_date: checkin,
      deposit_amount_kes: amount,
      guest_notes: notes,
      reference: ref,
      checkout_request_id: null,
      mpesa_receipt_number: null,
      mpesa_phone: null,
      status: 'pending',
    };

    // Insert into database
    await db('rental_deposits').insert(deposit);

    // Return in standardized format for compatibility
    return {
      depositId,
      ref,
      unitId,
      property,
      guestName,
      guestPhone,
      guestEmail,
      checkin,
      amount,
      notes,
      status: 'pending',
      checkoutRequestId: null,
      mpesaReceiptNumber: null,
      transactionDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[rentalDepositStore.create]', err.message);
    throw err;
  }
}

/**
 * Attach the CheckoutRequestID from Daraja to the deposit
 */
async function attachCheckout(depositId, checkoutRequestId) {
  try {
    if (!depositId) {
      throw new Error('Deposit ID is required');
    }

    const deposit = await db('rental_deposits')
      .where('id', depositId)
      .first();

    if (!deposit) {
      throw new Error(`Rental deposit not found: ${depositId}`);
    }

    await db('rental_deposits')
      .where('id', depositId)
      .update({
        checkout_request_id: checkoutRequestId,
        updated_at: db.fn.now(),
      });

    return {
      ...deposit,
      checkoutRequestId,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[rentalDepositStore.attachCheckout]', err.message);
    throw err;
  }
}

/**
 * Mark deposit as confirmed after successful M-Pesa callback
 */
async function confirm(checkoutRequestId, { mpesaReceiptNumber, transactionDate, phoneNumber }) {
  try {
    const deposit = await db('rental_deposits')
      .where('checkout_request_id', checkoutRequestId)
      .first();

    if (!deposit) {
      return null;
    }

    await db('rental_deposits')
      .where('id', deposit.id)
      .update({
        status: 'confirmed',
        mpesa_receipt_number: mpesaReceiptNumber,
        mpesa_phone: phoneNumber,
        mpesa_transaction_date: transactionDate,
        updated_at: db.fn.now(),
      });

    // Get unit info for mapping
    const unit = await db('units')
      .where('id', deposit.unit_id)
      .first('unit_id');

    // Return properly mapped object
    return {
      depositId: deposit.id,
      ref: deposit.reference,
      unitId: unit?.unit_id,
      property: deposit.property_id,
      guestName: deposit.guest_name,
      guestPhone: deposit.guest_phone,
      guestEmail: deposit.guest_email,
      checkin: deposit.intended_checkin_date,
      amount: deposit.deposit_amount_kes,
      status: 'confirmed',
      checkoutRequestId: deposit.checkout_request_id,
      mpesaReceiptNumber,
      transactionDate,
      confirmedPhone: phoneNumber,
      notes: deposit.guest_notes,
      createdAt: deposit.created_at,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[rentalDepositStore.confirm]', err.message);
    throw err;
  }
}

/**
 * Mark deposit as failed
 */
async function fail(checkoutRequestId, reason) {
  try {
    const deposit = await db('rental_deposits')
      .where('checkout_request_id', checkoutRequestId)
      .first();

    if (!deposit) {
      return null;
    }

    await db('rental_deposits')
      .where('id', deposit.id)
      .update({
        status: 'failed',
        updated_at: db.fn.now(),
      });

    // Get unit info for mapping
    const unit = await db('units')
      .where('id', deposit.unit_id)
      .first('unit_id');

    // Return properly mapped object
    return {
      depositId: deposit.id,
      ref: deposit.reference,
      unitId: unit?.unit_id,
      property: deposit.property_id,
      guestName: deposit.guest_name,
      guestPhone: deposit.guest_phone,
      guestEmail: deposit.guest_email,
      checkin: deposit.intended_checkin_date,
      amount: deposit.deposit_amount_kes,
      status: 'failed',
      checkoutRequestId: deposit.checkout_request_id,
      notes: reason || 'Deposit failed',
      createdAt: deposit.created_at,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[rentalDepositStore.fail]', err.message);
    throw err;
  }
}

/**
 * Get deposit by ID
 */
async function getById(depositId) {
  try {
    const deposit = await db('rental_deposits')
      .where('id', depositId)
      .first();

    if (!deposit) {
      return null;
    }

    // Get unit info for mapping
    const unit = await db('units')
      .where('id', deposit.unit_id)
      .first('unit_id');

    return {
      depositId: deposit.id,
      ref: deposit.reference,
      unitId: unit?.unit_id,
      property: deposit.property_id,
      guestName: deposit.guest_name,
      guestPhone: deposit.guest_phone,
      guestEmail: deposit.guest_email,
      checkin: deposit.intended_checkin_date,
      amount: deposit.deposit_amount_kes,
      status: deposit.status,
      checkoutRequestId: deposit.checkout_request_id,
      mpesaReceiptNumber: deposit.mpesa_receipt_number,
      mpesaPhone: deposit.mpesa_phone,
      notes: deposit.guest_notes,
      createdAt: deposit.created_at,
      updatedAt: deposit.updated_at,
    };
  } catch (err) {
    console.error('[rentalDepositStore.getById]', err.message);
    throw err;
  }
}

module.exports = {
  create,
  attachCheckout,
  confirm,
  fail,
  getById,
};
