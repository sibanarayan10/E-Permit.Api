/**
 * SMS Service - Twilio Integration for E-PTW System
 * Simple SMS Notifications with Single Dynamic Template
 * 
 * Features:
 * - ENUM-based SMS events
 * - Single dynamic message template
 * - Admin-controlled global toggle
 * - Phone validation & masking in logs
 * - Non-blocking API responses
 * - Retry handling for failed SMS
 * - Comprehensive logging
 */

const Settings = require("../models/Settings");
const logger = require("../utils/logger");

// ============================================
// SMS EVENT TYPES (ENUM-based)
// ============================================
const SMS_EVENTS = {
    PERMIT_CREATED: "PERMIT_CREATED",
    PERMIT_ASSIGNED_TO_EXECUTOR: "PERMIT_ASSIGNED_TO_EXECUTOR",
    EXECUTOR_APPROVED: "EXECUTOR_APPROVED",
    PERMIT_ASSIGNED_TO_ISSUER: "PERMIT_ASSIGNED_TO_ISSUER",
    ISSUER_APPROVED: "ISSUER_APPROVED",
    PERMIT_RETURNED: "PERMIT_RETURNED",
    PERMIT_CLOSED: "PERMIT_CLOSED",
    PERMIT_CANCELLED: "PERMIT_CANCELLED",
    RENEWAL_REQUESTED: "RENEWAL_REQUESTED",
    RENEWAL_APPROVED: "RENEWAL_APPROVED",
    CLOSURE_INITIATED: "CLOSURE_INITIATED",
    EXECUTOR_CLOSURE_APPROVED: "EXECUTOR_CLOSURE_APPROVED",
};

// ============================================
// EVENT-SPECIFIC MESSAGES (Single Template Pattern)
// Placeholders: {PermitNo}, {Initiator}, {Executor}, {Issuer}, {ReturnedBy}
// ============================================
const EVENT_MESSAGES = {
    [SMS_EVENTS.PERMIT_CREATED]:
        "Permit {PermitNo} has been created successfully. Please submit it for executor approval.",

    [SMS_EVENTS.PERMIT_ASSIGNED_TO_EXECUTOR]:
        "Permit {PermitNo} created by {Initiator} is pending your approval.",

    [SMS_EVENTS.EXECUTOR_APPROVED]:
        "Permit {PermitNo} approved by {Executor}. Awaiting issuer approval.",

    [SMS_EVENTS.PERMIT_ASSIGNED_TO_ISSUER]:
        "Permit {PermitNo} created by {Initiator} and approved by {Executor} is pending your approval.",

    [SMS_EVENTS.ISSUER_APPROVED]:
        "Permit {PermitNo} approved by {Issuer}. You may proceed with the work.",

    [SMS_EVENTS.PERMIT_RETURNED]:
        "Permit {PermitNo} has been returned by {ReturnedBy}. Please review and resubmit.",

    [SMS_EVENTS.PERMIT_CLOSED]:
        "Permit {PermitNo} has been closed by {Issuer}.",

    [SMS_EVENTS.PERMIT_CANCELLED]:
        "Permit {PermitNo} has been cancelled.",

    [SMS_EVENTS.RENEWAL_REQUESTED]:
        "Renewal request for Permit {PermitNo} by {Initiator} is pending your approval.",

    [SMS_EVENTS.RENEWAL_APPROVED]:
        "Permit {PermitNo} has been renewed and approved by {Issuer}.",

    [SMS_EVENTS.CLOSURE_INITIATED]:
        "Closure request for Permit {PermitNo} by {Initiator} is pending your approval.",

    [SMS_EVENTS.EXECUTOR_CLOSURE_APPROVED]:
        "Permit {PermitNo} closure approved by {Executor}. Awaiting issuer approval."
};


// ============================================
// TWILIO CONFIGURATION
// ============================================
// Read environment variables dynamically (not at module load time)
const getTwilioConfig = () => ({
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    fromNumber: process.env.TWILIO_PHONE_NUMBER || "",
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || "",
});

// Twilio client (lazy initialization)
let twilioClient = null;

