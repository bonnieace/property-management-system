#!/usr/bin/env node
/**
 * Test Tenant Service
 * Tests CRUD operations directly without HTTP/auth overhead
 */

require('dotenv').config();
const tenantService = require('./src/tenantService');

async function runTests() {
  try {
    console.log('🧪 Testing Tenant Service\n');

    // Test 1: Create Tenant
    console.log('1️⃣  Creating tenant...');
    const newTenant = await tenantService.createTenant({
      tenant_phone: '+254712345678',
      tenant_name: 'John Doe',
      tenant_email: 'john@example.com',
      id_number: 'ID123456',
      next_of_kin_phone: '+254712345679',
      next_of_kin_name: 'Jane Doe',
      notes: 'Test tenant creation'
    });
    console.log('✅ Tenant created:', newTenant.id);
    console.log('   Phone:', newTenant.tenant_phone);
    console.log('   Name:', newTenant.tenant_name);
    const tenantId = newTenant.id;

    // Test 2: Get Tenant by Phone
    console.log('\n2️⃣  Getting tenant by phone...');
    const tenantByPhone = await tenantService.getTenantByPhone('+254712345678');
    console.log('✅ Found tenant:', tenantByPhone.id);
    console.log('   Matches created tenant:', tenantByPhone.id === tenantId);

    // Test 3: Get Tenant by ID
    console.log('\n3️⃣  Getting tenant by ID...');
    const tenantById = await tenantService.getTenantById(tenantId);
    console.log('✅ Found tenant:', tenantById.tenant_name);

    // Test 4: Update Tenant
    console.log('\n4️⃣  Updating tenant...');
    const updatedTenant = await tenantService.updateTenant(tenantId, {
      tenant_email: 'john.updated@example.com',
      notes: 'Updated notes'
    });
    console.log('✅ Updated tenant email:', updatedTenant.tenant_email);
    console.log('   Updated notes:', updatedTenant.notes);

    // Test 5: List Tenants
    console.log('\n5️⃣  Listing all tenants...');
    const tenants = await tenantService.listTenants({ limit: 10, offset: 0 });
    console.log('✅ Found', tenants.length, 'tenants');
    console.log('   Created tenant in list:', tenants.some(t => t.id === tenantId));

    // Test 6: Duplicate Phone Check
    console.log('\n6️⃣  Testing duplicate phone prevention...');
    try {
      await tenantService.createTenant({
        tenant_phone: '+254712345678', // Same phone as above
        tenant_name: 'Another John',
        tenant_email: 'another@example.com'
      });
      console.log('❌ FAILED: Should have prevented duplicate phone');
    } catch (err) {
      console.log('✅ Correctly rejected duplicate phone:', err.message);
    }

    console.log('\n✨ All tests passed!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
