/**
 * ADMIN ROUTES
 * Managing pricing rules, blocked dates, bookings, waitlist, and audit logs
 */

const express = require('express');
const router = express.Router();
const db = require('./db');
const {
  adminAuthMiddleware,
  propertyAccessMiddleware,
  permissionMiddleware,
  authenticateUser,
  generateToken
} = require('./adminAuth');

// ─────────────────────────────────────────────────────
// AUTHENTICATION ENDPOINTS
// ─────────────────────────────────────────────────────

/**
 * POST /admin/login
 * Admin user login with username/password
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password required' });
    }

    const result = authenticateUser(username, password);

    if (!result.ok) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('[Admin Login]', err);
    res.status(500).json({ ok: false, error: 'Authentication failed' });
  }
});

/**
 * POST /admin/verify
 * Verify JWT token validity
 */
router.post('/verify', adminAuthMiddleware, (req, res) => {
  res.json({
    ok: true,
    user: req.admin
  });
});

// ─────────────────────────────────────────────────────
// PRICING RULES ENDPOINTS
// ─────────────────────────────────────────────────────

/**
 * GET /admin/pricing-rules
 * List all pricing rules (optionally filtered by unit or date range)
 */
router.get('/pricing-rules', adminAuthMiddleware, async (req, res) => {
  try {
    const { unitId, startDate, endDate, isActive } = req.query;

    let query = db('pricing_rules');

    if (unitId) query.where('unit_id', unitId);
    if (startDate) query.where('end_date', '>=', startDate);
    if (endDate) query.where('start_date', '<=', endDate);
    if (isActive !== undefined) query.where('is_active', isActive === 'true');

    const rules = await query.orderBy('created_at', 'desc');

    res.json({
      ok: true,
      data: rules,
      count: rules.length
    });
  } catch (err) {
    console.error('[Get Pricing Rules]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch pricing rules' });
  }
});

/**
 * POST /admin/pricing-rules
 * Create new pricing rule
 */
router.post('/pricing-rules', adminAuthMiddleware, permissionMiddleware('write'), async (req, res) => {
  try {
    const { unitId, startDate, endDate, pricePerNightKes, reason } = req.body;

    if (!unitId || !startDate || !endDate || !pricePerNightKes) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: unitId, startDate, endDate, pricePerNightKes'
      });
    }

    // Validate dates
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        ok: false,
        error: 'Start date must be before end date'
      });
    }

    // Verify unit exists
    const unit = await db('units').where('unit_id', unitId).first();
    if (!unit) {
      return res.status(404).json({ ok: false, error: 'Unit not found' });
    }

    const now = new Date().toISOString();
    const rule = {
      unit_id: unitId,
      start_date: startDate,
      end_date: endDate,
      price_per_night_kes: pricePerNightKes,
      reason: reason || 'Seasonal pricing',
      is_active: true,
      created_by: req.admin.username,
      created_at: now,
      updated_at: now
    };

    const [id] = await db('pricing_rules').insert(rule);

    res.json({
      ok: true,
      id,
      data: { ...rule, id }
    });
  } catch (err) {
    console.error('[Create Pricing Rule]', err);
    res.status(500).json({ ok: false, error: 'Failed to create pricing rule' });
  }
});

/**
 * PUT /admin/pricing-rules/:id
 * Update pricing rule
 */
router.put('/pricing-rules/:id', adminAuthMiddleware, permissionMiddleware('write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { pricePerNightKes, reason, isActive } = req.body;

    const rule = await db('pricing_rules').where('id', id).first();
    if (!rule) {
      return res.status(404).json({ ok: false, error: 'Pricing rule not found' });
    }

    const updates = {
      updated_at: new Date().toISOString(),
      updated_by: req.admin.username
    };

    if (pricePerNightKes !== undefined) updates.price_per_night_kes = pricePerNightKes;
    if (reason !== undefined) updates.reason = reason;
    if (isActive !== undefined) updates.is_active = isActive;

    await db('pricing_rules').where('id', id).update(updates);

    res.json({ ok: true, id });
  } catch (err) {
    console.error('[Update Pricing Rule]', err);
    res.status(500).json({ ok: false, error: 'Failed to update pricing rule' });
  }
});