const getTwilioClient = () => {
    const config = getTwilioConfig();
    if (!twilioClient) {
        if (!config.accountSid || !config.authToken) {
            logger.warn("Twilio not configured. SMS sending is disabled.");
            return null;
        }
        try {
            const twilio = require("twilio");
            twilioClient = twilio(config.accountSid, config.authToken);
        } catch (error) {
            logger.error("Failed to initialize Twilio client:", error.message);
            return null;
        }
    }
    return twilioClient;
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Mask phone number for logging (show only last 4 digits)
 * @param {string} phone - Phone number
 * @returns {string} - Masked phone number
 */
const maskPhoneNumber = (phone) => {
    if (!phone || phone.length < 4) return "****";
    return "*".repeat(phone.length - 4) + phone.slice(-4);
};

/**
 * Validate phone number (basic validation)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid
 */
const validatePhoneNumber = (phone) => {
    if (!phone) return false;

    // Remove all non-digit characters except +
    const cleanPhone = phone.replace(/[^\d+]/g, "");

    // Must have at least 10 digits
    const digitsOnly = cleanPhone.replace(/\D/g, "");
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
};

/**
 * Format phone number to E.164 format for Twilio
 * @param {string} phone - Phone number
 * @param {string} defaultCountryCode - Default country code (default: +91 for India)
 * @returns {string} - Formatted phone number in E.164 format
 */
const formatPhoneNumber = (phone, defaultCountryCode = "+91") => {
    if (!phone) return "";

    // Remove all non-digit characters except +
    let cleanPhone = phone.replace(/[^\d+]/g, "");

    // If already starts with +, return as is
    if (cleanPhone.startsWith("+")) {
        return cleanPhone;
    }

    // Remove leading zeros
    cleanPhone = cleanPhone.replace(/^0+/, "");

    // If 10 digits, add default country code
    if (cleanPhone.length === 10) {
        return `${defaultCountryCode}${cleanPhone}`;
    }

    // If 12 digits starting with country code (e.g., 91), add +
    if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
        return `+${cleanPhone}`;
    }

    // Default: add country code
    return `${defaultCountryCode}${cleanPhone}`;
};

/**
 * Replace placeholders in message template
 * @param {string} template - Message template
 * @param {object} data - Data for placeholders
 * @returns {string} - Message with placeholders replaced
 */
const replacePlaceholders = (template, data) => {
    if (!template || !data) return template;

    let message = template;
    Object.keys(data).forEach(key => {
        const regex = new RegExp(`\\{${key}\\}`, "g");
        message = message.replace(regex, data[key] || "");
    });
    return message;
};

/**
 * Build the complete SMS message with greeting and signature
 * @param {string} eventType - Event type
 * @param {object} data - Data for placeholders (Name, PermitNo, etc.)
 * @returns {string} - Complete formatted message
 */
const buildMessage = (eventType, data) => {
    const eventMessage = EVENT_MESSAGES[eventType];
    if (!eventMessage) {
        logger.warn(`Unknown SMS event type: ${eventType}`);
        return null;
    }

    const messageBody = replacePlaceholders(eventMessage, data);

    // Single template format: Greeting + Message + Signature
    return `Dear ${data.Name || "User"}, ${messageBody} - E-Permit System`;
};

// ============================================
// CHECK IF SMS IS ENABLED
// ============================================

/**
 * Check if SMS notifications are globally enabled
 * @returns {Promise<boolean>}
 */
const isSmsEnabled = async () => {
    try {
        const settings = await Settings.getSettings();
        return settings.smsNotificationsEnabled === true;
    } catch (error) {
        logger.error("Error checking SMS settings:", error);
        return false; // Default to disabled if error
    }
};

/**
 * Check if Twilio is properly configured
 * @returns {boolean}
 */
const isTwilioConfigured = () => {
    const config = getTwilioConfig();
    if (!config.accountSid || !config.authToken) {
        return false;
    }
    if (!config.fromNumber && !config.messagingServiceSid) {
        logger.warn("Twilio phone number or messaging service SID not configured.");
        return false;
    }
    return true;
};

// ============================================
// SMS SENDING LOGIC
// ============================================

/**
 * Send SMS via Twilio API
 * @param {string} toNumber - Recipient phone number (E.164 format)
 * @param {string} message - Message content
 * @param {number} retryCount - Current retry count
 * @returns {Promise<object>} - Send result
 */
