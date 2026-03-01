const nodemailer = require("nodemailer");
const EmailTemplate = require("../models/EmailTemplate");
const Settings = require("../models/Settings");
const logger = require("../utils/logger");

/**
 * Email Service - Handles all email sending operations
 * Uses Nodemailer with manual SMTP configuration
 * All operations are fire-and-forget to not block permit flow
 */

// Check if email notifications are globally enabled
const isEmailEnabled = async () => {
    try {
        const settings = await Settings.getSettings();
        return settings.emailNotificationsEnabled;
    } catch (error) {
        logger.error("Error checking email settings:", error);
        return true; // Default to enabled if error
    }
};

// Create reusable transporter
let transporter = null;

const getTransporter = () => {
    if (!transporter) {
        // Check if SMTP is configured
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
            logger.warn("SMTP not configured. Email sending is disabled.");
            return null;
        }

        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            },
            // Connection timeout settings
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
        });
    }
    return transporter;
};

/**
 * Replace placeholders in text with actual values
 * @param {string} text - Text containing {{placeholder}} patterns
 * @param {object} data - Key-value pairs for replacement
 * @returns {string} - Text with placeholders replaced
 */
const replacePlaceholders = (text, data) => {
    if (!text || !data) return text;

    let result = text;
    Object.keys(data).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, "g");
        result = result.replace(regex, data[key] || "");
    });
    return result;
};

/**
 * Send email using a template
 * This is a fire-and-forget operation - failures are logged but not thrown
 * 
 * @param {number} templateNo - Template number to use
 * @param {string} recipientEmail - Email address of recipient
 * @param {object} data - Data for placeholder replacement
 * @param {string} [recipientName] - Optional name for display
 */
const sendTemplateEmail = async (templateNo, recipientEmail, data = {}, recipientName = null) => {
    try {
        // Check if email notifications are globally enabled
        const emailEnabled = await isEmailEnabled();
        if (!emailEnabled) {
            logger.info(`Email skipped (notifications disabled): Template ${templateNo} to ${recipientEmail}`);
            return;
        }

        logger.info(`Email trigger: Template ${templateNo} to ${recipientEmail}`);

        const transport = getTransporter();
        if (!transport) {
            logger.info(`Email skipped (SMTP not configured): Template ${templateNo} to ${recipientEmail}`);
            return;
        }

        // Fetch template
        const template = await EmailTemplate.findOne({ templateNo, isActive: true });
        if (!template) {
            logger.warn(`Email template ${templateNo} not found or inactive`);
            return;
        }

        logger.info(`Template found: "${template.title}" - sending to ${recipientEmail}`);

        // Replace placeholders in subject and body
        const subject = replacePlaceholders(template.subject, data);
        const htmlBody = replacePlaceholders(template.body, data);

        // Build email options
        const mailOptions = {
            from: `"${process.env.EMAIL_FROM_NAME || "E-PTW System"}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
            to: recipientName ? `"${recipientName}" <${recipientEmail}>` : recipientEmail,
            subject: subject,
            html: htmlBody,
            // Plain text fallback
            text: htmlBody.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
        };

        // Send email asynchronously (fire-and-forget)
        transport.sendMail(mailOptions)
            .then(info => {
                logger.info(`✅ Email sent successfully: Template ${templateNo} to ${recipientEmail} (${info.messageId})`);
            })
            .catch(error => {
                logger.error(`❌ Email sending failed: Template ${templateNo} to ${recipientEmail} - ${error.message}`);
            });

    } catch (error) {
        logger.error(`Email service error: Template ${templateNo} - ${error.message}`);
        // Never throw - permit flow must continue
    }
};

/**
 * Send email with PDF attachment using a template
 * 
 * @param {number} templateNo - Template number to use
 * @param {string} recipientEmail - Email address of recipient
 * @param {object} data - Data for placeholder replacement
 * @param {string} recipientName - Name for display
 * @param {Buffer|string} pdfBuffer - PDF file as Buffer or base64 string
 * @param {string} pdfFilename - Filename for the attachment
 */
const sendTemplateEmailWithAttachment = async (templateNo, recipientEmail, data = {}, recipientName = null, pdfBuffer = null, pdfFilename = "permit.pdf") => {
    try {
        // Check if email notifications are globally enabled
        const emailEnabled = await isEmailEnabled();
        if (!emailEnabled) {
            logger.info(`Email with attachment skipped (notifications disabled): Template ${templateNo} to ${recipientEmail}`);
            return { success: false, message: "Email notifications are disabled" };
        }

        logger.info(`Email with attachment trigger: Template ${templateNo} to ${recipientEmail}`);

        const transport = getTransporter();
        if (!transport) {
            logger.info(`Email skipped (SMTP not configured): Template ${templateNo} to ${recipientEmail}`);
            return { success: false, message: "SMTP not configured" };
        }

        // Fetch template
        const template = await EmailTemplate.findOne({ templateNo, isActive: true });
        if (!template) {
            logger.warn(`Email template ${templateNo} not found or inactive`);
            return { success: false, message: "Template not found" };
        }

        logger.info(`Template found: "${template.title}" - sending with attachment to ${recipientEmail}`);

        // Replace placeholders in subject and body
        const subject = replacePlaceholders(template.subject, data);
        const htmlBody = replacePlaceholders(template.body, data);

        // Build email options with attachment
        const mailOptions = {
            from: `"${process.env.EMAIL_FROM_NAME || "E-PTW System"}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
            to: recipientName ? `"${recipientName}" <${recipientEmail}>` : recipientEmail,
            subject: subject,
            html: htmlBody,
            text: htmlBody.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
        };

        // Add attachment if provided
        if (pdfBuffer) {
            // Handle base64 string or Buffer
            let content = pdfBuffer;
            if (typeof pdfBuffer === "string") {
                // Remove data URL prefix if present
                const base64Data = pdfBuffer.replace(/^data:application\/pdf;base64,/, "");
                content = Buffer.from(base64Data, "base64");
            }

            mailOptions.attachments = [{
                filename: pdfFilename,
                content: content,
                contentType: "application/pdf"
            }];
        }

        // Send email and wait for result
        const info = await transport.sendMail(mailOptions);
        logger.info(`✅ Email with attachment sent successfully: Template ${templateNo} to ${recipientEmail} (${info.messageId})`);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        logger.error(`❌ Email with attachment failed: Template ${templateNo} to ${recipientEmail} - ${error.message}`);
        return { success: false, message: error.message };
    }
};

