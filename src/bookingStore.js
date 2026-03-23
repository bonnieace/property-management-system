/**
 * In-memory booking store.
 *
 * For production, swap every method body with real DB calls
 * (Postgres, MongoDB, Firestore — anything).  The interface stays identical
 * so the rest of the codebase never needs to change.
 *
 * Booking states:
 *   pending   → STK Push sent, waiting for user PIN
 *   confirmed → Safaricom callback received, ResultCode === 0
 *   failed    → Safaricom callback received, ResultCode !== 0
 *   expired   → No callback within 5 minutes
 *   cancelled → User cancelled before paying
 */

const { v4: uuidv4 } = require('uuid');

// bookings keyed by bookingId
const _bookings = new Map();

// secondary index: checkoutRequestId → bookingId  (set after STK Push)
const _byCheckout = new Map();

function _ref() {
  return 'NYH-' + uuidv4().replace(/-/g, '').toUpperCase().slice(0, 6);
}

/**
 * Create a new booking in PENDING state.
 */
function create({ type, unitId, property, guestName, guestPhone, guestEmail,
                  checkin, checkout, nights, guests, amount, notes }) {
  const bookingId = uuidv4();
  const ref       = _ref();
  const booking   = {
    bookingId,
    ref,
    type,           // 'bnb' | 'rental'
    unitId,
    property,       // 'nyathira' | 'kibabu'
    guestName,
    guestPhone,
    guestEmail,
    checkin,
    checkout,
    nights,
    guests,
    amount,
    notes,
    status:            'pending',
    checkoutRequestId: null,
    mpesaReceiptNumber: null,
    transactionDate:   null,
    createdAt:         new Date().toISOString(),
    updatedAt:         new Date().toISOString(),
  };
  _bookings.set(bookingId, booking);
  return booking;
}

/**
 * Attach the CheckoutRequestID returned by Daraja to the booking.
 */
function attachCheckout(bookingId, checkoutRequestId) {
  const b = _bookings.get(bookingId);
  if (!b) throw new Error(`Booking not found: ${bookingId}`);
  b.checkoutRequestId = checkoutRequestId;
  b.updatedAt = new Date().toISOString();
  _byCheckout.set(checkoutRequestId, bookingId);
  _bookings.set(bookingId, b);
  return b;
}

/**
 * Mark a booking as confirmed after a successful Safaricom callback.
 */
function confirm(checkoutRequestId, { mpesaReceiptNumber, transactionDate, phoneNumber }) {
  const bookingId = _byCheckout.get(checkoutRequestId);
  if (!bookingId) return null;
  const b = _bookings.get(bookingId);
  if (!b) return null;
  b.status             = 'confirmed';
  b.mpesaReceiptNumber = mpesaReceiptNumber;
  b.transactionDate    = transactionDate;
  b.confirmedPhone     = phoneNumber;
  b.updatedAt          = new Date().toISOString();
  _bookings.set(bookingId, b);
  return b;
}

/**
 * Mark a booking as failed (payment declined / wrong PIN / timeout).
 */
function fail(checkoutRequestId, reason) {
  const bookingId = _byCheckout.get(checkoutRequestId);
  if (!bookingId) return null;
  const b = _bookings.get(bookingId);
  if (!b) return null;
  b.status    = 'failed';
  b.failReason = reason;
  b.updatedAt = new Date().toISOString();
  _bookings.set(bookingId, b);
  return b;
}

/**
 * Fetch a booking by its internal UUID.
 */
function getById(bookingId) {
  return _bookings.get(bookingId) || null;
}

/**
 * Fetch a booking by CheckoutRequestID (for callback matching).
 */
function getByCheckout(checkoutRequestId) {
  const bookingId = _byCheckout.get(checkoutRequestId);
  return bookingId ? _bookings.get(bookingId) : null;
}

/**
 * Return all bookings (useful for an admin dashboard).
 */
function list() {
  return Array.from(_bookings.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

module.exports = { create, attachCheckout, confirm, fail, getById, getByCheckout, list };
