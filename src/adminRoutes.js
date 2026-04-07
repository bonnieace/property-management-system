/**
 * ADMIN ROUTES
 * Managing pricing rules, blocked dates, bookings, waitlist, and audit logs
 */

const express = require('express');
const router = express.Router();
const db = require('./db');
const bcrypt = require('bcrypt');
const {
  adminAuthMiddleware,
  propertyAccessMiddleware,
  fullAccessMiddleware,
  permissionMiddleware,
  authenticateUser,
  generateToken,
  getAdminWithProperties
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

    const result = await authenticateUser(username, password);

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
// PROPERTIES ENDPOINTS
// ─────────────────────────────────────────────────────

/**
 * GET /admin/properties
 * List all properties (optionally filtered by status)
 */
router.get('/properties', adminAuthMiddleware, async (req, res) => {
  try {
    const { status } = req.query;

    let query = db('properties');

    if (status) {
      query.where('status', status);
    }

    const properties = await query.orderBy('created_at', 'desc');

    res.json({
      ok: true,
      data: properties
    });
  } catch (err) {
    console.error('[GET Properties]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch properties' });
  }
});

/**
 * POST /admin/properties
 * Create a new property
 */
router.post('/properties', adminAuthMiddleware, async (req, res) => {
  try {
    const { property_id, name, description, address, city, country, contact_person, contact_phone, email } = req.body;

    // Validate required fields
    if (!property_id || !name) {
      return res.status(400).json({ ok: false, error: 'property_id and name are required' });
    }

    // Check if property_id already exists
    const existing = await db('properties').where('property_id', property_id).first();
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Property ID already exists' });
    }

    const newProperty = {
      property_id,
      name,
      description: description || null,
      address: address || null,
      city: city || null,
      country: country || 'Kenya',
      contact_person: contact_person || null,
      contact_phone: contact_phone || null,
      email: email || null,
      status: 'active'
    };

    const [id] = await db('properties').insert(newProperty);

    const createdProperty = await db('properties').where('id', id).first();

    res.status(201).json({
      ok: true,
      data: createdProperty
    });
  } catch (err) {
    console.error('[POST Properties]', err);
    res.status(500).json({ ok: false, error: 'Failed to create property' });
  }
});

/**
 * PUT /admin/properties/:id
 * Update a property
 */
router.put('/properties/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, address, city, country, contact_person, contact_phone, email, status } = req.body;

    // Build update object with only provided fields
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (country !== undefined) updates.country = country;
    if (contact_person !== undefined) updates.contact_person = contact_person;
    if (contact_phone !== undefined) updates.contact_phone = contact_phone;
    if (email !== undefined) updates.email = email;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No fields to update' });
    }

    await db('properties').where('id', id).update(updates);

    const updatedProperty = await db('properties').where('id', id).first();

    if (!updatedProperty) {
      return res.status(404).json({ ok: false, error: 'Property not found' });
    }

    res.json({
      ok: true,
      data: updatedProperty
    });
  } catch (err) {
    console.error('[PUT Properties]', err);
    res.status(500).json({ ok: false, error: 'Failed to update property' });
  }
});

// ─────────────────────────────────────────────────────
// UNITS ENDPOINTS
// ─────────────────────────────────────────────────────

/**
 * GET /admin/units
 * List all units (optionally filtered by property_id, status, type)
 */
router.get('/units', adminAuthMiddleware, async (req, res) => {
  try {
    const { property_id, status, type } = req.query;

    let query = db('units');

    if (property_id) query.where('property_id', property_id);
    if (status) query.where('status', status);
    if (type) query.where('type', type);

    const units = await query.orderBy('created_at', 'desc');

    res.json({
      ok: true,
      data: units
    });
  } catch (err) {
    console.error('[GET Units]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch units' });
  }
});

/**
 * POST /admin/units
 * Create a new unit
 */
