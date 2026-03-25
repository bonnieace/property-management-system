/**
 * Africa's Talking Messaging Service
 * Handles SMS and Email notifications for booking lifecycle events
 */

const africastalking = require('africastalking');

// Lazy-initialized Africa's Talking client
let atClient = null;
let sms = null;
let email = null;

/**
 * Initialize Africa's Talking client (lazy)
 * @private
 * @throws Will throw if credentials are not configured
 */
function initializeClient() {
  if (atClient) return;

  const apiKey = process.env.AFRICAS_TALKING_API_KEY;
  const username = process.env.AFRICAS_TALKING_USERNAME;

  // Check for placeholder/missing credentials
  if (!apiKey || apiKey.includes('replace_with') || !username || username.includes('your_')) {
    throw new Error(
      'Africa\'s Talking credentials not properly configured. ' +
      'Please set AFRICAS_TALKING_API_KEY and AFRICAS_TALKING_USERNAME in .env file.'
    );
  }

  try {
    atClient = africastalking({
      apiKey: apiKey,
      username: username,
    });

    // Get SMS client
    sms = atClient.SMS;
    if (!sms) {
      throw new Error('SMS client failed to initialize');
    }

    // Get Email client - note: email might have different behavior in sandbox
    email = atClient.EMAIL;
    if (!email) {
      console.warn('⚠️ Email client not initialized. Africa\'s Talking email may not be available in sandbox.');
      console.warn('    Make sure your account has email capability enabled.');
    }

    console.log('✓ Africa\'s Talking client initialized successfully');
    console.log(`  - SMS: Available`);
    console.log(`  - Email: ${email ? 'Available' : 'Not Available (may require premium account)'}`);
  } catch (error) {
    throw new Error(`Failed to initialize Africa's Talking: ${error.message}`);
  }
}

/**
 * Normalize and validate phone number to international format with + prefix
 * @private
 * @param {string} phone - Phone number in any format
 * @returns {string|null} Normalized phone with + prefix or null if invalid
 */
function normalizePhoneForAT(phone) {
  if (!phone) return null;
  
  const digits = String(phone).replace(/\D/g, '');
  let normalized = null;
  
  // Already international format with country code
  if (digits.startsWith('254') && digits.length === 12) {
    normalized = digits;
  }
  // Kenya local format 07XX (10 digits)
  else if (digits.startsWith('0') && digits.length === 10) {
    normalized = '254' + digits.slice(1);
  }
  // Kenya local format 7XX (9 digits)
  else if (digits.startsWith('7') && digits.length === 9) {
    normalized = '254' + digits;
  }
  // Kenya local format 1XX (9 digits for landlines)
  else if (digits.startsWith('1') && digits.length === 9) {
    normalized = '254' + digits;
  }
  
  if (!normalized) {
    console.warn(`⚠️ Phone number format not recognized: ${phone} (normalized: ${digits})`);
    return null;
  }
  
  // Add + prefix for international format
  return '+' + normalized;
}

/**
 * Send SMS notification
 * @param {string} phoneNumber - Recipient phone number (can be in any format)
 * @param {string} message - Message content
 * @returns {Promise<{success: boolean, error?: string, response?: any}>}
 */
