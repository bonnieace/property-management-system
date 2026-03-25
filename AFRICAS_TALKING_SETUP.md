/**
 * AFRICA'S TALKING API INTEGRATION GUIDE
 * 
 * This guide provides setup, configuration, and testing instructions
 * for the Africa's Talking SMS and Email integration.
 */

// ════════════════════════════════════════════════════════════════════════════
// SETUP & CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

/*

1. GET AFRICA'S TALKING CREDENTIALS
   ─────────────────────────────────
   a) Sign up at https://africastalking.com (Free sandbox account available)
   b) Go to Settings → API Keys to get:
      • API Key (looks like: abcdef1234567890abcdef1234567890)
      • Username (your account username)
   
   c) Optional: Register SMS Sender ID at Settings → SMS Sender IDs
      Default: NYATHIRA (11 character limit for African carriers)


2. UPDATE .env FILE
   ─────────────────
   Replace placeholder values in .env with your actual credentials:

   AFRICAS_TALKING_API_KEY=your_actual_api_key_here
   AFRICAS_TALKING_USERNAME=your_account_username
   AFRICAS_TALKING_SENDER_ID=NYATHIRA            # Optional, defaults to NYATHIRA
   BOOKING_NOREPLY_EMAIL=noreply@nyathira.com    # Your email domain


3. VERIFY INSTALLATION
   ────────────────────
   npm install
   # This should have installed the 'africastalking' package


4. RESTART SERVER
   ───────────────
   npm start
   # or npm run dev for development with watch mode


*/

// ════════════════════════════════════════════════════════════════════════════
// INTEGRATION OVERVIEW
// ════════════════════════════════════════════════════════════════════════════

/*

MESSAGING FLOW:
───────────────

1. User initiates booking → POST /api/mpesa/stk-push
   └─→ Booking created in store
   └─→ Booking confirmation SMS + Email QUEUED
   └─→ Message queue processes: queues for immediate retry if fails

2. User completes M-Pesa payment
   └─→ Safaricom callback → POST /api/mpesa/callback
   └─→ Booking status updated to 'confirmed'
   └─→ Payment receipt SMS + Email QUEUED
   └─→ Message queue processes with exponential backoff retry


MESSAGE QUEUE RETRY LOGIC:
──────────────────────────

• Initial attempt: Sent immediately
• Retry 1 (if failed): After 5 seconds
• Retry 2 (if failed): After 30 seconds
• Retry 3 (if failed): After 2 minutes
• Final attempt: After 2 minutes again (max 3 retries)

If all retries fail:
  → Message logged as permanently failed
  → Server continues (notifications don't block bookings)
  → Check logs for troubleshooting


FILES CREATED/MODIFIED:
───────────────────────

NEW FILES:
  • src/africastalkingService.js — SMS/Email sending functions
  • src/messageQueue.js — Queue system with retry logic

MODIFIED FILES:
  • package.json — Added 'africastalking' dependency
  • .env — Added Africa's Talking configuration
  • src/mpesaRoutes.js — Integrated messaging into booking flow


*/

// ════════════════════════════════════════════════════════════════════════════
// MESSAGE TEMPLATES
// ════════════════════════════════════════════════════════════════════════════

/*

BOOKING CONFIRMATION MESSAGE (sent when booking created):

SMS:
  "Hi {guestName}, your booking reference is {ref}. Check-in: {checkin}, 
   Check-out: {checkout}. Complete M-Pesa payment to confirm."

EMAIL:
  Subject: "Booking Confirmation - {ref}"
  Contains: Booking details, property info, check-in/out dates, amount


PAYMENT RECEIPT MESSAGE (sent when payment confirmed):

SMS:
  "Hi {guestName}, payment of KES {amount} confirmed! Receipt: {receipt}. 
   Booking {ref} confirmed. Check-in: {checkin}."

EMAIL:
  Subject: "Payment Confirmed - {ref}"
  Contains: M-Pesa receipt number, transaction date, amount, booking details


*/