/**
 * DELETE /admin/pricing-rules/:id
 * Delete pricing rule
 */
router.delete('/pricing-rules/:id', adminAuthMiddleware, permissionMiddleware('write'), async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await db('pricing_rules').where('id', id).first();
    if (!rule) {
      return res.status(404).json({ ok: false, error: 'Pricing rule not found' });
    }

    await db('pricing_rules').where('id', id).delete();

    res.json({ ok: true });
  } catch (err) {
    console.error('[Delete Pricing Rule]', err);
    res.status(500).json({ ok: false, error: 'Failed to delete pricing rule' });
  }
});

// ─────────────────────────────────────────────────────
// BLOCKED DATES ENDPOINTS
// ─────────────────────────────────────────────────────

/**
 * GET /admin/blocked-dates
 * List all blocked/maintenance dates
 */
router.get('/blocked-dates', adminAuthMiddleware, async (req, res) => {
  try {
    const { unitId, startDate, endDate } = req.query;

    let query = db('availability_blocks');

    if (unitId) query.where('unit_id', unitId);
    if (startDate) query.where('end_date', '>=', startDate);
    if (endDate) query.where('start_date', '<=', endDate);

    const blocks = await query.orderBy('start_date', 'asc');

    res.json({
      ok: true,
      data: blocks,
      count: blocks.length
    });
  } catch (err) {
    console.error('[Get Blocked Dates]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch blocked dates' });
  }
});

/**
 * POST /admin/blocked-dates
 * Create blocked date block
 */
router.post('/blocked-dates', adminAuthMiddleware, permissionMiddleware('write'), async (req, res) => {
  try {
    const { unitId, startDate, endDate, reason } = req.body;

    if (!unitId || !startDate || !endDate) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: unitId, startDate, endDate'
      });
    }

    // Validate dates
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        ok: false,
        error: 'Start date must be before end date'
      });
    }

    // Verify unit exists
    const unit = await db('units').where('unit_id', unitId).first();
    if (!unit) {
      return res.status(404).json({ ok: false, error: 'Unit not found' });
    }

    const now = new Date().toISOString();
    const block = {
      unit_id: unitId,
      start_date: startDate,
      end_date: endDate,
      reason: reason || 'Maintenance',
      blocked_by: req.admin.username,
      created_at: now
    };

    const [id] = await db('availability_blocks').insert(block);

    res.json({
      ok: true,
      id,
      data: { ...block, id }
    });
  } catch (err) {
    console.error('[Create Blocked Date]', err);
    res.status(500).json({ ok: false, error: 'Failed to create blocked date' });
  }
});

/**
 * DELETE /admin/blocked-dates/:id
 * Remove blocked date block
 */
router.delete('/blocked-dates/:id', adminAuthMiddleware, permissionMiddleware('write'), async (req, res) => {
  try {
    const { id } = req.params;

    const block = await db('availability_blocks').where('id', id).first();
    if (!block) {
      return res.status(404).json({ ok: false, error: 'Blocked date not found' });
    }

    await db('availability_blocks').where('id', id).delete();

    res.json({ ok: true });
  } catch (err) {
    console.error('[Delete Blocked Date]', err);
    res.status(500).json({ ok: false, error: 'Failed to delete blocked date' });
  }
});

// ─────────────────────────────────────────────────────
// BOOKINGS MANAGEMENT ENDPOINTS
// ─────────────────────────────────────────────────────

/**
 * GET /admin/bookings
 * List all bookings with filters
 */
router.get('/bookings', adminAuthMiddleware, async (req, res) => {
  try {
    const { status, unitId, property, phone, dateFrom, dateTo, limit = 50, offset = 0 } = req.query;

    let query = db('bookings').select('*');

    if (status) query.where('status', status);
    if (unitId) query.where('unit_id', unitId);
    if (phone) query.where('guest_phone', 'like', `%${phone}%`);
    if (dateFrom) query.where('checkin_date', '>=', dateFrom);
    if (dateTo) query.where('checkout_date', '<=', dateTo);

    // Count total records with same filters (without select *)
    let countQuery = db('bookings');
    if (status) countQuery.where('status', status);
    if (unitId) countQuery.where('unit_id', unitId);
    if (phone) countQuery.where('guest_phone', 'like', `%${phone}%`);
    if (dateFrom) countQuery.where('checkin_date', '>=', dateFrom);
    if (dateTo) countQuery.where('checkout_date', '<=', dateTo);
    const total = await countQuery.count('id as count').first();
    const bookings = await query
      .orderBy('checkin_date', 'asc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    res.json({
      ok: true,
      data: bookings,
      count: bookings.length,
      total: total.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('[Get Bookings]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch bookings' });
  }
});

