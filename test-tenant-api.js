#!/usr/bin/env node
/**
 * Test Tenant API Endpoints
 * Tests API layer integration
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:4000/api';
let authToken = null;

async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${API_URL}/admin/login`, {
      username: 'manager',
      password: 'secure-password-managerS'
    });
    authToken = response.data.token;
    console.log('✅ Login successful');
    return authToken;
  } catch (err) {
    console.error('❌ Login failed:', err.response?.data || err.message);
    throw err;
  }
}

async function testTenantAPI() {
  try {
    console.log('\n🧪 Testing Tenant API Endpoints\n');

    // Get token
    await login();

    const headers = { Authorization: `Bearer ${authToken}` };

    // Test 1: Create Tenant
    console.log('1️⃣  POST /api/admin/tenants');
    const createResponse = await axios.post(`${API_URL}/admin/tenants`, {
      tenant_phone: '+254787654321',
      tenant_name: 'Jane Smith',
      tenant_email: 'jane@example.com',
      id_number: 'ID654321',
      next_of_kin_phone: '+254787654322',
      next_of_kin_name: 'John Smith',
      notes: 'API test tenant'
    }, { headers });
    
    const tenantId = createResponse.data.data.id;
    console.log('✅ Created tenant:', tenantId);

    // Test 2: Get Tenant by Phone
    console.log('\n2️⃣  GET /api/admin/tenants/:phone');
    const phoneResponse = await axios.get(`${API_URL}/admin/tenants/+254787654321`, { headers });
    console.log('✅ Found tenant by phone:', phoneResponse.data.data.tenant_name);

    // Test 3: List Tenants
    console.log('\n3️⃣  GET /api/admin/tenants');
    const listResponse = await axios.get(`${API_URL}/admin/tenants?limit=10&offset=0`, { headers });
    console.log('✅ Listed tenants:', listResponse.data.data.length, 'found');

    // Test 4: Update Tenant
    console.log('\n4️⃣  PUT /api/admin/tenants/:id');
    const updateResponse = await axios.put(`${API_URL}/admin/tenants/${tenantId}`, {
      tenant_email: 'jane.updated@example.com',
      notes: 'Updated via API'
    }, { headers });
    console.log('✅ Updated tenant email:', updateResponse.data.data.tenant_email);

    console.log('\n✨ All API tests passed!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

testTenantAPI();