router.post('/units', adminAuthMiddleware, async (req, res) => {
  try {
    const {
      unit_id,
      property_id,
      type,
      name,
      description,
      bedrooms,
      bathrooms,
      max_guests,
      base_price_kes,
      extra_guest_charge,
      water_deposit_kes,
      min_night_stay
    } = req.body;

    // Validate required fields
    if (!unit_id || !property_id || !type || !name || bedrooms === undefined || bathrooms === undefined || !base_price_kes) {
      return res.status(400).json({
        ok: false,
        error: 'Required fields: unit_id, property_id, type, name, bedrooms, bathrooms, base_price_kes'
      });
    }

    // Validate type enum
    const validTypes = ['bnb', 'bedsit', '1bed', '2bed'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: `Type must be one of: ${validTypes.join(', ')}`
      });
    }

    // Check if unit_id already exists
    const existing = await db('units').where('unit_id', unit_id).first();
    if (existing) {
      return res.status(400).json({ ok: false, error: 'Unit ID already exists' });
    }

    // Check if property exists
    const property = await db('properties').where('property_id', property_id).first();
    if (!property) {
      return res.status(400).json({ ok: false, error: 'Property not found' });
    }

    const newUnit = {
      unit_id,
      property_id,
      type,
      name,
      description: description || null,
      bedrooms,
      bathrooms,
      max_guests: max_guests || 4,
      base_price_kes,
      extra_guest_charge: extra_guest_charge || 800,
      water_deposit_kes: water_deposit_kes || 0,
      min_night_stay: min_night_stay || 1,
      status: 'active'
    };

    const [id] = await db('units').insert(newUnit);
    const createdUnit = await db('units').where('id', id).first();

    res.status(201).json({
      ok: true,
      data: createdUnit
    });
  } catch (err) {
    console.error('[POST Units]', err);
    res.status(500).json({ ok: false, error: 'Failed to create unit' });
  }
});

/**
 * PUT /admin/units/:id
 * Update a unit
 */
router.put('/units/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      type,
      bedrooms,
      bathrooms,
      max_guests,
      base_price_kes,
      extra_guest_charge,
      water_deposit_kes,
      min_night_stay,
      property_id,
      status
    } = req.body;

    // Build update object with only provided fields
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) {
      // Validate type enum
      const validTypes = ['bnb', 'bedsit', '1bed', '2bed'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          ok: false,
          error: `Type must be one of: ${validTypes.join(', ')}`
        });
      }
      updates.type = type;
    }
    if (bedrooms !== undefined) updates.bedrooms = bedrooms;
    if (bathrooms !== undefined) updates.bathrooms = bathrooms;
    if (max_guests !== undefined) updates.max_guests = max_guests;
    if (base_price_kes !== undefined) updates.base_price_kes = base_price_kes;
    if (extra_guest_charge !== undefined) updates.extra_guest_charge = extra_guest_charge;
    if (water_deposit_kes !== undefined) updates.water_deposit_kes = water_deposit_kes;
    if (min_night_stay !== undefined) updates.min_night_stay = min_night_stay;
    if (status !== undefined) updates.status = status;
    if (property_id !== undefined) {
      // Validate property exists
      const property = await db('properties').where('property_id', property_id).first();
      if (!property) {
        return res.status(400).json({ ok: false, error: 'Property not found' });
      }
      updates.property_id = property_id;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'No fields to update' });
    }

    await db('units').where('id', id).update(updates);
    const updatedUnit = await db('units').where('id', id).first();

    if (!updatedUnit) {
      return res.status(404).json({ ok: false, error: 'Unit not found' });
    }

    res.json({
      ok: true,
      data: updatedUnit
    });
  } catch (err) {
    console.error('[PUT Units]', err);
    res.status(500).json({ ok: false, error: 'Failed to update unit' });
  }
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
 * NOTE: Date filters use overlap logic - shows bookings that overlap the date range
 * A booking overlaps if: checkout_date > startDate AND checkin_date < endDate
 */
