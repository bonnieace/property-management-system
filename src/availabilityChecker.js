/**
 * Availability Checker
 * Checks for booking conflicts, blocked dates, and calculates available date ranges
 */

const db = require('./db');

/**
 * Check if a unit is available for given date range
 * Returns: { isAvailable, conflictingBooking, blockedPeriods, conflictType }
 */
async function checkAvailability(unitId, checkinDate, checkoutDate) {
  try {
    // Get unit details first (for minimum stay validation)
    const unit = await db('units')
      .where('id', unitId)
      .first();

    if (!unit) {
      return { isAvailable: false, error: 'Unit not found' };
    }

    // Check for overlapping confirmed bookings
    const conflictingBooking = await db('bookings')
      .where('unit_id', unitId)
      .where('status', 'confirmed')
      .where(function() {
        // Overlap check: booking ends after requested checkin AND booking starts before requested checkout
        this.whereRaw('checkout_date > ?', [checkinDate])
            .whereRaw('checkin_date < ?', [checkoutDate]);
      })
      .first();

    if (conflictingBooking) {
      return {
        isAvailable: false,
        conflictingBooking,
        conflictType: 'booking_overlap',
      };
    }

    // Check for maintenance/blocked periods
    const blockedPeriods = await db('availability_blocks')
      .where('unit_id', unitId)
      .where(function() {
        this.whereRaw('end_date > ?', [checkinDate])
            .whereRaw('start_date < ?', [checkoutDate]);
      });

    if (blockedPeriods.length > 0) {
      return {
        isAvailable: false,
        blockedPeriods,
        conflictType: 'blocked_dates',
      };
    }

    // Check minimum stay requirement
    const nights = Math.ceil((new Date(checkoutDate) - new Date(checkinDate)) / (1000 * 60 * 60 * 24));
    if (nights < unit.min_night_stay) {
      return {
        isAvailable: false,
        conflictType: 'minimum_stay_not_met',
        minNightsRequired: unit.min_night_stay,
        nightsRequested: nights,
      };
    }

    // All checks passed
    return {
      isAvailable: true,
      nights,
      unit,
    };
  } catch (err) {
    console.error('[availabilityChecker]', err.message);
    return { isAvailable: false, error: err.message };
  }
}

/**
 * Get all booked date ranges for a unit within a time window
 * Used for calendar display
 */
async function getBookedDates(unitId, startDate, endDate) {
  try {
    const bookedDates = await db('bookings')
      .select('checkin_date', 'checkout_date', 'guest_name', 'status')
      .where('unit_id', unitId)
      .where('status', 'confirmed')
      .where(function() {
        this.whereRaw('checkout_date > ?', [startDate])
            .whereRaw('checkin_date < ?', [endDate]);
      })
      .orderBy('checkin_date', 'asc');

    return bookedDates;
  } catch (err) {
    console.error('[getBookedDates]', err.message);
    return [];
  }
}

/**
 * Get all blocked date ranges for a unit within a time window
 */
async function getBlockedDates(unitId, startDate, endDate) {
  try {
    const blockedDates = await db('availability_blocks')
      .select('start_date', 'end_date', 'reason', 'block_type')
      .where('unit_id', unitId)
      .where(function() {
        this.whereRaw('end_date > ?', [startDate])
            .whereRaw('start_date < ?', [endDate]);
      })
      .orderBy('start_date', 'asc');

    return blockedDates;
  } catch (err) {
    console.error('[getBlockedDates]', err.message);
    return [];
  }
}

/**
 * Suggest alternative dates if requested dates are unavailable
 * Returns: { suggestedDates: [{checkin, checkout}, ...] }
 */
async function suggestAlternateDates(unitId, checkinDate, checkoutDate, nights = 2) {
  try {
    const suggestions = [];
    const maxSuggestionsToFind = 5;
    let currentDate = new Date(checkoutDate);

    // Look ahead up to 30 days for available slots
    for (let i = 0; i < 30 && suggestions.length < maxSuggestionsToFind; i++) {
      const suggestedCheckin = new Date(currentDate);
      const suggestedCheckout = new Date(suggestedCheckin);
      suggestedCheckout.setDate(suggestedCheckout.getDate() + nights);

      const check = await checkAvailability(
        unitId,
        suggestedCheckin.toISOString().split('T')[0],
        suggestedCheckout.toISOString().split('T')[0]
      );

      if (check.isAvailable) {
        suggestions.push({
          checkin: suggestedCheckin.toISOString().split('T')[0],
          checkout: suggestedCheckout.toISOString().split('T')[0],
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return { suggestedDates: suggestions };
  } catch (err) {
    console.error('[suggestAlternateDates]', err.message);
    return { suggestedDates: [] };
  }
}

module.exports = {
  checkAvailability,
  getBookedDates,
  getBlockedDates,
  suggestAlternateDates,
};
