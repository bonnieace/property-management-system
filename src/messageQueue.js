/**
 * Message Queue with Retry Logic
 * Handles retrying failed SMS and Email sends with exponential backoff
 */

const messagingService = require('./africastalkingService');

// In-memory queue for messages awaiting retry
const messageQueue = [];
let queueProcessing = false;

/**
 * Message queue entry structure
 * @typedef {object} QueuedMessage
 * @property {string} id - Unique message ID
 * @property {string} type - 'sms' or 'email'
 * @property {string} recipient - Phone or email
 * @property {string} messageType - 'booking_confirmation' | 'payment_receipt'
 * @property {object} data - Message content/booking data
 * @property {number} attempts - Current attempt count (starts at 0)
 * @property {number} maxAttempts - Maximum retry attempts (default: 3)
 * @property {number} nextRetryTime - Timestamp for next retry
 * @property {string} lastError - Error message from last attempt
 * @property {Date} createdAt - When message was queued
 */

/**
 * Exponential backoff calculation
 * @param {number} attemptNumber - 0-based attempt number
 * @returns {number} Delay in milliseconds
 */
function getBackoffDelay(attemptNumber) {
  const delays = [
    5 * 1000,      // 1st retry: 5 seconds
    30 * 1000,     // 2nd retry: 30 seconds
    2 * 60 * 1000, // 3rd retry: 2 minutes
  ];
  return delays[attemptNumber] || delays[delays.length - 1];
}

/**
 * Check if an error is retriable (temporary) or permanent
 * @private
 * @param {string} errorMessage - Error message to check
 * @returns {boolean} true if the error should be retried, false if it's permanent
 */
function isRetriableError(errorMessage) {
  const nonRetriablePatterns = [
    'Email service not available',
    'premium Africa\'s Talking account',
    'SMS-only mode',
    'Invalid phone number format',
    'Invalid email address',
  ];

  return !nonRetriablePatterns.some((pattern) => errorMessage.includes(pattern));
}

/**
 * Queue a message for processing
 * @param {string} type - 'sms' or 'email'
 * @param {string} recipient - Phone or email
 * @param {string} messageType - Type of notification
 * @param {object} data - Message data
 * @returns {string} Message queue ID
 */
function queueMessage(type, recipient, messageType, data) {
  const messageId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const queuedMessage = {
    id: messageId,
    type,
    recipient,
    messageType,
    data,
    attempts: 0,
    maxAttempts: 3,
    nextRetryTime: Date.now(),
    lastError: null,
    createdAt: new Date(),
  };

  messageQueue.push(queuedMessage);
  console.log(`📬 Message queued: ${messageId} (${type} to ${recipient})`);

  // Trigger processing if not already running
  if (!queueProcessing) {
    processQueue();
  }

  return messageId;
}

/**
 * Send SMS message
 * @private
 * @param {object} queuedMessage - Message object from queue
 * @returns {Promise<boolean>} true if successful
 */
async function sendQueuedSMS(queuedMessage) {
  const result = await messagingService.sendSMS(
    queuedMessage.recipient,
    queuedMessage.data.message
  );

  if (result.success) {
    queuedMessage.lastError = null;
    return true;
  }

  queuedMessage.lastError = result.error;
  return false;
}

/**
 * Send Email message
 * @private
 * @param {object} queuedMessage - Message object from queue
 * @returns {Promise<boolean>} true if successful
 */
async function sendQueuedEmail(queuedMessage) {
  const result = await messagingService.sendEmail(
    queuedMessage.recipient,
    queuedMessage.data.subject,
    queuedMessage.data.htmlBody
  );

  if (result.success) {
    queuedMessage.lastError = null;
    return true;
  }

  queuedMessage.lastError = result.error;
  return false;
}

/**
 * Send high-level notification message
 * @private
 * @param {object} queuedMessage - Message object from queue
 * @returns {Promise<boolean>} true if successful
 */
async function sendNotificationMessage(queuedMessage) {
  const { type, recipient, messageType, data } = queuedMessage;

  try {
    if (type === 'sms') {
      let result;

      if (messageType === 'booking_with_payment_confirmation') {
        result = await messagingService.sendBookingWithPaymentConfirmationSMS(recipient, data);
      } else {
        throw new Error(`Unknown SMS message type: ${messageType}`);
      }

      if (result.success) {
        queuedMessage.lastError = null;
        return true;
      }

      queuedMessage.lastError = result.error;
      return false;
    } else if (type === 'email') {
      let result;

      if (messageType === 'booking_with_payment_confirmation') {
        result = await messagingService.sendBookingWithPaymentConfirmationEmail(recipient, data);
      } else {
        throw new Error(`Unknown email message type: ${messageType}`);
      }

      if (result.success) {
        queuedMessage.lastError = null;
        return true;
      }

      queuedMessage.lastError = result.error;
      return false;
    }

    throw new Error(`Unknown message type: ${type}`);
  } catch (error) {
    queuedMessage.lastError = error.message;
    return false;
  }
}

