#!/usr/bin/env node

/**
 * Calendar Integration Test
 * Tests the full flow: property listing → calendar → booking modal
 */

const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, condition, details = '') {
  const result = condition ? '✓ PASS' : '✗ FAIL';
  const status = condition ? 'passed' : 'failed';
  
  testResults[status]++;
  testResults.tests.push({ name, result, details });
  
  console.log(`${result} - ${name}`);
  if (details) console.log(`       ${details}`);
}

// ─────────────────────────────────────────────────────
// MOCK DOM ELEMENTS
// ─────────────────────────────────────────────────────

global.document = {
  getElementById: (id) => ({
    value: '',
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    innerHTML: '',
    style: {},
    textContent: '',
    querySelector: () => null
  }),
  querySelectorAll: () => [],
  createElement: (tag) => ({
    innerHTML: '',
    style: {},
    classList: { add: () => {} }
  })
};

global.window = {
  location: { hostname: 'localhost' },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  state: {
    bookingUnit: 'bnb1b-nyathira',
    bookingProp: 'nyathira'
  },
  updateBookingSummary: () => {},
  showToast: (msg) => console.log(`  Toast: ${msg}`),
  goBookingStep: (step) => console.log(`  → Navigating to booking step ${step}`)
};

// ─────────────────────────────────────────────────────
// TEST SUITE
// ─────────────────────────────────────────────────────

console.log('\n╔════════════════════════════════════════════════╗');
console.log('║   CALENDAR INTEGRATION TEST SUITE             ║');
console.log('╚════════════════════════════════════════════════╝\n');

// Test 1: Calendar widget file exists
console.log('📝 Testing Calendar Widget...');
const fs = require('fs');
try {
  const calendarPath = './public/js/calendar.js';
  fs.accessSync(calendarPath);
  test('CalendarWidget module exists', true);
} catch (err) {
  test('CalendarWidget module exists', false, 'File not found');
}

// Test 2: HTML Structure
const html = fs.readFileSync('./public/index.html', 'utf8');

test('bookingModal div exists', html.includes('id="bookingModal"'));
test('calendarModal div exists', html.includes('id="calendarModal"'));
test('calendarContainer div exists', html.includes('id="calendarContainer"'));
test('openCalendarForListing function defined', html.includes('function openCalendarForListing'));
test('Check Dates button for bnb1b', html.includes('openCalendarForListing(\'bnb1b-nyathira\''));
test('Check Dates button for bnb2b-nyathira', html.includes('openCalendarForListing(\'bnb2b-nyathira\''));
test('Check Dates button for bnb2b-kibabu', html.includes('openCalendarForListing(\'bnb2b-kibabu\''));

// Test 3: Admin routes file exists
console.log('\n📝 Testing Admin Routes...');
try {
  fs.accessSync('./src/adminRoutes.js');
  test('adminRoutes module exists', true);
} catch (err) {
  test('adminRoutes module exists', false, 'File not found');
}

// Test 4: Admin Auth file exists
console.log('\n📝 Testing Admin Authentication...');
try {
  fs.accessSync('./src/adminAuth.js');
  test('adminAuth module exists', true);
} catch (err) {
  test('adminAuth module exists', false, 'File not found');
}

// Test 5: Server Configuration
console.log('\n📝 Testing Server Configuration...');
try {
  const serverCode = fs.readFileSync('./server.js', 'utf8');
  test('adminRoutes imported in server.js', serverCode.includes("require('./src/adminRoutes')"));
  test('adminRoutes registered at /api/admin', serverCode.includes("app.use('/api/admin', adminRoutes)"));
  test('PUT method in CORS', serverCode.includes("'PUT'"));
  test('DELETE method in CORS', serverCode.includes("'DELETE'"));
} catch (err) {
  test('Server configuration check', false, err.message);
}

// Test 6: API Endpoints Defined
console.log('\n📝 Testing API Endpoints...');
try {
  const adminRoutesCode = fs.readFileSync('./src/adminRoutes.js', 'utf8');
  test('POST /admin/login endpoint', adminRoutesCode.includes("router.post('/login'"));
  test('GET /admin/pricing-rules endpoint', adminRoutesCode.includes("router.get('/pricing-rules'"));
  test('POST /admin/pricing-rules endpoint', adminRoutesCode.includes("router.post('/pricing-rules'"));
  test('GET /admin/blocked-dates endpoint', adminRoutesCode.includes("router.get('/blocked-dates'"));
  test('POST /admin/blocked-dates endpoint', adminRoutesCode.includes("router.post('/blocked-dates'"));
  test('GET /admin/bookings endpoint', adminRoutesCode.includes("router.get('/bookings'"));
  test('GET /admin/waitlist endpoint', adminRoutesCode.includes("router.get('/waitlist'"));
  test('GET /admin/audit-log endpoint', adminRoutesCode.includes("router.get('/audit-log'"));
} catch (err) {
  test('API endpoints check', false, err.message);
}

// ─────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────

console.log('\n╔════════════════════════════════════════════════╗');
console.log('║   TEST RESULTS                                ║');
console.log('╚════════════════════════════════════════════════╝\n');

testResults.tests.forEach(t => {
  const symbol = t.result.includes('PASS') ? '✓' : '✗';
  console.log(`${symbol} ${t.name}`);
  if (t.details) console.log(`  → ${t.details}`);
});

console.log(`\n📊 Summary: ${testResults.passed} passed, ${testResults.failed} failed\n`);

if (testResults.failed === 0) {
  console.log('✨ All tests passed!\n');
  process.exit(0);
} else {
  console.log(`⚠️  ${testResults.failed} test(s) failed\n`);
  process.exit(1);
}