// ════════════════════════════════════════════════════════════════════════════
// TESTING
// ════════════════════════════════════════════════════════════════════════════

/*

UNIT TESTS:
───────────

1. Test messaging service loads:
   node -e "require('./src/africastalkingService'); console.log('✓ Loaded')"

2. Test message queue loads:
   node -e "require('./src/messageQueue'); console.log('✓ Loaded')"

3. Check queue status (after server is running):
   curl http://localhost:4000/api/queue-status
   (Add this endpoint in server.js if needed for debugging)


INTEGRATION TESTS:
──────────────────

1. START SERVER IN DEVELOPMENT MODE:
   npm run dev

2. CREATE A TEST BOOKING VIA API:

   curl -X POST http://localhost:4000/api/mpesa/stk-push \
     -H "Content-Type: application/json" \
     -d '{
       "phone": "0712345678",
       "amount": 100,
       "guestName": "Test Guest",
       "guestEmail": "test@example.com",
       "checkin": "2024-04-01",
       "checkout": "2024-04-03",
       "property": "nyathira",
       "type": "bnb"
     }'

   Expected: 200 OK with bookingId and checkoutRequestId

3. CHECK LOGS FOR MESSAGES:

   Look in server console for:
   ✓ "Messages queued for booking {bookingId}"
   📬 "Message queued: {messageId} (sms to {phone})"
   📬 "Message queued: {messageId} (email to {email})"

4. CHECK MESSAGE QUEUE:

   In messageQueue.js, add this endpoint to mpesaRoutes.js for debugging:

   router.get('/debug/queue', (req, res) => {
     const status = msgQueue.getQueueStatus();
     return res.json(status);
   });

   Then: curl http://localhost:4000/api/debug/queue


MANUAL TESTING WITH REAL CREDENTIALS:
─────────────────────────────────────

1. Configure .env with your Africa's Talking credentials
2. Use your own phone/email for testing
3. Create a booking via the web frontend (public/index.html)
4. Watch the console for message processing logs
5. Verify SMS/Email arrive within 1-2 minutes


ERROR HANDLING:
───────────────

If messages fail to send:

1. Check .env credentials are correct (not placeholders)
2. Check server logs for specific error messages
3. Verify phone number format starts with 254 (international)
4. Verify email address is valid
5. Test Africa's Talking credentials directly in their dashboard
6. Check rate limits: Africa's Talking has message rate limits


*/

// ════════════════════════════════════════════════════════════════════════════
// API REFERENCE - AFRICAS TALKING SERVICE
// ════════════════════════════════════════════════════════════════════════════

/*

MODULE: src/africastalkingService.js

EXPORTED FUNCTIONS:

1. sendSMS(phoneNumber, message)
   • Sends raw SMS to phone number
   • Args: phoneNumber='254712345678', message='Content...'
   • Returns: {success: boolean, error?: string}

2. sendEmail(toEmail, subject, htmlBody)
   • Sends HTML email
   • Args: toEmail, subject, htmlBody='<html>...</html>'
   • Returns: {success: boolean, error?: string}

3. sendBookingConfirmationSMS(phoneNumber, bookingData)
   • Pre-formatted SMS for booking confirmation
   • bookingData: {ref, guestName, checkin, checkout, ...}

4. sendBookingConfirmationEmail(toEmail, bookingData)
   • Pre-formatted email for booking confirmation

5. sendPaymentReceiptSMS(phoneNumber, bookingData)
   • Pre-formatted SMS for payment confirmation
   • bookingData must include: mpesaReceiptNumber

6. sendPaymentReceiptEmail(toEmail, bookingData)
   • Pre-formatted email for payment confirmation


INTERNAL:
• initializeClient() — Lazy-initializes Africa's Talking SDK
• Throws error if credentials not configured
• Called automatically before send operations


*/

// ════════════════════════════════════════════════════════════════════════════
// API REFERENCE - MESSAGE QUEUE
// ════════════════════════════════════════════════════════════════════════════