/**
 * Send email to multiple recipients using a template
 * 
 * @param {number} templateNo - Template number to use
 * @param {Array<{email: string, name?: string}>} recipients - Array of recipient objects
 * @param {object} data - Data for placeholder replacement
 */
const sendTemplateEmailToMany = async (templateNo, recipients, data = {}) => {
    if (!Array.isArray(recipients) || recipients.length === 0) return;

    recipients.forEach(recipient => {
        sendTemplateEmail(templateNo, recipient.email, data, recipient.name);
    });
};

/**
 * Predefined template numbers for permit events
 * These should match templates created by admin
 */
const EMAIL_TEMPLATES = {
    PERMIT_CREATED: 1,
    PERMIT_ASSIGNED_TO_EXECUTOR: 2,
    PERMIT_ASSIGNED_TO_ISSUER: 3,
    EXECUTOR_APPROVED: 4,
    ISSUER_APPROVED: 5,
    PERMIT_CANCELLED: 6,
    RENEWAL_REQUESTED: 7,
    RENEWAL_EXECUTOR_APPROVED: 8,
    RENEWAL_APPROVED: 9,
    CLOSURE_INITIATED: 10,
    CLOSURE_EXECUTOR_APPROVED: 11,
    PERMIT_CLOSED: 12
};

/**
 * Helper to build common permit data for email placeholders
 * @param {object} permit - Permit document
 * @param {object} additionalData - Extra data to merge
 * @returns {object} - Data object for placeholder replacement
 */
const buildPermitEmailData = (permit, additionalData = {}) => {
    return {
        permitNo: permit.permitNumber || "",
        protocolNo: permit.protocolNumber || "",
        srNo: permit.srNo || "",
        job: permit.initiator?.briefDescriptionOfWork || "",
        location: permit.initiator?.equipmentLocation?.location || "",
        subLocation: permit.initiator?.equipmentLocation?.subLocation || "",
        validFrom: permit.initiator?.periodOfWork?.from?.date ?
            new Date(permit.initiator.periodOfWork.from.date).toLocaleDateString() : "",
        validTo: permit.initiator?.periodOfWork?.to?.date ?
            new Date(permit.initiator.periodOfWork.to.date).toLocaleDateString() : "",
        currentStage: permit.currentStage || "",
        status: permit.permitStatus || "",
        ...additionalData
    };
};

module.exports = {
    sendTemplateEmail,
    sendTemplateEmailWithAttachment,
    sendTemplateEmailToMany,
    replacePlaceholders,
    buildPermitEmailData,
    EMAIL_TEMPLATES
};
