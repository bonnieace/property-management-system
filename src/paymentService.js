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
async function recordPayment(input) {
  const { integer, required, HttpError } = require('./http');
  const amount = integer(1).parse(input.amount_paid_kes);
  const month = integer(1, 12).parse(input.month);
  const year = integer(2000, 2200).parse(input.year);
  const key = required(100).parse(input.idempotency_key);
  const id = await db.transaction(async trx => {
    const contract = await trx('rental_contracts').where('id', input.contract_id).forUpdate().first();
    if (!contract) throw new HttpError(404, 'Contract not found');
    if (contract.tenant_id !== Number(input.tenant_id) || contract.unit_id !== Number(input.unit_id)) throw new HttpError(400, 'Payment does not match the contract');
    const previous = await trx('payment_ledger').where({ contract_id: contract.id, idempotency_key: key }).first();
    if (previous) {
      const p = await trx('rental_payments').where('id', previous.payment_id).first();
      if (previous.amount_kes !== amount || p.month !== month || p.year !== year) throw new HttpError(409, 'This payment reference was already used for a different payment');
      return p.id;
    }
    let payment = await trx('rental_payments').where({ contract_id: contract.id, month, year }).first();
    if (!payment) {
      [payment] = await trx('rental_payments').insert({
        contract_id: contract.id, tenant_id: contract.tenant_id, unit_id: contract.unit_id, month, year,
        amount_due_kes: contract.monthly_rent_kes, amount_paid_kes: 0, amount_outstanding_kes: contract.monthly_rent_kes,
        due_date: `${year}-${String(month).padStart(2, '0')}-01`
      }).returning('*');
    }
    const paid = payment.amount_paid_kes + amount;
    integer(0).parse(paid);
    await trx('rental_payments').where('id', payment.id).update({
      amount_paid_kes: paid, amount_outstanding_kes: Math.max(0, payment.amount_due_kes - paid),
      status: paid >= payment.amount_due_kes ? 'paid' : 'partial',
      paid_date: paid >= payment.amount_due_kes ? new Date().toISOString().slice(0, 10) : null,
      mpesa_receipt_number: input.mpesa_receipt || payment.mpesa_receipt_number,
      notes: input.notes || payment.notes, updated_at: trx.fn.now()
    });
    await trx('payment_ledger').insert({ contract_id: contract.id, payment_id: payment.id, idempotency_key: key, amount_kes: amount, receipt: input.mpesa_receipt || null });
    return payment.id;
  });
  return getPaymentById(id);
}

// Materialize months with no payment, so unpaid rent does not vanish from arrears.
async function ensureMonthlyDues(tenantId) {
  const contracts = await db('rental_contracts').where('tenant_id', tenantId);
  for (const c of contracts) {
    await db.transaction(async trx => {
      await trx('rental_contracts').where('id', c.id).forUpdate().first();
      const today = new Date().toISOString().slice(0, 10);
      const end = c.end_date && c.end_date < today ? c.end_date : today;
      let cursor = new Date(`${c.start_date.slice(0, 7)}-01T00:00:00Z`);
      const periods = [];
      while (cursor.toISOString().slice(0, 10) <= end && periods.length < 1200) {
        const month = cursor.getUTCMonth() + 1, year = cursor.getUTCFullYear();
        const due = cursor.toISOString().slice(0, 10) < c.start_date ? c.start_date : cursor.toISOString().slice(0, 10);
        if (due > today || (c.end_date && due >= c.end_date)) break;
        periods.push({ month, year, due });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      for (const period of periods) {
        const exists = await trx('rental_payments').where({ contract_id: c.id, month: period.month, year: period.year }).first();
        if (!exists) await trx('rental_payments').insert({ contract_id: c.id, tenant_id: c.tenant_id, unit_id: c.unit_id,
          month: period.month, year: period.year, amount_due_kes: c.monthly_rent_kes, amount_paid_kes: 0,
          amount_outstanding_kes: c.monthly_rent_kes, status: period.due < today ? 'late' : 'pending', due_date: period.due });
      }
    });
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
    console.error('[getPaymentById]', 'Database operation failed');
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
    console.error('[getMonthlyPayment]', 'Database operation failed');
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
    console.error('[listPayments]', 'Database operation failed');
    throw err;
  }
}

/**
 * Get arrears (outstanding payments) for a tenant
 */
async function getTenantArrears(tenant_id) {
  try {
    await ensureMonthlyDues(tenant_id);
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
    console.error('[getTenantArrears]', 'Database operation failed');
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
    console.error('[updatePaymentStatusToLate]', 'Database operation failed');
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
    console.error('[getContractPaymentSummary]', 'Database operation failed');
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
