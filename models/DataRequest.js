const mongoose = require("mongoose");

/**
 * Data Request Model
 * For handling data requests that link to existing permits (General or Height)
 */

// Signature block (Name + Signature + Date + Time)
const signatoryDetailsSchema = new mongoose.Schema(
    {
        name: { type: String, trim: true },
        signature: { type: String, trim: true },
        date: { type: Date },
        time: { type: String, trim: true },
    },
    { _id: false }
);

const DataRequestSchema = new mongoose.Schema(
    {
        // Basic identifiers
        dataRequestId: { type: String, required: true, unique: true, trim: true },

        // Linked permit reference
        permitId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'permitType',
            required: true,
        },
        permitNumber: { type: String, required: true, trim: true },
        permitType: {
            type: String,
            enum: ['general', 'height'],
            required: true,
        },
        permitModel: {
            type: String,
            enum: ['GeneralWorkPermit', 'HeightPermit'],
            required: true,
        },

        // Workflow status
        status: {
            type: String,
            enum: [
                'draft',
                'pending_executor',
                'executor_approved',
                'pending_issuer',
                'approved',
                'rejected',
            ],
            default: 'draft',
        },

        // Creator
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Executor assignment & OTP
        assignedExecutor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        executorEmailSentAt: { type: Date },
        executorSecureToken: { type: String, trim: true },
        executorTokenExpiresAt: { type: Date },
        executorOtp: { type: String, trim: true },
        executorOtpExpiresAt: { type: Date },
        executorOtpMethod: {
            type: String,
            enum: ['email', 'sms'],
        },
        executorVerifiedAt: { type: Date },

        // Executor approval data (same structure as ExecutionApprovalForm)
        executorApproval: {
            approved: { type: Boolean, default: false },
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            approvedAt: { type: Date },
            comments: { type: String, trim: true },

            // Executing Agency data
            executingAgency: {
                specialPPEsToolsEquipment: [String],
                numberOfPersonsAttached: Number,
                nameOfPersons: [String],
                attachSeparateList: { type: Boolean, default: false },
                acceptorName: String,
                acceptorSignature: signatoryDetailsSchema,
                holderName: String,
                holderSignature: signatoryDetailsSchema,
                acceptanceDate: Date,
                acceptanceTime: String,
            },

            // Pre-execution checks
            preExecutionChecks: {
                jobSpecificSafetyTalk: { type: String, enum: ["YES", "NO", "NA"] },
                sparkGeneratingWork: { type: String, enum: ["YES", "NO", "NA"] },
                combustibleMaterialRemoved: { type: String, enum: ["YES", "NO", "NA"] },
                barriersGuardsUsed: { type: String, enum: ["YES", "NO", "NA"] },
                barricadingRequired: { type: String, enum: ["YES", "NO", "NA"] },
                fireExtinguisherLocationKnown: { type: String, enum: ["YES", "NO", "NA"] },
                additionalIlluminationRequired: { type: String, enum: ["YES", "NO", "NA"] },
                additionalSupplyPointsRequired: { type: String, enum: ["YES", "NO", "NA"] },
                gasTestingRequired: { type: String, enum: ["YES", "NO", "NA"] },
                periodicGasMonitoringRequired: { type: String, enum: ["YES", "NO", "NA"] },
                repDetails: signatoryDetailsSchema,
            },
        },

        // Issuer assignment & OTP
        assignedIssuer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        issuerEmailSentAt: { type: Date },
        issuerSecureToken: { type: String, trim: true },
        issuerTokenExpiresAt: { type: Date },
        issuerOtp: { type: String, trim: true },
        issuerOtpExpiresAt: { type: Date },
        issuerOtpMethod: {
            type: String,
            enum: ['email', 'sms'],
        },
        issuerVerifiedAt: { type: Date },

        // Issuer approval data
        issuerApproval: {
            approved: { type: Boolean, default: false },
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            approvedAt: { type: Date },
            comments: { type: String, trim: true },
            verifiedAndFoundSatisfactory: { type: Boolean, default: false },
            issuerDetails: signatoryDetailsSchema,
        },

        // Final approval timestamp
        approvedAt: { type: Date },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Indexes
DataRequestSchema.index({ dataRequestId: 1 });
DataRequestSchema.index({ permitId: 1 });
DataRequestSchema.index({ status: 1 });
DataRequestSchema.index({ createdBy: 1 });
DataRequestSchema.index({ assignedExecutor: 1 });
DataRequestSchema.index({ assignedIssuer: 1 });
DataRequestSchema.index({ executorSecureToken: 1 });
DataRequestSchema.index({ issuerSecureToken: 1 });

module.exports = mongoose.model("DataRequest", DataRequestSchema);