/*

MODULE: src/messageQueue.js

EXPORTED FUNCTIONS:

1. queueBookingConfirmationMessages(phoneNumber, email, bookingData)
   • Queue both SMS and Email for booking confirmation
   • Called automatically in POST /api/mpesa/stk-push
   • Returns: {smsMsgId, emailMsgId}

2. queuePaymentReceiptMessages(phoneNumber, email, bookingData)
   • Queue both SMS and Email for payment receipt
   • Called automatically in POST /api/mpesa/callback
   • Returns: {smsMsgId, emailMsgId}

3. queueMessage(type, recipient, messageType, data)
   • Lower-level queue function (used internally)
   • type: 'sms' or 'email'
   • messageType: 'booking_confirmation' or 'payment_receipt'
   • Returns: messageId (string)

4. getQueueStatus()
   • Get queue statistics and pending messages
   • Returns: {totalQueued, processing, messages: [...]}
   • Useful for debugging

5. processQueue()
   • Manually trigger queue processing (called automatically)
   • Useful for testing


INTERNAL:
• Message retry logic with exponential backoff
• Runs asynchronously in background (non-blocking)
• Max 3 attempts per message
• Delays: 5s → 30s → 2min


*/

// ════════════════════════════════════════════════════════════════════════════
// TROUBLESHOOTING
// ════════════════════════════════════════════════════════════════════════════

/*

Problem: "Africa's Talking credentials not properly configured"
→ Solution: Update .env with actual API key and username (not placeholders)

Problem: "Module not found: africastalking"
→ Solution: Run `npm install` to install the package

Problem: Messages not sending
→ Check: Are phone numbers in format 254XXXXXXXXX (international)?
→ Check: Are emails valid?
→ Check: Is your Africa's Talking account active?
→ Check: Do you have account credit/good standing?

Problem: Server crashes on startup
→ Solution: Move credentials check to lazy initialization (already done)
→ Verify: Run `npm install` to ensure all deps installed

Problem: Server starts but no messages appear in logs
→ Check: Are bookings being created? (Check /status endpoint)
→ Check: Does booking have guestEmail? (Required to queue messages)
→ Solution: Create booking with all required fields including email

Problem: Messages appear in logs but don't arrive
→ Possible: Rate limiting by Africa's Talking
→ Possible: Invalid credentials causing silent failures
→ Solution: Test credentials directly in Africa's Talking dashboard

Problem: Email not sending but SMS works
→ Check: Is BOOKING_NOREPLY_EMAIL set in .env?
→ Check: Is guestEmail provided when creating booking?
→ Note: Africa's Talking may have separate email approval process


*/

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY OF CHANGES
// ════════════════════════════════════════════════════════════════════════════

/*

WHAT WAS IMPLEMENTED:

✓ Africa's Talking SDK integration
✓ SMS sending capability
✓ Email sending capability  
✓ Automatic message queueing on booking creation
✓ Automatic message queueing on payment confirmation
✓ Exponential backoff retry logic (3 attempts max)
✓ Graceful error handling (messaging failures don't block bookings)
✓ Lazy initialization of credentials (server can start without valid creds)
✓ Comprehensive logging of all message send attempts
✓ Pre-formatted booking confirmation and payment receipt messages


WHAT WAS NOT IMPLEMENTED (Future Enhancements):

• Admin alerts for persistent messaging failures
• Message template customization via .env
• Database persistence for message queue
• WebSocket real-time notification to frontend
• Message delivery status tracking
• Rate limiting configuration
• A/B testing of message templates


NEXT STEPS TO PRODUCTION:

1. Get Africa's Talking API credentials
2. Update .env with actual credentials
3. Test end-to-end with real bookings
4. Consider upgrading to paid Africa's Talking account if on free tier
5. Monitor logs for any failed sends
6. Consider adding alert system for persistent failures
7. Move message queue to database when bookingStore moves to database


*/