router.get('/bookings', adminAuthMiddleware, async (req, res) => {
  try {
    const { status, unitId, property, phone, dateFrom, dateTo, startDate, endDate, limit = 50, offset = 0 } = req.query;

    let query = db('bookings').select('*');

    if (status) query.where('status', status);
    if (unitId) query.where('unit_id', unitId);
    if (phone) query.where('guest_phone', 'like', `%${phone}%`);
    
    // Support both dateFrom/dateTo and startDate/endDate formats
    const checkinFrom = dateFrom || startDate;
    const checkinTo = dateTo || endDate;
    
    // Debug logging for date filtering
    if (checkinFrom || checkinTo) {
      console.log('[Admin Bookings] Fetching bookings with date filter:', { checkinFrom, checkinTo });
    }
    
    // OVERLAP LOGIC: Show bookings that overlap the requested date range
    // checkout_date >= startDate means booking ends on/after range starts
    // checkin_date <= endDate means booking starts on/before range ends
    if (checkinFrom) query.where('checkout_date', '>=', checkinFrom);
    if (checkinTo) query.where('checkin_date', '<=', checkinTo);

    // Count total records with same filters (without select *)
    let countQuery = db('bookings');
    if (status) countQuery.where('status', status);
    if (unitId) countQuery.where('unit_id', unitId);
    if (phone) countQuery.where('guest_phone', 'like', `%${phone}%`);
    if (checkinFrom) countQuery.where('checkout_date', '>=', checkinFrom);
    if (checkinTo) countQuery.where('checkin_date', '<=', checkinTo);
    const total = await countQuery.count('id as count').first();
    const bookings = await query
      .orderBy('checkin_date', 'asc')
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    if (checkinFrom || checkinTo) {
      console.log('[Admin Bookings] Found', bookings.length, 'bookings, total:', total.count);
    }

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

/**
 * POST /admin/bookings
 * Create a new booking (admin function)
 * Body: { unitId, checkinDate, checkoutDate, guestName, guestPhone, totalKes }
 */
router.post('/bookings', adminAuthMiddleware, permissionMiddleware('write'), async (req, res) => {
  try {
    const { unitId, checkinDate, checkoutDate, guestName, guestPhone, totalKes } = req.body;

    if (!unitId || !checkinDate || !checkoutDate || !guestName || !guestPhone) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: unitId, checkinDate, checkoutDate, guestName, guestPhone'
      });
    }

    // Validate dates
    if (new Date(checkinDate) >= new Date(checkoutDate)) {
      return res.status(400).json({
        ok: false,
        error: 'Check-out date must be after check-in date'
      });
    }

    // Verify unit exists
    const unit = await db('units').where('unit_id', unitId).orWhere('id', parseInt(unitId) || -1).first();
    if (!unit) {
      return res.status(404).json({ ok: false, error: 'Unit not found' });
    }

    // Check availability
    const { checkAvailability } = require('./availabilityChecker');
    const availability = await checkAvailability(unit.id, checkinDate, checkoutDate);
    
    if (!availability.isAvailable) {
      return res.status(409).json({
        ok: false,
        error: 'Unit is not available for the selected dates',
        conflictType: availability.conflictType
      });
    }

    // Create booking reference
    const bookingRef = `BK${Date.now().toString().slice(-8)}`.toUpperCase();
    const nights = Math.ceil((new Date(checkoutDate) - new Date(checkinDate)) / (1000 * 60 * 60 * 24));
    const total = totalKes || (unit.base_price_kes || 0) * nights;

    const booking = {
      booking_ref: bookingRef,
      unit_id: unitId,
      guest_name: guestName,
      guest_phone: guestPhone,
      checkin_date: checkinDate,
      checkout_date: checkoutDate,
      nights,
      total_kes: total,
      status: 'confirmed',
      created_by: req.admin.username,
      admin_notes: 'Created via admin calendar',
      created_at: new Date().toISOString()
    };

    const [bookingId] = await db('bookings').insert(booking);

    // Log creation
    await db('audit_log').insert({
      booking_id: bookingId,
      event_type: 'booking_created',
      event_data: JSON.stringify({ admin: req.admin.username, source: 'admin_calendar' }),
      created_at: new Date().toISOString()
    });

    res.json({
      ok: true,
      id: bookingId,
      data: { ...booking, id: bookingId }
    });
  } catch (err) {
    console.error('[Create Booking]', err);
    res.status(500).json({ ok: false, error: 'Failed to create booking' });
  }
});

/**
 * DELETE /admin/bookings/:id
 * Delete a booking (admin function)
 */
