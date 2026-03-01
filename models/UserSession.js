const mongoose = require("mongoose");

const userSessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["online", "offline", "expired"],
            default: "online",
        },
        sessionStart: {
            type: Date,
            default: Date.now,
        },
        sessionExpiry: {
            type: Date,
            required: true,
        },
        lastActivity: {
            type: Date,
            default: Date.now,
        },
        ipAddress: {
            type: String,
            default: null,
        },
        userAgent: {
            type: String,
            default: null,
        },
        device: {
            type: String,
            default: null,
        },
        browser: {
            type: String,
            default: null,
        },
        os: {
            type: String,
            default: null,
        },
        logoutReason: {
            type: String,
            enum: ["manual", "expired", "inactivity", "admin_forced", null],
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for fast queries
userSessionSchema.index({ user: 1, status: 1 });
userSessionSchema.index({ status: 1, sessionExpiry: 1 });
userSessionSchema.index({ lastActivity: 1 });

// Auto-expire: Mark sessions as expired if past sessionExpiry
userSessionSchema.statics.expireStaleSessions = async function () {
    const now = new Date();
    const result = await this.updateMany(
        {
            status: "online",
            $or: [
                { sessionExpiry: { $lte: now } },
                // Inactivity timeout: 30 minutes since last activity
                { lastActivity: { $lte: new Date(now.getTime() - 30 * 60 * 1000) } },
            ],
        },
        {
            $set: {
                status: "expired",
                logoutReason: "inactivity",
            },
        }
    );
    return result;
};

module.exports = mongoose.model("UserSession", userSessionSchema);
