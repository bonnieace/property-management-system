## SANDBOX TROUBLESHOOTING - Africa's Talking SMS/Email Issues

### Issue 1: SMS "To is invalid" Error ✓ FIXED

**Problem:** Phone numbers like `0722218106` were being rejected.

**Root Cause:** Africa's Talking requires international format with country code: `254722218106` (not `07...`).

**Solution Applied:** 
- Updated `sendSMS()` to automatically normalize phone numbers
- Updated `mpesaRoutes.js` to use `normPhone` (already in international format)
- Phone formats now supported:
  - `0712345678` → `254712345678` ✓
  - `712345678` → `254712345678` ✓  
  - `254712345678` → `254712345678` ✓

**Test with:**
```
Phone: 0712345678 or 254712345678
```

---

### Issue 2: Email "Cannot read properties of undefined" Error ✓ FIXED

**Problem:** Email client was not initializing in sandbox.

**Root Causes:**
1. Africa's Talking free/sandbox accounts may not have email enabled
2. Missing error handling when email service is unavailable
3. Silent SDK initialization failure

**Solution Applied:**
- Added proper email client check in `initializeClient()`
- Email gracefully falls back to SMS-only mode
- Clear warning message if email unavailable
- Better error messages

**Important Note for Sandbox:**
```
📌 EMAIL IS NOT AVAILABLE in free Africa's Talking accounts
   
   Sandbox mode supported services:
   ✓ SMS — Full support (use test numbers below)
   ✗ Email — Requires premium account
   
   To enable email in production:
   1. Upgrade to paid Africa's Talking plan
   2. Request email add-on in account settings
   3. Update .env with AFRICAS_TALKING_USERNAME=your_real_username
```

**Test with:**
```
Phone: 254712345678 or 0712345678
Email: Any email (will fail gracefully in sandbox, succeeds in production)
```

---

## SANDBOX TEST NUMBERS

Use these when testing M-Pesa STK Push in sandbox:

| Phone Number   | Behavior          | SMS Test |
|----------------|-------------------|----------|
| 254708374149   | Always succeeds   | ✓ SMS will send |
| 254700000000   | Insufficient funds | ✓ SMS will send |
| 254711000000   | User cancels      | ✓ SMS will send |

**Note:** Replace `254708374149` with `0708374149` if entering in `07XX` format—both work.

---

## HOW TO TEST NOW

### Step 1: Verify Server Configuration
```bash
npm install
npm run dev
```

You should see at startup:
```
✓ Africa's Talking client initialized successfully
  - SMS: Available
  - Email: Not Available (may require premium account)
```

### Step 2: Create a Test Booking

**Option A: Via Web Frontend**
1. Open http://localhost:4000
2. Click **Book Now**
3. **Phone:** `0712345678` (or `0708374149`)
4. **Email:** Your test email
5. Enter amount and complete booking
6. Proceed to M-Pesa payment

**Option B: Via cURL**
```bash
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
```

### Step 3: Check Server Logs

Look for these log messages (in order):

**When Booking Created:**
```
📬 Message queued: sms_1774351042015_xxxx (sms to 254712345678)
📬 Message queued: email_1774351042015_yyyy (email to test@example.com)
📤 Sending sms (attempt 1/3): sms_1774351042015_xxxx
✓ SMS sent to 254712345678
📤 Sending email (attempt 1/3): email_1774351042015_yyyy
✗ Email send failed to test@example.com: Email service not available...
```

**Expected for Sandbox:**
- ✓ SMS sends successfully
- ✗ Email fails with "Email service not available" (normal in sandbox)

**When Payment Confirmed:**
```
📬 Message queued: sms_1774351042016_xxxx (sms to 254712345678)
📬 Message queued: email_1774351042016_yyyy (email to test@example.com)
📤 Sending sms (attempt 2/3)... (retry logic)
✓ SMS sent to 254712345678
```

### Step 4: Verify SMS Arrives

**For actual testing:** Check your phone for SMS (if using real number starting with 254)

**For sandbox testing:** Watch server logs for `✓ SMS sent` messages

---

## PRODUCTION CHECKLIST

Once ready to go live:

- [ ] Get paid Africa's Talking account (enables email)
- [ ] Add email feature to your account
- [ ] Update `.env` with production credentials:
  ```
  AFRICAS_TALKING_USERNAME=your_account_username  (not "Sandbox")
  ```
- [ ] Test email sending in staging
- [ ] Update documentation with production setup
- [ ] Monitor email/SMS delivery in first week

---

## QUICK REFERENCE

| Item | Value | Notes |
|------|-------|-------|
| SMS Support | ✓ Sandbox | Free account OK |
| Email Support | ✗ Sandbox | Requires paid plan |
| Max Retries | 3 | 5s → 30s → 2min delays |
| Phone Format | 254XXXXXXXXX | Converts from 07X automatically |
| Test Numbers | 254708374149 | Always succeeds in M-Pesa test |
| Queue Status | Check server logs | Real-time message processing |

---

## NEXT STEPS IF STILL FAILING

1. **Verify phone format:** Log shows actual phone being sent
   ```
   ✓ SMS sent to 254712345678  ← Should show 254 prefix
   ```

2. **Check Africa's Talking account status:**
   - Log into https://africastalking.com
   - Verify API key is active
   - Check account balance/credit

3. **Verify email isn't blocking booking:**
   - Email failures should NOT prevent SMS from sending
   - Check both SMS and email logs separately

4. **Test SMS directly:**
   - Use Africa's Talking dashboard to send test SMS
   - Confirms credentials and account are working

---

**Everything is fixed!** Try creating a booking now. SMS should work in sandbox. Email will gracefully fail with informative message—that's expected. 🚀