router.delete('/bookings/:id', adminAuthMiddleware, permissionMiddleware('write'), async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await db('bookings').where('id', id).first();
    if (!booking) {
      return res.status(404).json({ ok: false, error: 'Booking not found' });
    }

    // Prevent deletion of completed bookings
    if (booking.status === 'completed' || booking.status === 'paid') {
      return res.status(400).json({
        ok: false,
        error: `Cannot delete ${booking.status} bookings`
      });
    }

    // Delete booking
    await db('bookings').where('id', id).delete();

    // Log deletion
    await db('audit_log').insert({
      booking_id: id,
      event_type: 'booking_deleted',
      event_data: JSON.stringify({ admin: req.admin.username, bookingRef: booking.booking_ref }),
      created_at: new Date().toISOString()
    });

    res.json({ ok: true, message: 'Booking deleted successfully' });
  } catch (err) {
    console.error('[Delete Booking]', err);
    res.status(500).json({ ok: false, error: 'Failed to delete booking' });
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

// ─────────────────────────────────────────────────────
// ADMIN USER MANAGEMENT ENDPOINTS
// ─────────────────────────────────────────────────────

/**
 * GET /admin/admins
 * List all admin users (full-access only)
 */
router.get('/admins', adminAuthMiddleware, fullAccessMiddleware, async (req, res) => {
  try {
    const admins = await db('admin_users').where('status', 'active').orderBy('created_at', 'desc');

    // Get properties for each admin
    const adminsWithProps = await Promise.all(
      admins.map(async (admin) => {
        const withProps = await getAdminWithProperties(admin.id);
        return withProps;
      })
    );

    res.json({
      ok: true,
      data: adminsWithProps
    });
  } catch (err) {
    console.error('[List Admins]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch admins' });
  }
});

/**
 * POST /admin/admins
 * Create new admin user (full-access only)
 */
router.post('/admins', adminAuthMiddleware, fullAccessMiddleware, async (req, res) => {
  try {
    const { username, name, email, password, role = 'property_admin' } = req.body;

    // Validate required fields
    if (!username || !name || !email || !password) {
      return res.status(400).json({
        ok: false,
        error: 'username, name, email, and password are required'
      });
    }

    // Validate username format (alphanumeric + underscore, 3-20 chars)
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        ok: false,
        error: 'Username must be 3-20 characters (alphanumeric and underscore only)'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid email format'
      });
    }

    // Validate password strength (min 8 chars)
    if (password.length < 8) {
      return res.status(400).json({
        ok: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // Check if username/email already exists
    const existing = await db('admin_users').where('username', username).orWhere('email', email).first();
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: 'Username or email already in use'
      });
    }

    // Hash password
    const SALT_ROUNDS = 10;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create admin
    const [adminId] = await db('admin_users').insert({
      username,
      name,
      email,
      password_hash: passwordHash,
      role,
      status: 'active',
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    });

    const admin = await getAdminWithProperties(adminId);

    res.status(201).json({
      ok: true,
      data: admin
    });
  } catch (err) {
    console.error('[Create Admin]', err);
    res.status(500).json({ ok: false, error: 'Failed to create admin' });
  }
});

/**
 * PUT /admin/admins/:id
 * Update admin user (full-access only)
 */
router.put('/admins/:id', adminAuthMiddleware, fullAccessMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, status, password } = req.body;

    const admin = await db('admin_users').where('id', id).first();
    if (!admin) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    const updates = {};

    if (name) updates.name = name;
    if (email) {
      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ ok: false, error: 'Invalid email format' });
      }
      updates.email = email;
    }
    if (status) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ ok: false, error: 'Invalid status' });
      }
      updates.status = status;
    }
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
      }
      const SALT_ROUNDS = 10;
      updates.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    }

    updates.updated_at = db.fn.now();

    await db('admin_users').where('id', id).update(updates);

    const updatedAdmin = await getAdminWithProperties(id);

    res.json({
      ok: true,
      data: updatedAdmin
    });
  } catch (err) {
    console.error('[Update Admin]', err);
    res.status(500).json({ ok: false, error: 'Failed to update admin' });
  }
});

