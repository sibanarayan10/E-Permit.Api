const mongoose = require("mongoose");

/**
 * Application Settings Model
 * Stores global application settings like email and SMS notifications toggle
 * Only one document should exist (singleton pattern)
 */
const SettingsSchema = new mongoose.Schema(
    {
        // Unique key to ensure only one settings document exists
        key: {
            type: String,
            default: "app_settings",
            unique: true,
            immutable: true
        },

        // Email notification settings
        emailNotificationsEnabled: {
            type: Boolean,
            default: true
        },

        // SMS notification settings (MSG91)
        smsNotificationsEnabled: {
            type: Boolean,
            default: false // Default to disabled until MSG91 is configured
        },

        // Track who last modified the settings
        lastModifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    },
    {
        timestamps: true
    }
);

// Static method to get settings (creates default if not exists)
SettingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne({ key: "app_settings" });
    if (!settings) {
        settings = await this.create({ key: "app_settings" });
    }
    return settings;
};

// Static method to update settings
SettingsSchema.statics.updateSettings = async function (updates, userId) {
    const settings = await this.getSettings();

    if (updates.emailNotificationsEnabled !== undefined) {
        settings.emailNotificationsEnabled = updates.emailNotificationsEnabled;
    }

    if (updates.smsNotificationsEnabled !== undefined) {
        settings.smsNotificationsEnabled = updates.smsNotificationsEnabled;
    }

    settings.lastModifiedBy = userId;
    await settings.save();
    return settings;
};

module.exports = mongoose.model("Settings", SettingsSchema);