/**
 * Process queue: attempt to send all pending messages
 */
async function processQueue() {
  if (queueProcessing) return;
  queueProcessing = true;

  while (messageQueue.length > 0) {
    const now = Date.now();
    const readyMessages = messageQueue.filter((msg) => msg.nextRetryTime <= now);

    if (readyMessages.length === 0) {
      // No messages ready yet, wait before next check
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    // Process one message at a time to avoid overwhelming the API
    const message = readyMessages[0];

    try {
      console.log(`📤 Sending ${message.type} (attempt ${message.attempts + 1}/${message.maxAttempts}): ${message.id}`);

      const success = await sendNotificationMessage(message);

      if (success) {
        // Message sent successfully, remove from queue
        messageQueue.splice(messageQueue.indexOf(message), 1);
        console.log(`✅ Message sent successfully: ${message.id}`);
      } else {
        // Send failed, check if error is retriable
        message.attempts += 1;

        const isRetriable = isRetriableError(message.lastError);

        if (isRetriable && message.attempts < message.maxAttempts) {
          // Temporary error, schedule retry
          const backoffDelay = getBackoffDelay(message.attempts);
          message.nextRetryTime = now + backoffDelay;
          console.log(
            `❌ Send failed (will retry in ${Math.round(backoffDelay / 1000)}s): ${message.id} - ${message.lastError}`
          );
        } else if (!isRetriable) {
          // Permanent error, don't retry
          messageQueue.splice(messageQueue.indexOf(message), 1);
          console.error(
            `🚫 Permanent error - message will not retry: ${message.id} - ${message.lastError}`
          );
        } else {
          // Max attempts reached, remove from queue and log error
          messageQueue.splice(messageQueue.indexOf(message), 1);
          console.error(
            `🚫 Message failed after ${message.maxAttempts} attempts and will not retry: ${message.id} - ${message.lastError}`
          );
        }
      }
    } catch (error) {
      console.error(`⚠️ Unexpected error processing message ${message.id}:`, error);
      message.attempts += 1;
      message.lastError = error.message;

      const isRetriable = isRetriableError(message.lastError);

      if (isRetriable && message.attempts < message.maxAttempts) {
        const backoffDelay = getBackoffDelay(message.attempts);
        message.nextRetryTime = now + backoffDelay;
      } else if (!isRetriable) {
        // Permanent error, don't retry
        messageQueue.splice(messageQueue.indexOf(message), 1);
      } else {
        // Max attempts reached
        messageQueue.splice(messageQueue.indexOf(message), 1);
      }
    }

    // Small delay between message attempts
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  queueProcessing = false;
}

/**
 * Queue booking with payment confirmation notifications (SMS + Email)
 * Only queued after payment is confirmed - sends all details in one message
 * @param {string} phoneNumber - Guest phone
 * @param {string} email - Guest email
 * @param {object} bookingData - Complete booking details including M-Pesa receipt
 * @returns {object} {smsMsgId, emailMsgId}
 */
function queueBookingWithPaymentConfirmationMessages(phoneNumber, email, bookingData) {
  const smsMsgId = queueMessage('sms', phoneNumber, 'booking_with_payment_confirmation', bookingData);
  const emailMsgId = queueMessage('email', email, 'booking_with_payment_confirmation', bookingData);

  return { smsMsgId, emailMsgId };
}

/**
 * Get queue status for debugging
 * @returns {object} Queue statistics
 */
function getQueueStatus() {
  return {
    totalQueued: messageQueue.length,
    processing: queueProcessing,
    messages: messageQueue.map((msg) => ({
      id: msg.id,
      type: msg.type,
      recipient: msg.recipient,
      messageType: msg.messageType,
      attempts: msg.attempts,
      maxAttempts: msg.maxAttempts,
      lastError: msg.lastError,
      nextRetryTime: new Date(msg.nextRetryTime),
    })),
  };
}

module.exports = {
  queueMessage,
  queueBookingWithPaymentConfirmationMessages,
  getQueueStatus,
  processQueue,
};
