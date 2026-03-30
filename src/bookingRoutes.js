/**
 * Booking Routes
 * Endpoints for booking management (list, fetch, delete)
 * Note: Booking creation is handled by mpesaRoutes (M-Pesa flow)
 */

const express = require('express');
const router = express.Router();
const db = require('./db');

/**
 * GET /api/bookings
 * List bookings with optional filters
 * Query params: status, unitId, propertyId, startDate, endDate, phone
 */
router.get('/', async (req, res) => {
  try {
    const { status, unitId, propertyId, startDate, endDate, phone, limit = 50, offset = 0 } = req.query;

    let query = db('bookings')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(Math.min(parseInt(limit), 500))
      .offset(parseInt(offset));

    if (status) query = query.where('status', status);
    if (unitId) query = query.where('unit_id', unitId);
    if (propertyId) query = query.where('property_id', propertyId);
    if (phone) query = query.where('guest_phone', 'like', `%${phone}%`);
    if (startDate) query = query.whereRaw('checkin_date >= ?', [startDate]);
    if (endDate) query = query.whereRaw('checkout_date <= ?', [endDate]);

    const bookings = await query;

    res.json({
      ok: true,
      data: bookings,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: bookings.length,
      },
    });
  } catch (err) {
    console.error('[GET /api/bookings]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/bookings/:bookingId
 * Get single booking details
 */
router.get('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await db('bookings')
      .where('id', bookingId)
      .first();

    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    res.json({ ok: true, data: booking });
  } catch (err) {
    console.error('[GET /api/bookings/:bookingId]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/bookings/:bookingId
 * Delete/cancel a booking (admin only)
 * This triggers waitlist notifications if there are pending guests
 */
router.delete('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;

    const booking = await db('bookings')
      .where('id', bookingId)
      .first();

    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    // Update booking status to cancelled
    await db('bookings')
      .where('id', bookingId)
      .update({
        status: 'cancelled',
        notes: reason || 'Cancelled by admin',
        updated_at: db.fn.now(),
      });

    // Check for waitlist entries for the cancelled booking's dates
    const waitlistEntries = await db('waitlist')
      .where('unit_id', booking.unit_id)
      .where('preferred_checkin', '>=', booking.checkin_date)
      .where('preferred_checkout', '<=', booking.checkout_date)
      .where('notified', false)
      .orderBy('created_at', 'asc');

    // Mark all waitlist entries as notified (queue them for SMS/Email)
    if (waitlistEntries.length > 0) {
      await db('waitlist')
        .where('unit_id', booking.unit_id)
        .where('preferred_checkin', '>=', booking.checkin_date)
        .where('preferred_checkout', '<=', booking.checkout_date)
        .where('notified', false)
        .update({
          notified: true,
          notified_at: db.fn.now(),
        });

      // TODO: Queue SMS/Email notifications to waitlist guests
      // This integrates with messageQueue.js
      console.log(`[Waitlist] ${waitlistEntries.length} guests to notify for unit ${booking.unit_id}`);
    }

    res.json({
      ok: true,
      data: {
        bookingId,
        status: 'cancelled',
        waitlistNotifications: waitlistEntries.length,
      },
    });
  } catch (err) {
    console.error('[DELETE /api/bookings/:bookingId]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/bookings/:bookingId/audit
 * Get audit trail for a booking (M-Pesa transaction history)
 */
router.get('/:bookingId/audit', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const auditLog = await db('audit_log')
      .where('booking_id', bookingId)
      .orderBy('created_at', 'asc');

    res.json({
      ok: true,
      data: auditLog,
    });
  } catch (err) {
    console.error('[GET /api/bookings/:bookingId/audit]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
