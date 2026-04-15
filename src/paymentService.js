/**
 * Rental Payment Service
 * Handles payment recording, partial payments, and overpayment logic
 * One payment record per month allows multiple transactions per month
 */

const db = require('./db');

/**
 * Create or get payment record for a tenant in a specific month
 * Handles monthly reconciliation
 */
async function recordPayment({
  contract_id,
  tenant_id,
  unit_id,
  month,  // 1-12
  year,   // 2024, 2025, etc
  amount_paid_kes,
  mpesa_receipt,
  mpesa_phone,
  mpesa_reference,
  notes
}) {
  try {
    // Validate contract exists
    const contract = await db('rental_contracts').where('id', contract_id).first();
    if (!contract) {
      throw new Error(`Contract ${contract_id} not found`);
    }

    // Validate month/year
    if (!month || !year || month < 1 || month > 12) {
      throw new Error('Invalid month (1-12) or year');
    }

    // Calculate due date (1st of the month)
    const dueDate = new Date(year, month - 1, 1);

    // Check if payment record exists for this month
    let payment = await db('rental_payments')
      .where('contract_id', contract_id)
      .where('month', month)
      .where('year', year)
      .first();

    if (payment) {
      // Update existing payment record (accumulate multiple payments per month)
      const newPaidAmount = (payment.amount_paid_kes || 0) + amount_paid_kes;
      const amountDue = payment.amount_due_kes || contract.monthly_rent_kes;
      const newOutstanding = Math.max(0, amountDue - newPaidAmount);

      let status = 'pending';
      if (newPaidAmount >= amountDue) {
        status = 'paid';
      } else if (newPaidAmount > 0) {
        status = 'partial';
      }

      await db('rental_payments').where('id', payment.id).update({
        amount_paid_kes: newPaidAmount,
        amount_outstanding_kes: newOutstanding,
        status,
        paid_date: status === 'paid' ? new Date().toISOString().split('T')[0] : payment.paid_date,
        mpesa_receipt_number: mpesa_receipt || payment.mpesa_receipt_number,
        mpesa_phone: mpesa_phone || payment.mpesa_phone,
        reference: mpesa_reference || payment.reference,
        notes: notes || payment.notes,
        updated_at: new Date().toISOString()
      });

      return await getPaymentById(payment.id);
    }

    // Create new payment record
    const newPayment = {
      contract_id,
      tenant_id,
      unit_id,
      month,
      year,
      amount_due_kes: contract.monthly_rent_kes,
      amount_paid_kes,
      amount_outstanding_kes: Math.max(0, contract.monthly_rent_kes - amount_paid_kes),
      status: amount_paid_kes >= contract.monthly_rent_kes ? 'paid' : (amount_paid_kes > 0 ? 'partial' : 'pending'),
      due_date: dueDate.toISOString().split('T')[0],
      paid_date: amount_paid_kes >= contract.monthly_rent_kes ? new Date().toISOString().split('T')[0] : null,
      mpesa_receipt_number: mpesa_receipt || null,
      mpesa_phone: mpesa_phone || null,
      reference: mpesa_reference || null,
      notes: notes || null
    };

    const result = await db('rental_payments').insert(newPayment).returning('id');
    const id = Array.isArray(result) ? result[0].id : result.id;

    return await getPaymentById(id);
  } catch (err) {
    console.error('[recordPayment]', err.message);
    throw err;
  }
}

/**
 * Get payment record by ID
 */
async function getPaymentById(id) {
  try {
    const payment = await db('rental_payments')
      .where('rental_payments.id', id)
      .join('tenants', 'rental_payments.tenant_id', 'tenants.id')
      .select(
        'rental_payments.*',
        'tenants.tenant_phone',
        'tenants.tenant_name'
      )
      .first();

    return payment || null;
  } catch (err) {
    console.error('[getPaymentById]', err.message);
    throw err;
  }
}

/**
 * Get payment for a specific month/year
 */
async function getMonthlyPayment(contract_id, month, year) {
  try {
    const payment = await db('rental_payments')
      .where('contract_id', contract_id)
      .where('month', month)
      .where('year', year)
      .first();

    return payment || null;
  } catch (err) {
    console.error('[getMonthlyPayment]', err.message);
    throw err;
  }
}

/**
 * List payments with filters and pagination
 */