/**
 * GET /admin/bookings/:id
 * Get booking details with audit trail
 */
router.get('/bookings/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await db('bookings').where('id', id).first();
    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const audit = await db('audit_log')
      .where('booking_id', id)
      .orderBy('created_at', 'desc');

    res.json({
      ok: true,
      data: {
        ...booking,
        auditTrail: audit
      }
    });
  } catch (err) {
    console.error('[Get Booking Detail]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch booking' });
  }
});

/**
 * PUT /admin/bookings/:id
 * Update booking (status, notes)
 */
router.put('/bookings/:id', adminAuthMiddleware, permissionMiddleware('write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const booking = await db('bookings').where('id', id).first();
    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    const updates = {
      updated_at: new Date().toISOString()
    };

    if (status) updates.status = status;
    if (adminNotes !== undefined) updates.admin_notes = adminNotes;

    await db('bookings').where('id', id).update(updates);

    // Log change
    await db('audit_log').insert({
      booking_id: id,
      event_type: 'admin_update',
      event_data: JSON.stringify({ changes: updates, admin: req.admin.username }),
      created_at: new Date().toISOString()
    });

    res.json({ ok: true, id });
  } catch (err) {
    console.error('[Update Booking]', err);
    res.status(500).json({ ok: false, error: 'Failed to update booking' });
  }
});

// ─────────────────────────────────────────────────────
// WAITLIST ENDPOINTS
// ─────────────────────────────────────────────────────

/**
 * GET /admin/waitlist
 * View waitlist entries
 */
router.get('/waitlist', adminAuthMiddleware, async (req, res) => {
  try {
    const { unitId, status, limit = 50, offset = 0 } = req.query;

    let query = db('waitlist');

    if (unitId) query.where('unit_id', unitId);
    if (status) query.where('status', status);

    const total = await query.clone().count('id as count').first();
    const entries = await query
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    res.json({
      ok: true,
      data: entries,
      count: entries.length,
      total: total.count
    });
  } catch (err) {
    console.error('[Get Waitlist]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch waitlist' });
  }
});

/**
 * POST /admin/waitlist/:id/notify
 * Manually trigger notification for waitlist entry
 */
router.post('/waitlist/:id/notify', adminAuthMiddleware, permissionMiddleware('write'), async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await db('waitlist').where('id', id).first();
    if (!entry) {
      return res.status(404).json({ ok: false, error: 'Waitlist entry not found' });
    }

    // Update notification status
    await db('waitlist').where('id', id).update({
      notified: true,
      notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // TODO: Queue SMS/Email notification via messageQueue.js
    console.log(`[Waitlist Notify] Queuing notification for ${entry.guest_phone} - ${entry.unit_id}`);

    res.json({ ok: true });
  } catch (err) {
    console.error('[Waitlist Notify]', err);
    res.status(500).json({ ok: false, error: 'Failed to notify waitlist entry' });
  }
});

// ─────────────────────────────────────────────────────
// AUDIT LOG ENDPOINTS
// ─────────────────────────────────────────────────────

/**
 * GET /admin/audit-log
 * View audit trail
 */
router.get('/audit-log', adminAuthMiddleware, async (req, res) => {
  try {
    const { bookingId, eventType, limit = 100, offset = 0 } = req.query;

    let query = db('audit_log');

    if (bookingId) query.where('booking_id', bookingId);
    if (eventType) query.where('event_type', eventType);

    const total = await query.clone().count('id as count').first();
    const logs = await query
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    res.json({
      ok: true,
      data: logs,
      count: logs.length,
      total: total.count
    });
  } catch (err) {
    console.error('[Get Audit Log]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch audit log' });
  }
});

module.exports = router;
