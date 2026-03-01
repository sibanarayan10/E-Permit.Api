const Settings = require("../models/Settings");
const logger = require("../utils/logger");

/**
 * Get current settings
 * Admin only
 */
exports.getSettings = async (req, res) => {
    try {
        const settings = await Settings.getSettings();

        return res.status(200).json({
            success: true,
            data: {
                emailNotificationsEnabled: settings.emailNotificationsEnabled,
                smsNotificationsEnabled: settings.smsNotificationsEnabled,
                updatedAt: settings.updatedAt
            }
        });
    } catch (error) {
        logger.error("Error getting settings:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get settings"
        });
    }
};

/**
 * Update settings
 * Admin only
 */
exports.updateSettings = async (req, res) => {
    try {
        const { emailNotificationsEnabled, smsNotificationsEnabled } = req.body;
        const userId = req.user._id || req.user.id;

        const settings = await Settings.updateSettings(
            { emailNotificationsEnabled, smsNotificationsEnabled },
            userId
        );

        // Log what was updated
        const updates = [];
        if (emailNotificationsEnabled !== undefined) {
            updates.push(`emailNotificationsEnabled=${emailNotificationsEnabled}`);
        }
        if (smsNotificationsEnabled !== undefined) {
            updates.push(`smsNotificationsEnabled=${smsNotificationsEnabled}`);
        }
        logger.info(`Settings updated by ${req.user.email}: ${updates.join(", ")}`);

        return res.status(200).json({
            success: true,
            message: "Settings updated successfully",
            data: {
                emailNotificationsEnabled: settings.emailNotificationsEnabled,
                smsNotificationsEnabled: settings.smsNotificationsEnabled,
                updatedAt: settings.updatedAt
            }
        });
    } catch (error) {
        logger.error("Error updating settings:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update settings"
        });
    }
};

/**
 * Check if email notifications are enabled
 * Used internally by email service
 */
exports.isEmailEnabled = async () => {
    try {
        const settings = await Settings.getSettings();
        return settings.emailNotificationsEnabled;
    } catch (error) {
        logger.error("Error checking email settings:", error);
        return true; // Default to enabled if error
    }
};

/**
 * Check if SMS notifications are enabled
 * Used internally by SMS service
 */
exports.isSmsEnabled = async () => {
    try {
        const settings = await Settings.getSettings();
        return settings.smsNotificationsEnabled;
    } catch (error) {
        logger.error("Error checking SMS settings:", error);
        return false; // Default to disabled if error
    }
};