async function listPayments({
  contract_id = null,
  tenant_id = null,
  unit_id = null,
  status = null,
  from_year = null,
  from_month = null,
  to_year = null,
  to_month = null,
  limit = 50,
  offset = 0
} = {}) {
  try {
    let query = db('rental_payments')
      .join('tenants', 'rental_payments.tenant_id', 'tenants.id')
      .select(
        'rental_payments.*',
        'tenants.tenant_phone',
        'tenants.tenant_name'
      );

    if (contract_id) query.where('rental_payments.contract_id', contract_id);
    if (tenant_id) query.where('rental_payments.tenant_id', tenant_id);
    if (unit_id) query.where('rental_payments.unit_id', unit_id);
    if (status) query.where('rental_payments.status', status);
    if (from_year && from_month) {
      query.where(function() {
        this.where('rental_payments.year', '>', from_year)
          .orWhere(function() {
            this.where('rental_payments.year', from_year)
              .where('rental_payments.month', '>=', from_month);
          });
      });
    }
    if (to_year && to_month) {
      query.where(function() {
        this.where('rental_payments.year', '<', to_year)
          .orWhere(function() {
            this.where('rental_payments.year', to_year)
              .where('rental_payments.month', '<=', to_month);
          });
      });
    }

    const payments = await query
      .orderBy('rental_payments.year', 'desc')
      .orderBy('rental_payments.month', 'desc')
      .orderBy('rental_payments.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return payments;
  } catch (err) {
    console.error('[listPayments]', err.message);
    throw err;
  }
}

/**
 * Get arrears (outstanding payments) for a tenant
 */
async function getTenantArrears(tenant_id) {
  try {
    const arrears = await db('rental_payments')
      .where('tenant_id', tenant_id)
      .whereIn('status', ['pending', 'partial', 'late'])
      .orderBy('year', 'asc')
      .orderBy('month', 'asc');

    const totalArrears = arrears.reduce((sum, p) => sum + (p.amount_outstanding_kes || 0), 0);

    return {
      tenant_id,
      total_outstanding_kes: totalArrears,
      count: arrears.length,
      records: arrears
    };
  } catch (err) {
    console.error('[getTenantArrears]', err.message);
    throw err;
  }
}

/**
 * Mark payment as late (if due date has passed)
 */
async function updatePaymentStatusToLate(payment_id) {
  try {
    const payment = await db('rental_payments').where('id', payment_id).first();
    if (!payment) {
      throw new Error('Payment not found');
    }

    // Only mark as late if:
    // 1. Status is 'pending' or 'partial' (not already paid or late)
    // 2. Due date has passed
    if (['pending', 'partial'].includes(payment.status)) {
      const dueDate = new Date(payment.due_date);
      if (new Date() > dueDate) {
        await db('rental_payments').where('id', payment_id).update({
          status: 'late'
        });
      }
    }

    return await getPaymentById(payment_id);
  } catch (err) {
    console.error('[updatePaymentStatusToLate]', err.message);
    throw err;
  }
}

/**
 * Get monthly payment summary for a contract
 */
async function getContractPaymentSummary(contract_id) {
  try {
    const payments = await db('rental_payments')
      .where('contract_id', contract_id)
      .orderBy('year', 'desc')
      .orderBy('month', 'desc');

    const summary = {
      contract_id,
      total_due_kes: payments.reduce((sum, p) => sum + p.amount_due_kes, 0),
      total_paid_kes: payments.reduce((sum, p) => sum + p.amount_paid_kes, 0),
      total_outstanding_kes: payments.reduce((sum, p) => sum + p.amount_outstanding_kes, 0),
      payment_count: payments.length,
      status_breakdown: {
        paid: payments.filter(p => p.status === 'paid').length,
        partial: payments.filter(p => p.status === 'partial').length,
        pending: payments.filter(p => p.status === 'pending').length,
        late: payments.filter(p => p.status === 'late').length
      },
      payments
    };

    return summary;
  } catch (err) {
    console.error('[getContractPaymentSummary]', err.message);
    throw err;
  }
}

module.exports = {
  recordPayment,
  getPaymentById,
  getMonthlyPayment,
  listPayments,
  getTenantArrears,
  updatePaymentStatusToLate,
  getContractPaymentSummary
};
