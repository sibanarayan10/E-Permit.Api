const mongoose = require("mongoose");

const loginActivitySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        loginTime: {
            type: Date,
            default: Date.now,
        },
        logoutTime: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            enum: ["success", "failed"],
            required: true,
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
        failureReason: {
            type: String,
            default: null,
        },
        sessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserSession",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for fast queries
loginActivitySchema.index({ user: 1, loginTime: -1 });
loginActivitySchema.index({ user: 1, status: 1 });
loginActivitySchema.index({ loginTime: -1 });
loginActivitySchema.index({ ipAddress: 1 });

module.exports = mongoose.model("LoginActivity", loginActivitySchema);