const sendViaTwilio = async (toNumber, message, retryCount = 0) => {
    const MAX_RETRIES = 2;

    try {
        const client = getTwilioClient();
        if (!client) {
            return { success: false, error: "Twilio client not initialized" };
        }

        // Build message options
        const config = getTwilioConfig();
        const messageOptions = {
            body: message,
            to: toNumber,
        };

        // Use Messaging Service SID if available, otherwise use phone number
        if (config.messagingServiceSid) {
            messageOptions.messagingServiceSid = config.messagingServiceSid;
        } else {
            messageOptions.from = config.fromNumber;
        }

        // Send SMS
        const result = await client.messages.create(messageOptions);

        return {
            success: true,
            messageSid: result.sid,
            status: result.status,
        };

    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            logger.warn(`SMS send failed, retrying (${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return sendViaTwilio(toNumber, message, retryCount + 1);
        }

        return {
            success: false,
            error: error.message,
            code: error.code,
        };
    }
};

// ============================================
// MAIN SMS SEND FUNCTION
// ============================================

/**
 * Send SMS notification (non-blocking)
 * This is the main function to be called from controllers
 * 
 * @param {string} eventType - SMS event type (from SMS_EVENTS enum)
 * @param {string} phoneNumber - Recipient phone number
 * @param {object} data - Data for placeholder replacement
 *   - Name: Recipient name
 *   - PermitNo: Permit number
 */
const sendSms = async (eventType, phoneNumber, data = {}) => {
    const maskedPhone = maskPhoneNumber(phoneNumber);
    const startTime = Date.now();

    try {
        // 1. Check if SMS notifications are enabled
        const smsEnabled = await isSmsEnabled();
        if (!smsEnabled) {
            logger.info(`[SMS] Skipped (notifications disabled): ${eventType} to ${maskedPhone}`);
            return;
        }

        // 2. Check if Twilio is configured
        if (!isTwilioConfigured()) {
            logger.info(`[SMS] Skipped (Twilio not configured): ${eventType} to ${maskedPhone}`);
            return;
        }

        // 3. Validate phone number
        if (!validatePhoneNumber(phoneNumber)) {
            logger.warn(`[SMS] Invalid phone number for ${eventType}: ${maskedPhone}`);
            return;
        }

        // 4. Build message
        const message = buildMessage(eventType, data);
        if (!message) {
            logger.warn(`[SMS] Failed to build message for event: ${eventType}`);
            return;
        }

        // 5. Format phone to E.164
        const formattedPhone = formatPhoneNumber(phoneNumber);

        logger.info(`[SMS] Sending ${eventType} to ${maskedPhone}`);

        // 6. Send SMS (fire-and-forget pattern)
        sendViaTwilio(formattedPhone, message)
            .then(result => {
                const duration = Date.now() - startTime;
                if (result.success) {
                    logger.info(
                        `[SMS] ✅ Sent: ${eventType} to ${maskedPhone} ` +
                        `(SID: ${result.messageSid}, Status: ${result.status}, Duration: ${duration}ms)`
                    );
                } else {
                    logger.error(
                        `[SMS] ❌ Failed: ${eventType} to ${maskedPhone} ` +
                        `(Error: ${result.error}, Code: ${result.code}, Duration: ${duration}ms)`
                    );
                }
            })
            .catch(err => {
                logger.error(`[SMS] ❌ Exception: ${eventType} to ${maskedPhone} - ${err.message}`);
            });

    } catch (error) {
        logger.error(`[SMS] Service error for ${eventType}: ${error.message}`);
        // Never throw - permit flow must continue
    }
};

/**
 * Send SMS to multiple recipients
 * 
 * @param {string} eventType - SMS event type
 * @param {Array<{phone: string, name: string}>} recipients - Array of recipients
 * @param {object} baseData - Base data for placeholders (PermitNo, etc.)
 */
const sendSmsToMany = async (eventType, recipients, baseData = {}) => {
    if (!Array.isArray(recipients) || recipients.length === 0) return;

    recipients.forEach(recipient => {
        if (recipient.phone) {
            sendSms(eventType, recipient.phone, {
                ...baseData,
                Name: recipient.name || "User"
            });
        }
    });
};

// ============================================
// HELPER: BUILD PERMIT SMS DATA
// ============================================

/**
 * Build common permit data for SMS placeholders
 * @param {object} permit - Permit document
 * @param {object} additionalData - Extra data to merge
 * @returns {object} - Data object for placeholder replacement
 */
const buildPermitSmsData = (permit, additionalData = {}) => {
    return {
        PermitNo: permit.permitNumber || "",
        ProtocolNo: permit.protocolNumber || "",
        ...additionalData
    };
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Main functions
    sendSms,
    sendSmsToMany,
    buildPermitSmsData,

    // Event types (ENUM)
    SMS_EVENTS,

    // Utilities (for testing/debugging)
    validatePhoneNumber,
    maskPhoneNumber,
    formatPhoneNumber,
    isSmsEnabled,
};
