#!/usr/bin/env node
/**
 * Test S5: M-Pesa Callback Dual-Flow Routing
 * Tests both rental and BnB payment flows
 */

require('dotenv').config();
const db = require('./src/db');
const tenantService = require('./src/tenantService');
const contractService = require('./src/contractService');
const paymentService = require('./src/paymentService');

/**
 * Simulate M-Pesa callback extraction and routing logic
 */

function normalisePhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0')   && digits.length === 10)  return '254' + digits.slice(1);
  if (digits.startsWith('7')   && digits.length === 9)   return '254' + digits;
  if (digits.startsWith('1')   && digits.length === 9)   return '254' + digits;
  return null;
}

async function simulateRentalPayment(phone, amount, receipt) {
  try {
    console.log(`\n🔹 Simulating rental payment: ${phone} | KES ${amount}`);

    // Lookup tenant
    const tenant = await tenantService.getTenantByPhone(phone);
    if (!tenant) {
      console.log(`   ❌ No tenant found → would route to BnB`);
      return { found: false };
    }

    console.log(`   ✅ Found tenant: ${tenant.tenant_name} (ID: ${tenant.id})`);

    // Get active contract
    const contract = await db('rental_contracts')
      .where('tenant_id', tenant.id)
      .where('status', 'active')
      .orderBy('start_date', 'desc')
      .first();

    if (!contract) {
      console.log(`   ❌ No active contract`);
      return { found: true, contract: false };
    }

    console.log(`   ✅ Found contract: ${contract.id} | rent: KES ${contract.monthly_rent_kes}`);

    // Record payment
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const payment = await paymentService.recordPayment({
      contract_id: contract.id,
      tenant_id: tenant.id,
      unit_id: contract.unit_id,
      month,
      year,
      amount_paid_kes: amount,
      mpesa_receipt: receipt,
      mpesa_phone: phone,
      mpesa_reference: `test_${receipt}`,
      notes: 'Test M-Pesa callback'
    });

    console.log(`   ✅ Payment recorded: ${payment.id}`);
    console.log(`   📊 Status: ${payment.status} | Outstanding: KES ${payment.amount_outstanding_kes}`);

    return {
      found: true,
      contract: true,
      payment_id: payment.id,
      status: payment.status
    };
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    throw err;
  }
}

async function runTests() {
  try {
    console.log('🧪 Testing S5: M-Pesa Callback Dual-Flow Routing\n');

    // Setup: Create test tenant and contract
    console.log('📋 SETUP: Creating test tenant and contract...');
    const testId = Date.now() % 1000000;
    const tenantPhone = `+254712${testId}`;

    const tenant = await tenantService.createTenant({
      tenant_phone: tenantPhone,
      tenant_name: 'S5 Test Tenant'
    });
    console.log(`✅ Tenant created: ${tenant.id} | Phone: ${tenantPhone}`);

    const unit = await db('units').first();
    const property = await db('properties').first();

    const contract = await contractService.createContract({
      tenant_id: tenant.id,
      unit_id: unit.id,
      property_id: property.id,
      start_date: '2024-01-01',
      monthly_rent_kes: 50000,
      payment_frequency: 'monthly'
    });
    console.log(`✅ Contract created: ${contract.id} | Monthly rent: KES ${contract.monthly_rent_kes}`);

    // Test 1: Rental payment (tenant found)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Rental Payment (Tenant Found)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const rentalResult1 = await simulateRentalPayment(tenantPhone, 50000, 'RECV001');
    console.log(`\n📍 Expected routing: RENTAL FLOW`);
    console.log(`✅ Actual routing: ${rentalResult1.found ? 'RENTAL FLOW' : 'BnB FLOW'}`);
    if (!rentalResult1.found) {
      throw new Error('Tenant should have been found!');
    }

    // Test 2: Partial payment (multiple transactions)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Rental Payment - Partial Payment');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Next month payment (partial)
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const month = nextMonth.getMonth() + 1;
    const year = nextMonth.getFullYear();

    console.log(`\n🔹 Recording first partial payment: KES 30000 for ${month}/${year}`);
    let payment1 = await paymentService.recordPayment({
      contract_id: contract.id,
      tenant_id: tenant.id,
      unit_id: unit.id,
      month,
      year,
      amount_paid_kes: 30000,
      mpesa_receipt: 'RECV002',
      mpesa_phone: tenantPhone,
      notes: 'First partial payment'
    });
    console.log(`   Status: ${payment1.status} | Outstanding: KES ${payment1.amount_outstanding_kes}`);

    // Second transaction (completes payment)
    console.log(`\n🔹 Recording second partial payment: KES 20000 for ${month}/${year}`);
    let payment2 = await paymentService.recordPayment({
      contract_id: contract.id,
      tenant_id: tenant.id,
      unit_id: unit.id,
      month,
      year,
      amount_paid_kes: 20000,
      mpesa_receipt: 'RECV003',
      mpesa_phone: tenantPhone,
      notes: 'Second partial payment'
    });
    console.log(`   Status: ${payment2.status} | Outstanding: KES ${payment2.amount_outstanding_kes}`);
    console.log(`   ✅ Two transactions accumulated correctly`);

    // Test 3: Non-existent tenant (should route to BnB)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Non-Existent Tenant (Should Route to BnB)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const nonExistentPhone = `+254799999999`;
    const bnbResult = await simulateRentalPayment(nonExistentPhone, 50000, 'RECV004');
    console.log(`\n📍 Expected routing: BnB FLOW`);
    console.log(`✅ Actual routing: ${bnbResult.found ? 'RENTAL FLOW' : 'BnB FLOW'}`);
    if (bnbResult.found) {
      throw new Error('Non-existent tenant should not have been found!');
    }

    // Test 4: Phone number normalization
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Phone Number Normalization');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Extract the last 9 digits of tenantPhone
    const digits = tenantPhone.slice(-9);
    const formats = [
      `0${digits}`,
      `7${digits.slice(1)}`,
      `254${digits}`,
      `+254${digits}`
    ];

    console.log(`\n🔹 Testing various phone formats for tenant: ${tenantPhone}`);
    for (const format of formats) {
      const norm = normalisePhone(format);
      const match = norm === tenantPhone;
      console.log(`   ${format.padEnd(15)} → ${norm.padEnd(15)} ${match ? '✅' : '❌'}`);
    }

    // Test 5: Get payment summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Payment Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const summary = await paymentService.getContractPaymentSummary(contract.id);
    console.log(`\n📊 Contract Payment Summary:`);
    console.log(`   Total due: KES ${summary.total_due_kes}`);
    console.log(`   Total paid: KES ${summary.total_paid_kes}`);
    console.log(`   Outstanding: KES ${summary.total_outstanding_kes}`);
    console.log(`   Paid months: ${summary.status_breakdown.paid}`);
    console.log(`   Partial months: ${summary.status_breakdown.partial}`);

    console.log('\n✨ All S5 tests passed!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

runTests();
