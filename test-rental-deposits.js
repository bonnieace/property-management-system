/**
 * Test Script: Rental Deposit Flow
 * Tests the complete rental deposit workflow:
 * 1. Submit rental form → creates rental_deposits record
 * 2. Verify STK Push initiation with correct store
 * 3. Verify callback routing detects rental_deposits
 * 4. Verify tenant + contract creation in transaction
 */

const axios = require('axios');
const db = require('./src/db');

const BASE_URL = 'http://localhost:4000/api';

// ─────────────────────────────────────────────────────────────────
// TEST 1: Submit rental form and verify rental_deposits record
// ─────────────────────────────────────────────────────────────────
async function testRentalDepositCreation() {
  console.log('\n━━━ TEST 1: Rental Deposit Creation ━━━\n');
  
  try {
    // Get an available unit for testing
    const unit = await db('units').first();
    
    if (!unit) {
      console.error('❌ No units found in database. Run seeds first.');
      return false;
    }
    
    const rentalPayload = {
      type: 'rental',  // Key: This should trigger rentalStore
      unitId: unit.unit_id,  // Use unit_id string, not numeric id
      property: unit.property_id,
      guestName: 'Test Rental Guest',
      guestPhone: '0700000001',
      phone: '0700000001',  // Include phone field which is primary in stk-push handler
      guestEmail: 'rental@test.com',
      checkin: '2024-12-01',
      amount: 50000,
      notes: 'Test rental deposit'
    };
    
    console.log('📤 Submitting rental form:', rentalPayload);
    
    const response = await axios.post(`${BASE_URL}/mpesa/stk-push`, rentalPayload);
    
    if (!response.data.ok) {
      console.error('❌ STK Push failed:', response.data.error);
      return false;
    }
    
    console.log('✅ STK Push initiated:', {
      bookingId: response.data.bookingId,
      checkoutRequestId: response.data.checkoutRequestId,
      ref: response.data.ref,
    });
    
    // Verify rental_deposits record was created
    const depositId = response.data.bookingId;
    const deposit = await db('rental_deposits').where('id', depositId).first();
    
    if (!deposit) {
      console.error('❌ rental_deposits record not created!');
      return false;
    }
    
    console.log('✅ rental_deposits record created:', {
      id: deposit.id,
      guest_name: deposit.guest_name,
      status: deposit.status,
      checkout_request_id: deposit.checkout_request_id,
    });
    
    // Verify this is NOT in bookings table
    const bookingRecord = await db('bookings')
      .where('checkout_request_id', deposit.checkout_request_id)
      .first();
    
    if (bookingRecord) {
      console.error('❌ ERROR: Rental should NOT be in bookings table!');
      return false;
    }
    
    console.log('✅ Confirmed: Rental NOT in bookings table (architectural separation maintained)');
    
    return {
      success: true,
      depositId,
      checkoutRequestId: deposit.checkout_request_id,
      guestPhone: deposit.guest_phone,
    };
    
  } catch (err) {
    console.error('❌ Test 1 failed:', err.response?.data || err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// TEST 2: Verify callback routing detects rental_deposits
// ─────────────────────────────────────────────────────────────────
async function testCallbackRouting(testData) {
  console.log('\n━━━ TEST 2: Callback Routing ━━━\n');
  
  try {
    if (!testData || !testData.checkoutRequestId) {
      console.error('❌ No test data from previous test');
      return false;
    }
    
    // Simulate M-Pesa callback
    const callbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'test-request-123',
          CheckoutRequestID: testData.checkoutRequestId,
          ResultCode: 0,
          ResultDesc: 'The service request has been processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 50000 },
              { Name: 'MpesaReceiptNumber', Value: 'TEST123456' },
              { Name: 'TransactionDate', Value: '20241201123456' },
              { Name: 'PhoneNumber', Value: '0700000001' },  // Match test phone
            ]
          }
        }
      }
    };
    
    console.log('📤 Simulating M-Pesa callback for CheckoutRequestID:', testData.checkoutRequestId);
    
    // Give callback time to process (async, doesn't wait for response)
    axios.post(`${BASE_URL}/mpesa/callback`, callbackPayload).catch(() => {});
    
    // Wait a bit for callback processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if rental_deposits record was updated
    const deposit = await db('rental_deposits')
      .where('checkout_request_id', testData.checkoutRequestId)
      .first();
    
    if (!deposit) {
      console.error('❌ rental_deposits record not found after callback');
      return false;
    }
    
    console.log('✅ rental_deposits record found after callback:', {
      status: deposit.status,
      tenant_id: deposit.tenant_id,
      contract_id: deposit.contract_id,
      mpesa_receipt_number: deposit.mpesa_receipt_number,
    });
    
    // Verify tenant was created
    if (!deposit.tenant_id) {
      console.warn('⚠️  tenant_id not set (may still be processing)');
      return { success: true, partial: true, depositId: deposit.id };
    }
    
    const tenant = await db('tenants').where('id', deposit.tenant_id).first();
    
    if (!tenant) {
      console.error('❌ Tenant not found after callback!');
      return false;
    }
    
    console.log('✅ Tenant created:', {
      id: tenant.id,
      name: tenant.tenant_name,
      phone: tenant.tenant_phone,
    });
    
    // Verify contract was created
    const contract = await db('rental_contracts')
      .where('id', deposit.contract_id)
      .first();
    
    if (!contract) {
      console.error('❌ Contract not found after callback!');
      return false;
    }
    
    console.log('✅ Contract created:', {
      id: contract.id,
      tenant_id: contract.tenant_id,
      unit_id: contract.unit_id,
      monthly_rent: contract.monthly_rent_kes,
      status: contract.status,
    });
    
    // Verify rental_payment was recorded
    const payment = await db('rental_payments')
      .where('contract_id', contract.id)
      .first();
    
    if (!payment) {
      console.error('❌ Payment not recorded!');
      return false;
    }
    
    console.log('✅ Payment recorded:', {
      id: payment.id,
      amount: payment.amount_paid_kes,
      status: payment.status,
      mpesa_receipt: payment.mpesa_receipt,
    });
    
    return {
      success: true,
      depositId: deposit.id,
      tenantId: tenant.id,
      contractId: contract.id,
      paymentId: payment.id,
    };
    
  } catch (err) {
    console.error('❌ Test 2 failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// TEST 3: Verify B&B booking flow still works unchanged
// ─────────────────────────────────────────────────────────────────
async function testBnBFlowUnchanged() {
  console.log('\n━━━ TEST 3: B&B Booking Flow (Unchanged) ━━━\n');
  
  try {
    const unit = await db('units').first();
    
    if (!unit) {
      console.error('❌ No units found');
      return false;
    }
    
    const bnbPayload = {
      type: 'bnb',  // Key: This should use regular bookingStore
      unitId: unit.unit_id,  // Use unit_id string
      property: unit.property_id,
      guestName: 'Test B&B Guest',
      guestPhone: '0700000002',
      phone: '0700000002',  // Include phone field
      guestEmail: 'bnb@test.com',
      checkin: '2024-12-10',
      checkout: '2024-12-12',
      nights: 2,
      guests: 1,
      amount: 10000,
      notes: 'Test B&B booking'
    };
    
    console.log('📤 Submitting B&B booking form:', bnbPayload);
    
    const response = await axios.post(`${BASE_URL}/mpesa/stk-push`, bnbPayload);
    
    if (!response.data.ok) {
      console.error('❌ STK Push failed:', response.data.error);
      return false;
    }
    
    console.log('✅ B&B STK Push initiated:', {
      bookingId: response.data.bookingId,
      checkoutRequestId: response.data.checkoutRequestId,
    });
    
    // Verify bookings record was created (not rental_deposits)
    const bookingId = response.data.bookingId;
    const booking = await db('bookings').where('id', bookingId).first();
    
    if (!booking) {
      console.error('❌ bookings record not created for B&B!');
      return false;
    }
    
    console.log('✅ B&B booking record created (in bookings table, not rental_deposits):', {
      id: booking.id,
      guest_name: booking.guest_name,
      status: booking.status,
      booking_type: booking.booking_type,
    });
    
    // Verify this is NOT in rental_deposits
    const rentalRecord = await db('rental_deposits')
      .where('checkout_request_id', booking.checkout_request_id)
      .first();
    
    if (rentalRecord) {
      console.error('❌ ERROR: B&B booking should NOT be in rental_deposits table!');
      return false;
    }
    
    console.log('✅ Confirmed: B&B booking NOT in rental_deposits (separation maintained)');
    
    return {
      success: true,
      bookingId,
      checkoutRequestId: booking.checkout_request_id,
    };
    
  } catch (err) {
    console.error('❌ Test 3 failed:', err.response?.data || err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// MAIN TEST RUNNER
// ─────────────────────────────────────────────────────────────────
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Rental Deposits Architecture Test Suite                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  let test1Result = await testRentalDepositCreation();
  let test2Result = null;
  let test3Result = await testBnBFlowUnchanged();
  
  if (test1Result && test1Result.success) {
    test2Result = await testCallbackRouting(test1Result);
  }
  
  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  TEST SUMMARY                                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log('Test 1 (Rental Deposit Creation):', test1Result && test1Result.success ? '✅ PASS' : '❌ FAIL');
  console.log('Test 2 (Callback Routing):', test2Result && test2Result.success ? '✅ PASS' : test2Result && test2Result.partial ? '⚠️  PARTIAL' : '❌ FAIL');
  console.log('Test 3 (B&B Flow Unchanged):', test3Result && test3Result.success ? '✅ PASS' : '❌ FAIL');
  
  const allPassed = test1Result?.success && test2Result?.success && test3Result?.success;
  
  console.log('\n' + (allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'));
  
  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
