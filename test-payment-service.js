#!/usr/bin/env node
/**
 * Test Payment Service
 * Tests payment recording with partial payment and overpayment logic
 */

require('dotenv').config();
const paymentService = require('./src/paymentService');
const tenantService = require('./src/tenantService');
const contractService = require('./src/contractService');
const db = require('./src/db');

async function runTests() {
  try {
    console.log('🧪 Testing Payment Service\n');

    // Setup: Create tenant
    console.log('📋 Setup: Creating test tenant...');
    const testId = Date.now() % 1000000;
    const tenant = await tenantService.createTenant({
      tenant_phone: `+254712${testId}`,
      tenant_name: 'Payment Test Tenant'
    });
    console.log('✅ Tenant created:', tenant.id);

    // Get unit and property
    const unit = await db('units').first();
    const property = await db('properties').first();
    console.log('✅ Using unit:', unit.id, '| property:', property.id);

    // Setup: Create contract
    console.log('\n📋 Setup: Creating test contract...');
    const contract = await contractService.createContract({
      tenant_id: tenant.id,
      unit_id: unit.id,
      property_id: property.id,
      start_date: '2024-01-01',
      monthly_rent_kes: 50000,
      payment_frequency: 'monthly'
    });
    console.log('✅ Contract created:', contract.id);
    console.log('   Monthly rent: 50,000 KES');
    const contractId = contract.id;

    // Test 1: Record Full Payment
    console.log('\n1️⃣  Recording full payment...');
    const fullPayment = await paymentService.recordPayment({
      contract_id: contractId,
      tenant_id: tenant.id,
      unit_id: unit.id,
      month: 1,
      year: 2024,
      amount_paid_kes: 50000,
      mpesa_receipt: 'MPF123456',
      mpesa_phone: '+254712888888',
      notes: 'Full January payment'
    });
    console.log('✅ Payment recorded:');
    console.log('   Amount due:', fullPayment.amount_due_kes, 'KES');
    console.log('   Amount paid:', fullPayment.amount_paid_kes, 'KES');
    console.log('   Status:', fullPayment.status);
    console.log('   Outstanding:', fullPayment.amount_outstanding_kes, 'KES');

    // Test 2: Record Partial Payment
    console.log('\n2️⃣  Recording partial payment for February...');
    const partialPayment = await paymentService.recordPayment({
      contract_id: contractId,
      tenant_id: tenant.id,
      unit_id: unit.id,
      month: 2,
      year: 2024,
      amount_paid_kes: 30000,
      mpesa_receipt: 'MPF234567',
      mpesa_phone: '+254712888888',
      notes: 'Partial February payment'
    });
    console.log('✅ Partial payment recorded:');
    console.log('   Amount due:', partialPayment.amount_due_kes, 'KES');
    console.log('   Amount paid:', partialPayment.amount_paid_kes, 'KES');
    console.log('   Status:', partialPayment.status);
    console.log('   Outstanding:', partialPayment.amount_outstanding_kes, 'KES');

    // Test 3: Complete Partial Payment (multiple transactions)
    console.log('\n3️⃣  Completing partial payment with second transaction...');
    const completedPayment = await paymentService.recordPayment({
      contract_id: contractId,
      tenant_id: tenant.id,
      unit_id: unit.id,
      month: 2,
      year: 2024,
      amount_paid_kes: 20000,
      mpesa_receipt: 'MPF234568',
      mpesa_phone: '+254712888888',
      notes: 'Completing February payment'
    });
    console.log('✅ Payment completed:');
    console.log('   Total paid for month:', completedPayment.amount_paid_kes, 'KES');
    console.log('   Status:', completedPayment.status);
    console.log('   Outstanding:', completedPayment.amount_outstanding_kes, 'KES');

    // Test 4: Record Overpayment
    console.log('\n4️⃣  Recording overpayment for March...');
    const overpayment = await paymentService.recordPayment({
      contract_id: contractId,
      tenant_id: tenant.id,
      unit_id: unit.id,
      month: 3,
      year: 2024,
      amount_paid_kes: 60000,
      mpesa_receipt: 'MPF345678',
      mpesa_phone: '+254712888888',
      notes: 'Overpayment with advance'
    });
    console.log('✅ Overpayment recorded:');
    console.log('   Amount due:', overpayment.amount_due_kes, 'KES');
    console.log('   Amount paid:', overpayment.amount_paid_kes, 'KES');
    console.log('   Status:', overpayment.status);
    console.log('   Outstanding:', overpayment.amount_outstanding_kes, 'KES (negative = credit)');

    // Test 5: Get Monthly Payment
    console.log('\n5️⃣  Getting specific monthly payment...');
    const monthlyPayment = await paymentService.getMonthlyPayment(contractId, 1, 2024);
    console.log('✅ Found payment:', monthlyPayment.id);
    console.log('   Month:', monthlyPayment.month, '/', monthlyPayment.year);
    console.log('   Status:', monthlyPayment.status);

    // Test 6: List Payments
    console.log('\n6️⃣  Listing all payments...');
    const allPayments = await paymentService.listPayments({
      contract_id: contractId,
      limit: 10,
      offset: 0
    });
    console.log('✅ Found', allPayments.length, 'payments');
    allPayments.forEach(p => {
      console.log(`   ${p.month}/${p.year}: ${p.amount_paid_kes}/${p.amount_due_kes} KES (${p.status})`);
    });

    // Test 7: Filter by Status
    console.log('\n7️⃣  Filtering payments by status...');
    const paidPayments = await paymentService.listPayments({
      contract_id: contractId,
      status: 'paid'
    });
    console.log('✅ Found', paidPayments.length, 'paid payments');

    // Test 8: Get Tenant Arrears
    console.log('\n8️⃣  Checking tenant arrears...');
    const arrears = await paymentService.getTenantArrears(tenant.id);
    console.log('✅ Tenant arrears:');
    console.log('   Total outstanding:', arrears.total_outstanding_kes, 'KES');
    console.log('   Number of arrear months:', arrears.count);

    // Test 9: Get Payment Summary
    console.log('\n9️⃣  Getting contract payment summary...');
    const summary = await paymentService.getContractPaymentSummary(contractId);
    console.log('✅ Payment summary:');
    console.log('   Total due:', summary.total_due_kes, 'KES');
    console.log('   Total paid:', summary.total_paid_kes, 'KES');
    console.log('   Total outstanding:', summary.total_outstanding_kes, 'KES');
    console.log('   Status breakdown:');
    console.log('     - Paid:', summary.status_breakdown.paid);
    console.log('     - Partial:', summary.status_breakdown.partial);
    console.log('     - Pending:', summary.status_breakdown.pending);

    console.log('\n✨ All payment tests passed!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

runTests();
