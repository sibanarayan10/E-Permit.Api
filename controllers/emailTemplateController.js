const EmailTemplate = require("../models/EmailTemplate");
const logger = require("../utils/logger");
const { ROLES } = require("../config/constants");

/**
 * Create a new email template
 * Admin only
 */
exports.createTemplate = async (req, res) => {
    try {
        const { templateNo, title, subject, body, placeholders } = req.body;

        // Check if templateNo already exists
        const existingTemplate = await EmailTemplate.findOne({ templateNo });
        if (existingTemplate) {
            return res.status(400).json({
                success: false,
                message: `Template number ${templateNo} already exists. Template numbers are unique and immutable.`
            });
        }

        const template = await EmailTemplate.create({
            templateNo,
            title,
            subject,
            body,
            placeholders: placeholders || [],
            createdBy: req.user._id
        });

        logger.info(`Email template ${templateNo} created by ${req.user.email}`);

        return res.status(201).json({
            success: true,
            message: "Email template created successfully",
            data: template
        });
    } catch (error) {
        logger.error("Error creating email template:", error);

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: Object.values(error.errors).map(e => e.message)
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to create email template"
        });
    }
};

/**
 * Get all email templates
 * Admin only
 */
exports.getAllTemplates = async (req, res) => {
    try {
        const templates = await EmailTemplate.find()
            .populate("createdBy", "name email")
            .sort({ templateNo: 1 });

        return res.status(200).json({
            success: true,
            count: templates.length,
            data: templates
        });
    } catch (error) {
        logger.error("Error fetching email templates:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch email templates"
        });
    }
};

/**
 * Get a single email template by ID
 * Admin only
 */
exports.getTemplateById = async (req, res) => {
    try {
        const template = await EmailTemplate.findById(req.params.id)
            .populate("createdBy", "name email");

        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Email template not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: template
        });
    } catch (error) {
        logger.error("Error fetching email template:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch email template"
        });
    }
};

/**
 * Get template by templateNo (for internal use)
 */
exports.getTemplateByNo = async (req, res) => {
    try {
        const { templateNo } = req.params;

        const template = await EmailTemplate.findOne({ templateNo: parseInt(templateNo) });

        if (!template) {
            return res.status(404).json({
                success: false,
                message: `Email template ${templateNo} not found`
            });
        }

        return res.status(200).json({
            success: true,
            data: template
        });
    } catch (error) {
        logger.error("Error fetching email template by number:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch email template"
        });
    }
};

/**
 * Update an email template
 * Only title, subject, body, and placeholders can be updated
 * templateNo is immutable
 * Admin only
 */
exports.updateTemplate = async (req, res) => {
    try {
        const { title, subject, body, placeholders } = req.body;

        const template = await EmailTemplate.findById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Email template not found"
            });
        }

        // Update only allowed fields
        if (title !== undefined) template.title = title;
        if (subject !== undefined) template.subject = subject;
        if (body !== undefined) template.body = body;
        if (placeholders !== undefined) template.placeholders = placeholders;

        await template.save();

        logger.info(`Email template ${template.templateNo} updated by ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: "Email template updated successfully",
            data: template
        });
    } catch (error) {
        logger.error("Error updating email template:", error);

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: Object.values(error.errors).map(e => e.message)
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to update email template"
        });
    }
};

/**
 * Toggle template active status
 * Admin only
 */
exports.toggleTemplateStatus = async (req, res) => {
    try {
        const template = await EmailTemplate.findById(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Email template not found"
            });
        }

        template.isActive = !template.isActive;
        await template.save();

        logger.info(`Email template ${template.templateNo} ${template.isActive ? "activated" : "deactivated"} by ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: `Email template ${template.isActive ? "activated" : "deactivated"} successfully`,
            data: template
        });
    } catch (error) {
        logger.error("Error toggling email template status:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to toggle email template status"
        });
    }
};

/**
 * Delete an email template
 * Admin only
 */
exports.deleteTemplate = async (req, res) => {
    try {
        const template = await EmailTemplate.findByIdAndDelete(req.params.id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Email template not found"
            });
        }

        logger.info(`Email template ${template.templateNo} deleted by ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: "Email template deleted successfully"
        });
    } catch (error) {
        logger.error("Error deleting email template:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete email template"
        });
    }
};

// Get available placeholders
exports.getAvailablePlaceholders = async (req, res) => {
    try {
        const placeholders = [
            { name: "permitNo", description: "Permit number" },
            { name: "protocolNo", description: "Protocol number" },
            { name: "srNo", description: "SR number" },
            { name: "job", description: "Job/work description" },
            { name: "location", description: "Work location" },
            { name: "subLocation", description: "Sub-location" },
            { name: "validFrom", description: "Valid from date" },
            { name: "validTo", description: "Valid to date" },
            { name: "currentStage", description: "Current workflow stage" },
            { name: "status", description: "Permit status" },
            { name: "recipientName", description: "Email recipient name" },
            { name: "initiatorName", description: "Initiator's name" },
            { name: "executorName", description: "Executor's name" },
            { name: "issuerName", description: "Issuer's name" },
            { name: "assignedByName", description: "Name of person who assigned" },
            { name: "closedAt", description: "Closure date" }
        ];

        return res.status(200).json({
            success: true,
            data: placeholders
        });
    } catch (error) {
        logger.error("Error getting placeholders:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get placeholders"
        });
    }
};

// Send permit email with PDF attachment
exports.sendPermitEmailWithPDF = async (req, res) => {
    try {
        const { templateNo, recipientEmail, recipientName, permitData, pdfBase64, pdfFilename } = req.body;

        if (!templateNo || !recipientEmail || !pdfBase64) {
            return res.status(400).json({
                success: false,
                message: "templateNo, recipientEmail, and pdfBase64 are required"
            });
        }

        const { sendTemplateEmailWithAttachment, buildPermitEmailData } = require("../services/emailService");

        // Build email data from permit
        const emailData = permitData ? buildPermitEmailData(permitData, {
            recipientName: recipientName || "",
            ...permitData
        }) : { recipientName: recipientName || "" };

        const result = await sendTemplateEmailWithAttachment(
            templateNo,
            recipientEmail,
            emailData,
            recipientName,
            pdfBase64,
            pdfFilename || `Permit-${permitData?.permitNumber || "document"}.pdf`
        );

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: "Email with PDF sent successfully",
                messageId: result.messageId
            });
        } else {
            return res.status(400).json({
                success: false,
                message: result.message || "Failed to send email"
            });
        }
    } catch (error) {
        logger.error("Error sending email with PDF:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to send email with PDF attachment"
        });
    }
};
