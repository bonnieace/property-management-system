/**
 * Tenant Service
 * CRUD operations for persistent tenant records
 * Tenants are looked up by phone to avoid re-entering data on repeat payments
 */

const db = require('./db');

/**
 * Create a new tenant record (one per unique phone number)
 */
async function createTenant({ 
  tenant_phone, 
  tenant_name, 
  tenant_email, 
  id_number, 
  next_of_kin_phone, 
  next_of_kin_name, 
  notes 
}) {
  try {
    // Check if tenant with this phone already exists
    const existing = await db('tenants')
      .where('tenant_phone', tenant_phone)
      .first();
    
    if (existing) {
      throw new Error(`Tenant with phone ${tenant_phone} already exists (ID: ${existing.id})`);
    }
    
    const tenant = {
      tenant_phone,
      tenant_name,
      tenant_email: tenant_email || null,
      id_number: id_number || null,
      next_of_kin_phone: next_of_kin_phone || null,
      next_of_kin_name: next_of_kin_name || null,
      notes: notes || null
    };
    
    const result = await db('tenants').insert(tenant).returning('id');
    const id = Array.isArray(result) ? result[0].id : result.id;
    
    return await getTenantById(id);
  } catch (err) {
    console.error('[createTenant]', err.message);
    throw err;
  }
}

/**
 * Lookup tenant by phone (primary lookup for repeat payments)
 */
async function getTenantByPhone(phone) {
  try {
    const tenant = await db('tenants')
      .where('tenant_phone', phone)
      .first();
    
    return tenant || null;
  } catch (err) {
    console.error('[getTenantByPhone]', err.message);
    throw err;
  }
}

/**
 * Get tenant by ID
 */
async function getTenantById(id) {
  try {
    const tenant = await db('tenants')
      .where('id', id)
      .first();
    
    return tenant || null;
  } catch (err) {
    console.error('[getTenantById]', err.message);
    throw err;
  }
}

/**
 * Update tenant information
 */
async function updateTenant(id, updates) {
  try {
    await db('tenants')
      .where('id', id)
      .update(updates);
    
    return await getTenantById(id);
  } catch (err) {
    console.error('[updateTenant]', err.message);
    throw err;
  }
}

/**
 * List all tenants with pagination
 */
async function listTenants({ 
  limit = 50, 
  offset = 0 
} = {}) {
  try {
    const tenants = await db('tenants')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    
    return tenants;
  } catch (err) {
    console.error('[listTenants]', err.message);
    throw err;
  }
}

module.exports = {
  createTenant,
  getTenantByPhone,
  getTenantById,
  updateTenant,
  listTenants
};
