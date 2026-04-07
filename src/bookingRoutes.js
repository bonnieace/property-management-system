/**
 * Booking Routes
 * Endpoints for booking management (list, fetch, create, update, delete)
 * Note: M-Pesa payment flow is handled by mpesaRoutes
 */

const express = require('express');
const router = express.Router();
const db = require('./db');
const bookingStore = require('./bookingStore');

/**
 * GET /api/bookings
 * List bookings with optional filters
 * Query params: status, unitId, propertyId, startDate, endDate, phone, bookingType
 * NOTE: Date filters use overlap logic - shows bookings that overlap the date range
 */
router.get('/', async (req, res) => {
  try {
    const { status, unitId, propertyId, startDate, endDate, phone, bookingType, limit = 50, offset = 0 } = req.query;

    let query = db('bookings')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(Math.min(parseInt(limit), 500))
      .offset(parseInt(offset));

    if (status) query = query.where('status', status);
    if (unitId) query = query.where('unit_id', unitId);
    if (propertyId) query = query.where('property_id', propertyId);
    if (phone) query = query.where('guest_phone', 'like', `%${phone}%`);
    if (bookingType) query = query.where('booking_type', bookingType);
    
    // Debug logging for date filtering
    if (startDate || endDate) {
      console.log('[Bookings API] Fetching bookings with date filter:', { startDate, endDate });
    }
    
    // OVERLAP LOGIC: Show bookings that overlap the requested date range
    // checkout_date >= startDate means booking ends on/after range starts
    // checkin_date <= endDate means booking starts on/before range ends
    if (startDate) query = query.whereRaw('checkout_date >= ?', [startDate]);
    if (endDate) query = query.whereRaw('checkin_date <= ?', [endDate]);

    const bookings = await query;
    
    if (startDate || endDate) {
      console.log('[Bookings API] Found', bookings.length, 'bookings');
    }

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
 * POST /api/bookings
 * Create a new booking (admin endpoint)
 * Body: unit_id, property_id, booking_type, guest_name, guest_phone, guest_email, 
 *        total_guests, checkin_date, checkout_date, total_amount_kes, status, notes
 */
router.post('/', async (req, res) => {
  try {
    const { 
      unit_id,
      property_id,
      booking_type, 
      guest_name, 
      guest_phone, 
      guest_email,
      total_guests,
      checkin_date, 
      checkout_date, 
      total_amount_kes, 
      status = 'pending',
      reference,
      notes 
    } = req.body;

    // Validate required fields
    if (!unit_id || !property_id || !booking_type || !guest_name || !guest_phone || !total_guests || !checkin_date || !checkout_date || !total_amount_kes) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    // Validate dates
    const checkin = new Date(checkin_date);
    const checkout = new Date(checkout_date);
    if (checkout <= checkin) {
      return res.status(400).json({ ok: false, error: 'Checkout date must be after checkin date' });
    }

    // Check for conflicts with other confirmed bookings
    const conflicts = await db('bookings')
      .where('unit_id', unit_id)
      .where('status', 'confirmed')
      .whereRaw('checkout_date > ?', [checkin_date])
      .whereRaw('checkin_date < ?', [checkout_date]);

    if (conflicts.length > 0) {
      return res.status(400).json({ ok: false, error: 'Dates conflict with existing bookings' });
    }

    // Create booking
    const bookingId = require('uuid').v4();
    const ref = reference || `NYH-${bookingId.replace(/-/g, '').toUpperCase().slice(0, 6)}`;
    
    const nights = Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24));

    const booking = {
      id: bookingId,
      unit_id,
      property_id,
      booking_type,
      guest_name,
      guest_phone,
      guest_email: guest_email || null,
      total_guests,
      checkin_date,
      checkout_date,
      nights,
      total_amount_kes,
      status,
      reference: ref,
      notes: notes || null,
    };

    await db('bookings').insert(booking);

    res.json({
      ok: true,
      data: { ...booking, id: bookingId },
    });
  } catch (err) {
    console.error('[POST /api/bookings]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/bookings/:bookingId
 * Update a booking (admin only)
 * Allows modifying: checkin_date, checkout_date, guest_name, guest_email, guest_phone, total_amount_kes, status
 */
router.put('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { checkin_date, checkout_date, guest_name, guest_email, guest_phone, total_amount_kes, status } = req.body;

    const booking = await db('bookings')
      .where('id', bookingId)
      .first();

    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    // Validate new dates if provided
    if (checkin_date && checkout_date) {
      const newCheckin = new Date(checkin_date);
      const newCheckout = new Date(checkout_date);
      if (newCheckout <= newCheckin) {
        return res.status(400).json({ ok: false, error: 'Checkout date must be after checkin date' });
      }
      
      // Check for conflicts with other bookings (excluding current booking)
      const conflicts = await db('bookings')
        .where('unit_id', booking.unit_id)
        .where('id', '!=', bookingId)
        .where('status', 'confirmed')
        .whereRaw('checkout_date > ?', [checkin_date])
        .whereRaw('checkin_date < ?', [checkout_date]);
      
      if (conflicts.length > 0) {
        return res.status(400).json({ ok: false, error: 'Dates conflict with existing bookings' });
      }
    }

    const updateData = {};
    if (checkin_date) updateData.checkin_date = checkin_date;
    if (checkout_date) updateData.checkout_date = checkout_date;
    if (guest_name) updateData.guest_name = guest_name;
    if (guest_email) updateData.guest_email = guest_email;
    if (guest_phone) updateData.guest_phone = guest_phone;
    if (total_amount_kes) updateData.total_amount_kes = total_amount_kes;
    if (status) updateData.status = status;
    updateData.updated_at = db.fn.now();

    await db('bookings')
      .where('id', bookingId)
      .update(updateData);

    const updatedBooking = await db('bookings')
      .where('id', bookingId)
      .first();

    res.json({
      ok: true,
      data: updatedBooking,
    });
  } catch (err) {
    console.error('[PUT /api/bookings/:bookingId]', err.message);
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