async function sendSMS(phoneNumber, message) {
  let normalizedPhone = null;
  
  try {
    initializeClient();

    // Normalize phone to international format with + prefix
    normalizedPhone = normalizePhoneForAT(phoneNumber);
    if (!normalizedPhone) {
      throw new Error(`Invalid phone number format: ${phoneNumber}. Expected format: 07XXXXXXXXX or +254712345678`);
    }

    const response = await sms.send({
      to: [normalizedPhone],
      message: message,
     // from: process.env.AFRICAS_TALKING_SENDER_ID || 'NYATHIRA',
    });

    // Log full response for debugging
    console.log(`[SMS Response Debug] Status: ${JSON.stringify(response)}`);

    // Check if SMS was sent successfully
    // Africa's Talking returns statusCode 0 or 101 for success
    const statusCode = response.SMSMessageData?.Recipients?.[0]?.statusCode;
    const statusMsg = response.SMSMessageData?.Recipients?.[0]?.status;
    const recipientData = response.SMSMessageData?.Recipients?.[0];

    // Success status codes: 0 (queued) or 101 (sent)
    if (statusCode === 0 || statusCode === '0' || statusCode === 101 || statusCode === '101') {
      console.log(`✓ SMS sent to ${normalizedPhone}`);
      return {
        success: true,
        response: response,
      };
    }

    // Handle failures with better error messages
    if (response.SMSMessageData?.Recipients?.[0]) {
      throw new Error(`SMS failed: [${statusCode}] ${statusMsg}. Recipient: ${JSON.stringify(recipientData)}`);
    }

    // If recipients array is empty or malformed
    if (!response.SMSMessageData?.Recipients || response.SMSMessageData.Recipients.length === 0) {
      throw new Error(`SMS API returned empty recipients list. Full response: ${JSON.stringify(response)}`);
    }

    throw new Error(`SMS send failed: ${JSON.stringify(response)}`);
  } catch (error) {
    const displayPhone = normalizedPhone || phoneNumber || 'unknown';
    console.error(`✗ SMS send failed to ${displayPhone}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send Email notification
 * @param {string} toEmail - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - Email body (HTML)
 * @returns {Promise<{success: boolean, error?: string, response?: any}>}
 */
async function sendEmail(toEmail, subject, htmlBody) {
  try {
    initializeClient();

    // Check if email service is available
    if (!email) {
      throw new Error(
        'Email service not available. This feature requires a premium Africa\'s Talking account. ' +
        'SMS-only mode is active.'
      );
    }

    if (!toEmail || !toEmail.includes('@')) {
      throw new Error(`Invalid email address: ${toEmail}`);
    }

    const response = await email.send({
      to: [toEmail],
      subject: subject,
      htmlBody: htmlBody,
      from: process.env.BOOKING_NOREPLY_EMAIL || 'noreply@nyathira.examples',
    });

    // Check if email was sent successfully
    if (response?.Status === 'Sent' || response?.Entries?.length > 0) {
      console.log(`✓ Email sent to ${toEmail}`);
      return {
        success: true,
        response: response,
      };
    }

    throw new Error('Email send returned unexpected response');
  } catch (error) {
    console.error(`✗ Email send failed to ${toEmail}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send combined booking + payment confirmation SMS (triggered when payment is confirmed)
 * @param {string} phoneNumber - Guest phone number
 * @param {object} bookingData - Booking details including payment info
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendBookingWithPaymentConfirmationSMS(phoneNumber, bookingData) {
  const { ref, guestName, mpesaReceiptNumber, amount, checkin, checkout, nights } = bookingData;
  const message = `Hi ${guestName},your booking has been confirmed! Ref: ${ref}. Amount: KES ${amount}. M-Pesa Receipt: ${mpesaReceiptNumber}.Your Check-in date is : ${checkin} and Check-out on: ${checkout} for a total of (${nights} nights). Thank you for staying with us!`;
  return sendSMS(phoneNumber, message);
}

/**
 * Send combined booking + payment confirmation email (triggered when payment is confirmed)
 * @param {string} email - Guest email
 * @param {object} bookingData - Complete booking details including M-Pesa receipt
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendBookingWithPaymentConfirmationEmail(toEmail, bookingData) {
  const {
    ref,
    guestName,
    mpesaReceiptNumber,
    amount,
    checkin,
    checkout,
    property,
    transactionDate,
    nights,
  } = bookingData;

  const htmlBody = `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2>Booking Confirmed ✓</h2>
        <p>Dear ${guestName},</p>
        <p>Your booking is now confirmed! Your payment has been received successfully.</p>
        
        <h3 style="border-bottom: 2px solid #4caf50; padding-bottom: 10px; color: #4caf50;">Booking Details</h3>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin: 20px 0;">
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px; font-weight: bold;">Booking Reference:</td>
            <td style="padding: 10px; color: #4caf50; font-weight: bold;">${ref}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px; font-weight: bold;">Property:</td>
            <td style="padding: 10px;">${property}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px; font-weight: bold;">Check-in:</td>
            <td style="padding: 10px;">${checkin}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px; font-weight: bold;">Check-out:</td>
            <td style="padding: 10px;">${checkout}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px; font-weight: bold;">Number of Nights:</td>
            <td style="padding: 10px;">${nights}</td>
          </tr>
        </table>

        <h3 style="border-bottom: 2px solid #2196F3; padding-bottom: 10px; color: #2196F3;">Payment Confirmation</h3>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px; margin: 20px 0; background-color: #e3f2fd; border: 1px solid #2196F3;">
          <tr style="border-bottom: 1px solid #2196F3;">
            <td style="padding: 10px; font-weight: bold;">Amount Paid (KES):</td>
            <td style="padding: 10px; font-weight: bold; color: #2196F3;">${amount}</td>
          </tr>
          <tr style="border-bottom: 1px solid #2196F3;">
            <td style="padding: 10px; font-weight: bold;">M-Pesa Receipt:</td>
            <td style="padding: 10px; font-family: monospace;">${mpesaReceiptNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold;">Transaction Date:</td>
            <td style="padding: 10px;">${transactionDate}</td>
          </tr>
        </table>

        <p style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #4caf50;">
          <strong>✓ Your booking is confirmed and paid.</strong> We look forward to welcoming you to ${property}!
        </p>
        
        <p>If you have any questions or need to make changes, please contact us immediately.</p>
        <p>Best regards,<br/>Nyathira Homes Team</p>
      </body>
    </html>
  `;

  return sendEmail(toEmail, `Booking Confirmed - ${ref}`, htmlBody);
}

module.exports = {
  sendSMS,
  sendEmail,
  sendBookingWithPaymentConfirmationSMS,
  sendBookingWithPaymentConfirmationEmail,
};
