/**
 * Rental Contract Service
 * CRUD operations for rental lease agreements
 * One contract per tenant+unit combination
 */

const db = require('./db');

/**
 * Create a new rental contract
 */
async function createContract({
  tenant_id,
  unit_id,
  property_id,
  start_date,
  end_date,
  monthly_rent_kes,
  payment_frequency,
  security_deposit_kes,
  utilities_deposit_kes,
  notes
}) {
  try {
    // Verify tenant exists
    const tenant = await db('tenants').where('id', tenant_id).first();
    if (!tenant) {
      throw new Error(`Tenant with ID ${tenant_id} not found`);
    }

    // Verify unit exists
    const unit = await db('units').where('id', unit_id).first();
    if (!unit) {
      throw new Error(`Unit with ID ${unit_id} not found`);
    }

    // Verify property exists (use property_id string, not numeric id)
    const property = await db('properties').where('property_id', property_id).first();
    if (!property) {
      throw new Error(`Property with property_id '${property_id}' not found`);
    }

    // Validate dates
    const startDate = new Date(start_date);
    if (end_date && new Date(end_date) <= startDate) {
      throw new Error('End date must be after start date');
    }

    const contract = {
      tenant_id,
      unit_id,
      property_id,
      start_date,
      end_date: end_date || null,
      monthly_rent_kes,
      payment_frequency: payment_frequency || 'monthly',
      security_deposit_kes: security_deposit_kes || 0,
      utilities_deposit_kes: utilities_deposit_kes || 0,
      status: 'active',
      contract_notes: notes || null
    };

    const result = await db('rental_contracts').insert(contract).returning('id');
    const id = Array.isArray(result) ? result[0].id : result.id;

    return await getContractById(id);
  } catch (err) {
    console.error('[createContract]', err.message);
    throw err;
  }
}

/**
 * Get contract by ID
 */
async function getContractById(id) {
  try {
    const contract = await db('rental_contracts')
      .where('rental_contracts.id', id)
      .join('tenants', 'rental_contracts.tenant_id', 'tenants.id')
      .join('units', 'rental_contracts.unit_id', 'units.id')
      .select(
        'rental_contracts.*',
        'tenants.tenant_phone',
        'tenants.tenant_name',
        'units.unit_id as unit_code'
      )
      .first();

    // Normalize field name for API consistency
    if (contract) {
      contract.notes = contract.contract_notes;
      delete contract.contract_notes;
    }

    return contract || null;
  } catch (err) {
    console.error('[getContractById]', err.message);
    throw err;
  }
}

/**
 * List contracts with filters and pagination
 */
async function listContracts({
  tenant_id = null,
  unit_id = null,
  status = null,
  limit = 50,
  offset = 0
} = {}) {
  try {
    let query = db('rental_contracts')
      .join('tenants', 'rental_contracts.tenant_id', 'tenants.id')
      .join('units', 'rental_contracts.unit_id', 'units.id')
      .select(
        'rental_contracts.*',
        'tenants.tenant_phone',
        'tenants.tenant_name',
        'units.unit_id as unit_code'
      );

    if (tenant_id) query.where('rental_contracts.tenant_id', tenant_id);
    if (unit_id) query.where('rental_contracts.unit_id', unit_id);
    if (status) query.where('rental_contracts.status', status);

    const contracts = await query
      .orderBy('rental_contracts.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Normalize field names for API consistency
    return contracts.map(contract => {
      contract.notes = contract.contract_notes;
      delete contract.contract_notes;
      return contract;
    });
  } catch (err) {
    console.error('[listContracts]', err.message);
    throw err;
  }
}

/**
 * Update contract details
 */
async function updateContract(id, updates) {
  try {
    // Normalize field names (API level may use 'notes', but DB uses 'contract_notes')
    if (updates.notes !== undefined) {
      updates.contract_notes = updates.notes;
      delete updates.notes;
    }

    // Validate status if being updated
    if (updates.status) {
      const validStatuses = ['active', 'suspended', 'ended', 'terminated'];
      if (!validStatuses.includes(updates.status)) {
        throw new Error(`Status must be one of: ${validStatuses.join(', ')}`);
      }
      // When ending contract, also set termination_date
      if (updates.status === 'ended' || updates.status === 'terminated') {
        updates.termination_date = new Date().toISOString().split('T')[0];
      }
    }

    // Validate dates if being updated
    const contract = await db('rental_contracts').where('id', id).first();
    if (!contract) {
      throw new Error('Contract not found');
    }

    if (updates.end_date && updates.start_date) {
      if (new Date(updates.end_date) <= new Date(updates.start_date)) {
        throw new Error('End date must be after start date');
      }
    } else if (updates.end_date && new Date(updates.end_date) <= new Date(contract.start_date)) {
      throw new Error('End date must be after start date');
    } else if (updates.start_date && contract.end_date && new Date(contract.end_date) <= new Date(updates.start_date)) {
      throw new Error('Start date must be before end date');
    }

    await db('rental_contracts').where('id', id).update(updates);

    return await getContractById(id);
  } catch (err) {
    console.error('[updateContract]', err.message);
    throw err;
  }
}

/**
 * Get active contract for a tenant
 */
async function getActiveTenantContract(tenant_id) {
  try {
    const contract = await db('rental_contracts')
      .where('tenant_id', tenant_id)
      .where('status', 'active')
      .orderBy('start_date', 'desc')
      .first();

    // Normalize field name for API consistency
    if (contract) {
      contract.notes = contract.contract_notes;
      delete contract.contract_notes;
    }

    return contract || null;
  } catch (err) {
    console.error('[getActiveTenantContract]', err.message);
    throw err;
  }
}

/**
 * Get contract for a tenant on a specific unit
 */
async function getTenantUnitContract(tenant_id, unit_id) {
  try {
    const contract = await db('rental_contracts')
      .where('tenant_id', tenant_id)
      .where('unit_id', unit_id)
      .orderBy('start_date', 'desc')
      .first();

    // Normalize field name for API consistency
    if (contract) {
      contract.notes = contract.contract_notes;
      delete contract.contract_notes;
    }

    return contract || null;
  } catch (err) {
    console.error('[getTenantUnitContract]', err.message);
    throw err;
  }
}

/**
 * End a contract (set end_date and status to 'ended')
 */
async function endContract(id, termination_reason = null) {
  try {
    const result = await updateContract(id, {
      status: 'ended',
      termination_reason
    });

    return result;
  } catch (err) {
    console.error('[endContract]', err.message);
    throw err;
  }
}

module.exports = {
  createContract,
  getContractById,
  listContracts,
  updateContract,
  getActiveTenantContract,
  getTenantUnitContract,
  endContract
};