/**
 * DELETE /admin/admins/:id
 * Soft delete admin (deactivate) - full-access only
 */
router.delete('/admins/:id', adminAuthMiddleware, fullAccessMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-delete
    if (req.admin.id === parseInt(id)) {
      return res.status(400).json({
        ok: false,
        error: 'Cannot delete your own account'
      });
    }

    const admin = await db('admin_users').where('id', id).first();
    if (!admin) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    // Soft delete: set status to inactive
    await db('admin_users').where('id', id).update({
      status: 'inactive',
      updated_at: db.fn.now()
    });

    res.json({ ok: true, message: 'Admin deactivated successfully' });
  } catch (err) {
    console.error('[Delete Admin]', err);
    res.status(500).json({ ok: false, error: 'Failed to delete admin' });
  }
});

/**
 * GET /admin/admins/:id/properties
 * Get properties for admin (full-access only)
 */
router.get('/admins/:id/properties', adminAuthMiddleware, fullAccessMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await db('admin_users').where('id', id).first();
    if (!admin) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    let properties = [];
    
    if (admin.role === 'property_admin') {
      properties = await db('admin_properties')
        .join('properties', 'admin_properties.property_id', '=', 'properties.id')
        .where('admin_properties.admin_id', id)
        .select('properties.id', 'properties.property_id', 'properties.name');
    }

    res.json({
      ok: true,
      data: properties,
      role: admin.role
    });
  } catch (err) {
    console.error('[Get Admin Properties]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch admin properties' });
  }
});

/**
 * POST /admin/admins/:id/properties
 * Assign property to admin (full-access only)
 */
router.post('/admins/:id/properties', adminAuthMiddleware, fullAccessMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { property_id } = req.body;

    if (!property_id) {
      return res.status(400).json({
        ok: false,
        error: 'property_id is required'
      });
    }

    const admin = await db('admin_users').where('id', id).first();
    if (!admin) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    // Full-admin can't be assigned properties
    if (admin.role === 'full_admin') {
      return res.status(400).json({
        ok: false,
        error: 'Full-admin users cannot be assigned to properties'
      });
    }

    // Find property by property_id or numeric id
    const property = await db('properties').where('property_id', property_id).orWhere('id', property_id).first();
    if (!property) {
      return res.status(404).json({ ok: false, error: 'Property not found' });
    }

    // Check if already assigned
    const existing = await db('admin_properties')
      .where('admin_id', id)
      .where('property_id', property.id)
      .first();
    
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: 'Admin already assigned to this property'
      });
    }

    // Create assignment
    await db('admin_properties').insert({
      admin_id: id,
      property_id: property.id,
      created_at: db.fn.now()
    });

    const adminWithProps = await getAdminWithProperties(id);

    res.status(201).json({
      ok: true,
      data: adminWithProps
    });
  } catch (err) {
    console.error('[Assign Property]', err);
    res.status(500).json({ ok: false, error: 'Failed to assign property' });
  }
});

/**
 * DELETE /admin/admins/:id/properties/:propertyId
 * Unassign property from admin (full-access only)
 */
router.delete('/admins/:id/properties/:propertyId', adminAuthMiddleware, fullAccessMiddleware, async (req, res) => {
  try {
    const { id, propertyId } = req.params;

    const admin = await db('admin_users').where('id', id).first();
    if (!admin) {
      return res.status(404).json({ ok: false, error: 'Admin not found' });
    }

    // Find property
    const property = await db('properties').where('property_id', propertyId).orWhere('id', propertyId).first();
    if (!property) {
      return res.status(404).json({ ok: false, error: 'Property not found' });
    }

    // Remove assignment
    const deleted = await db('admin_properties')
      .where('admin_id', id)
      .where('property_id', property.id)
      .delete();

    if (deleted === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Assignment not found'
      });
    }

    const adminWithProps = await getAdminWithProperties(id);

    res.json({
      ok: true,
      data: adminWithProps
    });
  } catch (err) {
    console.error('[Unassign Property]', err);
    res.status(500).json({ ok: false, error: 'Failed to unassign property' });
  }
});

module.exports = router;
