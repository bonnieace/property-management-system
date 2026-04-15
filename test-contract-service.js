#!/usr/bin/env node
/**
 * Test Contract Service
 * Tests CRUD operations for rental contracts
 */

require('dotenv').config();
const contractService = require('./src/contractService');
const tenantService = require('./src/tenantService');
const db = require('./src/db');

async function runTests() {
  try {
    console.log('🧪 Testing Contract Service\n');

    // Setup: Create a tenant
    console.log('📋 Setup: Creating test tenant...');
    const tenant = await tenantService.createTenant({
      tenant_phone: '+254712999997',
      tenant_name: 'Contract Test Tenant'
    });
    console.log('✅ Tenant created:', tenant.id);

    // Get a unit (assuming units exist from previous setup)
    const unit = await db('units').first();
    if (!unit) {
      throw new Error('No units found in database. Please create units first.');
    }
    console.log('✅ Using unit:', unit.id);

    // Get a property
    const property = await db('properties').first();
    if (!property) {
      throw new Error('No properties found in database. Please create properties first.');
    }
    console.log('✅ Using property:', property.id);

    // Test 1: Create Contract
    console.log('\n1️⃣  Creating contract...');
    const newContract = await contractService.createContract({
      tenant_id: tenant.id,
      unit_id: unit.id,
      property_id: property.id,
      start_date: '2024-01-01',
      end_date: '2025-12-31',
      monthly_rent_kes: 35000,
      payment_frequency: 'monthly',
      security_deposit_kes: 70000,
      utilities_deposit_kes: 5000,
      notes: 'Test contract'
    });
    console.log('✅ Contract created:', newContract.id);
    console.log('   Tenant:', newContract.tenant_name);
    console.log('   Monthly rent:', newContract.monthly_rent_kes, 'KES');
    console.log('   Status:', newContract.status);
    const contractId = newContract.id;

    // Test 2: Get Contract by ID
    console.log('\n2️⃣  Getting contract by ID...');
    const contractById = await contractService.getContractById(contractId);
    console.log('✅ Found contract:', contractById.id);
    console.log('   Tenant phone:', contractById.tenant_phone);

    // Test 3: Get Active Tenant Contract
    console.log('\n3️⃣  Getting active contract for tenant...');
    const activeContract = await contractService.getActiveTenantContract(tenant.id);
    console.log('✅ Found active contract:', activeContract.id);
    console.log('   Status:', activeContract.status);

    // Test 4: List Contracts
    console.log('\n4️⃣  Listing all contracts...');
    const allContracts = await contractService.listContracts({ limit: 10, offset: 0 });
    console.log('✅ Found', allContracts.length, 'contracts');
    console.log('   Created contract in list:', allContracts.some(c => c.id === contractId));

    // Test 5: Update Contract
    console.log('\n5️⃣  Updating contract...');
    const updatedContract = await contractService.updateContract(contractId, {
      monthly_rent_kes: 40000,
      notes: 'Updated rent amount'
    });
    console.log('✅ Updated monthly rent:', updatedContract.monthly_rent_kes, 'KES');
    console.log('   Updated notes:', updatedContract.contract_notes);

    // Test 6: Filter Contracts by Tenant
    console.log('\n6️⃣  Filtering contracts by tenant...');
    const tenantContracts = await contractService.listContracts({
      tenant_id: tenant.id,
      limit: 10,
      offset: 0
    });
    console.log('✅ Found', tenantContracts.length, 'contracts for tenant');

    // Test 7: Get Tenant-Unit Contract
    console.log('\n7️⃣  Getting tenant-unit contract...');
    const tuContract = await contractService.getTenantUnitContract(tenant.id, unit.id);
    console.log('✅ Found tenant-unit contract:', tuContract.id);

    // Test 8: End Contract
    console.log('\n8️⃣  Ending contract...');
    const endedContract = await contractService.endContract(contractId, 'Lease ended by mutual agreement');
    console.log('✅ Contract ended');
    console.log('   Status:', endedContract.status);
    console.log('   End date:', endedContract.end_date);
    console.log('   Termination reason:', endedContract.termination_reason);

    console.log('\n✨ All contract tests passed!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

runTests();
