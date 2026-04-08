/**
 * Database-backed Booking Store
 * Refactored from in-memory storage to PostgreSQL
 * Maintains the same interface for compatibility with M-Pesa flow
 *
 * Booking states:
 *   pending   → STK Push sent, waiting for user PIN
 *   confirmed → Safaricom callback received, ResultCode === 0
 *   failed    → Safaricom callback received, ResultCode !== 0
 *   expired   → No callback within 5 minutes (handled by cleanup job)
 *   cancelled → User cancelled before paying
 */

const { v4: uuidv4 } = require('uuid');
const db = require('./db');

function _ref() {
  return 'NYH-' + uuidv4().replace(/-/g, '').toUpperCase().slice(0, 6);
}

/**
 * Create a new booking in PENDING state
 */
async function create({ type, unitId, property, guestName, guestPhone, guestEmail,
                        checkin, checkout, nights, guests, amount, notes }) {
  try {
    // Get unit database ID from unitId (string)
    const unit = await db('units')
      .where('unit_id', unitId)
      .first('id');

    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }

    const bookingId = uuidv4();
    const ref = _ref();

    const booking = {
      id: bookingId,
      unit_id: unit.id,
      property_id: property,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      checkin_date: checkin,
      checkout_date: checkout,
      nights,
      total_guests: guests,
      booking_type: type,
      total_amount_kes: amount,
      status: 'pending',
      reference: ref,
      checkout_request_id: null,
      mpesa_receipt_number: null,
      mpesa_phone: null,
      notes,
    };

    // Insert into database
    await db('bookings').insert(booking);

    // Return in original format for compatibility
    return {
      bookingId,
      ref,
      type,
      unitId,
      property,
      guestName,
      guestPhone,
      guestEmail,
      checkin,
      checkout,
      nights,
      guests,
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
    console.error('[bookingStore.create]', err.message);
    throw err;
  }
}

/**
 * Attach the CheckoutRequestID from Daraja to the booking
 */
async function attachCheckout(bookingId, checkoutRequestId) {
  try {
    if (!bookingId) {
      throw new Error('Booking ID is required');
    }

    const booking = await db('bookings')
      .where('id', bookingId)
      .first();

    if (!booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    await db('bookings')
      .where('id', bookingId)
      .update({
        checkout_request_id: checkoutRequestId,
        updated_at: db.fn.now(),
      });

    // Return updated booking
    return {
      ...booking,
      checkoutRequestId,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[bookingStore.attachCheckout]', err.message);
    throw err;
  }
}

/**
 * Mark booking as confirmed after successful Safaricom callback
 */
async function confirm(checkoutRequestId, { mpesaReceiptNumber, transactionDate, phoneNumber }) {
  try {
    const booking = await db('bookings')
      .where('checkout_request_id', checkoutRequestId)
      .first();

    if (!booking) {
      return null;
    }

    await db('bookings')
      .where('id', booking.id)
      .update({
        status: 'confirmed',
        mpesa_receipt_number: mpesaReceiptNumber,
        mpesa_phone: phoneNumber,
        updated_at: db.fn.now(),
      });

    // Get unit info for mapping
    const unit = await db('units')
      .where('id', booking.unit_id)
      .first('unit_id');

    // Return properly mapped object
    return {
      bookingId: booking.id,
      ref: booking.reference,
      type: booking.booking_type,
      unitId: unit?.unit_id,
      property: booking.property_id,
      guestName: booking.guest_name,
      guestPhone: booking.guest_phone,
      guestEmail: booking.guest_email,
      checkin: booking.checkin_date,
      checkout: booking.checkout_date,
      nights: booking.nights,
      guests: booking.total_guests,
      amount: booking.total_amount_kes,
      status: 'confirmed',
      checkoutRequestId: booking.checkout_request_id,
      mpesaReceiptNumber,
      transactionDate,
      confirmedPhone: phoneNumber,
      notes: booking.notes,
      createdAt: booking.created_at,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[bookingStore.confirm]', err.message);
    throw err;
  }
}

/**
 * Mark booking as failed
 */
async function fail(checkoutRequestId, reason) {
  try {
    const booking = await db('bookings')
      .where('checkout_request_id', checkoutRequestId)
      .first();

    if (!booking) {
      return null;
    }

    await db('bookings')
      .where('id', booking.id)
      .update({
        status: 'failed',
        notes: reason || 'Payment failed',
        updated_at: db.fn.now(),
      });

    // Get unit info for mapping
    const unit = await db('units')
      .where('id', booking.unit_id)
      .first('unit_id');

    // Return properly mapped object
    return {
      bookingId: booking.id,
      ref: booking.reference,
      type: booking.booking_type,
      unitId: unit?.unit_id,
      property: booking.property_id,
      guestName: booking.guest_name,
      guestPhone: booking.guest_phone,
      guestEmail: booking.guest_email,
      checkin: booking.checkin_date,
      checkout: booking.checkout_date,
      nights: booking.nights,
      guests: booking.total_guests,
      amount: booking.total_amount_kes,
      status: 'failed',
      checkoutRequestId: booking.checkout_request_id,
      mpesaReceiptNumber: booking.mpesa_receipt_number,
      notes: reason || 'Payment failed',
      createdAt: booking.created_at,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[bookingStore.fail]', err.message);
    throw err;
  }
}

/**
 * Get booking by ID
 */
async function getById(bookingId) {
  try {
    const booking = await db('bookings')
      .where('id', bookingId)
      .first();

    if (!booking) {
      return null;
    }

    // Get unit info
    const unit = await db('units')
      .where('id', booking.unit_id)
      .first('unit_id');

    return {
      bookingId: booking.id,
      ref: booking.reference,
      type: booking.booking_type,
      unitId: unit?.unit_id,
      property: booking.property_id,
      guestName: booking.guest_name,
      guestPhone: booking.guest_phone,
      guestEmail: booking.guest_email,
      checkin: booking.checkin_date,
      checkout: booking.checkout_date,
      nights: booking.nights,
      guests: booking.total_guests,
      amount: booking.total_amount_kes,
      status: booking.status,
      checkoutRequestId: booking.checkout_request_id,
      mpesaReceiptNumber: booking.mpesa_receipt_number,
      transactionDate: booking.updated_at,
      notes: booking.notes,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    };
  } catch (err) {
    console.error('[bookingStore.getById]', err.message);
    return null;
  }
}

/**
 * Get booking by checkout request ID (for M-Pesa callback)
 */
async function getByCheckout(checkoutRequestId) {
  try {
    const booking = await db('bookings')
      .where('checkout_request_id', checkoutRequestId)
      .first();

    if (!booking) {
      return null;
    }

    return getById(booking.id);
  } catch (err) {
    console.error('[bookingStore.getByCheckout]', err.message);
    return null;
  }
}

/**
 * List all bookings with optional filters
 */
async function list(filters = {}) {
  try {
    const { status, unitId, propertyId, limit = 100 } = filters;

    let query = db('bookings').orderBy('created_at', 'desc').limit(Math.min(limit, 1000));

    if (status) query = query.where('status', status);
    if (unitId) query = query.where('unit_id', unitId);
    if (propertyId) query = query.where('property_id', propertyId);

    const bookings = await query;

    // Convert to old format
    return bookings.map(b => ({
      bookingId: b.id,
      ref: b.reference,
      type: b.booking_type,
      property: b.property_id,
      guestName: b.guest_name,
      status: b.status,
      createdAt: b.created_at,
    }));
  } catch (err) {
    console.error('[bookingStore.list]', err.message);
    return [];
  }
}

module.exports = { create, attachCheckout, confirm, fail, getById, getByCheckout, list };
