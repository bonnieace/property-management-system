/**
 * Calendar Routes
 * Endpoints for availability, pricing, and calendar data
 * Used by frontend to display calendars and check availability
 */

const express = require('express');
const router = express.Router();
const db = require('./db');
const { checkAvailability, getBookedDates, getBlockedDates } = require('./availabilityChecker');
const { calculatePrice } = require('./priceCalculator');

/**
 * GET /api/calendar/units
 * Get all units with basic info
 */
router.get('/units', async (req, res) => {
  try {
    const units = await db('units')
      .select('id', 'unit_id', 'property_id', 'name', 'type', 'bedrooms', 'bathrooms', 'max_guests', 'base_price_kes', 'status')
      .where('status', 'active')
      .orderBy('property_id', 'asc')
      .orderBy('base_price_kes', 'asc');

    res.json({
      ok: true,
      data: units,
    });
  } catch (err) {
    console.error('[GET /api/calendar/units]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/calendar/availability/:unitId
 * Get calendar availability, blocked dates, and pricing for a unit
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 * Returns: { booked: [], blocked: [], pricing: {}, unit: {} }
 */
router.get('/availability/:unitId', async (req, res) => {
  try {
    const { unitId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        ok: false,
        error: 'Missing query params: startDate & endDate (format: YYYY-MM-DD)',
      });
    }

    // Get unit by unitId (string) or id (number)
    const unit = await db('units')
      .where(function() {
        this.where('unit_id', unitId)
            .orWhere('id', parseInt(unitId) || -1);
      })
      .first();

    if (!unit) {
      return res.status(404).json({ ok: false, error: 'Unit not found' });
    }

    // Get booked dates
    const bookedDates = await getBookedDates(unit.id, startDate, endDate);

    // Get blocked dates
    const blockedDates = await getBlockedDates(unit.id, startDate, endDate);

    // Get pricing rules for this period
    const pricingRules = await db('pricing_rules')
      .where('unit_id', unit.id)
      .where('is_active', true)
      .where(function() {
        this.whereRaw('end_date > ?', [startDate])
            .whereRaw('start_date < ?', [endDate]);
      });

    res.json({
      ok: true,
      data: {
        unit: {
          id: unit.id,
          unitId: unit.unit_id,
          name: unit.name,
          basePriceKes: unit.base_price_kes,
          extraGuestCharge: unit.extra_guest_charge,
          minNightStay: unit.min_night_stay,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          maxGuests: unit.max_guests,
        },
        calendar: {
          startDate,
          endDate,
          bookedDates: bookedDates.map(b => ({
            checkin: b.checkin_date,
            checkout: b.checkout_date,
            guestName: b.guest_name,
            status: b.status,
          })),
          blockedDates: blockedDates.map(b => ({
            start: b.start_date,
            end: b.end_date,
            reason: b.reason,
            type: b.block_type,
          })),
          pricingRules: pricingRules.map(p => ({
            startDate: p.start_date,
            endDate: p.end_date,
            pricePerNight: p.price_per_night_kes,
            reason: p.reason,
          })),
        },
      },
    });
  } catch (err) {
    console.error('[GET /api/calendar/availability]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/calendar/check-availability
 * Check if specific dates are available for a unit
 * Body: { unitId, checkinDate, checkoutDate, totalGuests }
 * Returns: { isAvailable, conflictInfo, pricing }
 */
router.post('/check-availability', async (req, res) => {
  try {
    const { unitId, checkinDate, checkoutDate, totalGuests = 2 } = req.body;

    if (!unitId || !checkinDate || !checkoutDate) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: unitId, checkinDate, checkoutDate',
      });
    }

    // Get unit by unitId (string) or id (number)
    const unit = await db('units')
      .where(function() {
        this.where('unit_id', unitId)
            .orWhere('id', parseInt(unitId) || -1);
      })
      .first();

    if (!unit) {
      return res.status(404).json({ ok: false, error: 'Unit not found' });
    }

    // Check availability
    const availability = await checkAvailability(unit.id, checkinDate, checkoutDate);

    if (!availability.isAvailable) {
      // Get alternate suggestions
      const nights = Math.ceil((new Date(checkoutDate) - new Date(checkinDate)) / (1000 * 60 * 60 * 24));
      const suggestions = await db('bookings')
        .select('checkout_date')
        .where('unit_id', unit.id)
        .where('status', 'confirmed')
        .whereRaw('checkout_date > ?', [checkoutDate])
        .orderBy('checkout_date', 'asc')
        .limit(3);

      return res.json({
        ok: true,
        data: {
          isAvailable: false,
          reason: availability.conflictType,
          details: availability,
          alternatives: suggestions.map(s => ({
            suggestedCheckin: s.checkout_date,
            suggestedCheckout: new Date(new Date(s.checkout_date).getTime() + nights * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
          })),
        },
      });
    }

    // Calculate price
    const pricing = await calculatePrice(unit.id, checkinDate, checkoutDate, totalGuests);

    res.json({
      ok: true,
      data: {
        isAvailable: true,
        unit: {
          id: unit.id,
          unitId: unit.unit_id,
          name: unit.name,
        },
        checkinDate,
        checkoutDate,
        nights: availability.nights,
        totalGuests,
        pricing,
      },
    });
  } catch (err) {
    console.error('[POST /api/calendar/check-availability]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/calendar/pricing/:unitId
 * Get base pricing and current pricing rules for a unit
 */
router.get('/pricing/:unitId', async (req, res) => {
  try {
    const { unitId } = req.params;
    const { startDate, endDate } = req.query;

    const unit = await db('units')
      .where(function() {
        this.where('unit_id', unitId)
            .orWhere('id', parseInt(unitId) || -1);
      })
      .first();

    if (!unit) {
      return res.status(404).json({ ok: false, error: 'Unit not found' });
    }

    let rules = [];
    if (startDate && endDate) {
      rules = await db('pricing_rules')
        .where('unit_id', unit.id)
        .where('is_active', true)
        .where(function() {
          this.whereRaw('end_date > ?', [startDate])
              .whereRaw('start_date < ?', [endDate]);
        })
        .orderBy('start_date', 'asc');
    }

    res.json({
      ok: true,
      data: {
        unit: {
          id: unit.id,
          unitId: unit.unit_id,
          name: unit.name,
          basePriceKes: unit.base_price_kes,
          extraGuestCharge: unit.extra_guest_charge,
        },
        rules,
      },
    });
  } catch (err) {
    console.error('[GET /api/calendar/pricing]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
