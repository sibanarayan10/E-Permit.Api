const mongoose = require("mongoose");

/**
 * HIRA JSA (Hazard Identification & Risk Assessment) Model
 * 
 * RISK CALCULATION RULES (Backend Only):
 * - Risk Score = Likelihood × Severity
 * - Risk Level Mapping:
 *   1-5:   Low
 *   6-10:  Medium
 *   11-15: High
 *   16-25: Extreme
 * 
 * BUSINESS RULES:
 * - Serial numbers auto-increment per row
 * - If Risk Level ≥ Medium → ACM (Additional Control Measures) is mandatory
 * - Residual risk is calculated after ACM
 * - Extreme risk: Allowed to save, clearly marked
 */

// ============================================
//   RISK CALCULATION CONSTANTS
// ============================================
const RISK_LEVELS = {
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    EXTREME: "Extreme"
};

const OPPORTUNITY_OPTIONS = [
    "Elimination",
    "Substitution",
    "Engineering Control",
    "Administrative Control",
    "PPEs"
];

// ============================================
//   HIRA STATUS CONSTANTS
// ============================================
const HIRA_STATUS = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    LOCKED: "Locked"
};

// ============================================
//   HELPER FUNCTIONS (Used in middleware)
// ============================================

/**
 * Calculate risk score from likelihood and severity
 * @param {number} likelihood - Value 1-5
 * @param {number} severity - Value 1-5
 * @returns {number} Risk score (1-25)
 */
const calculateRiskScore = (likelihood, severity) => {
    const l = parseInt(likelihood) || 0;
    const s = parseInt(severity) || 0;
    return l * s;
};

/**
 * Determine risk level from risk score
 * @param {number} riskScore - Value 1-25
 * @returns {string} Risk level (Low/Medium/High/Extreme)
 */
const getRiskLevel = (riskScore) => {
    const score = parseInt(riskScore) || 0;
    if (score >= 16) return RISK_LEVELS.EXTREME;
    if (score >= 11) return RISK_LEVELS.HIGH;
    if (score >= 6) return RISK_LEVELS.MEDIUM;
    return RISK_LEVELS.LOW;
};

/**
 * Check if risk level requires additional control measures
 * @param {string} riskLevel 
 * @returns {boolean}
 */
const requiresACM = (riskLevel) => {
    return [RISK_LEVELS.MEDIUM, RISK_LEVELS.HIGH, RISK_LEVELS.EXTREME].includes(riskLevel);
};

// ============================================
//   HIRA ROW SCHEMA
// ============================================
const hiraRowSchema = new mongoose.Schema(
    {
        // Serial number - auto-generated
        serialNo: {
            type: Number,
            required: true
        },

        // Task / Activity
        taskActivity: {
            type: String,
            required: [true, "Task/Activity is required"],
            trim: true
        },

        // Hazards - array of strings
        hazards: {
            type: [String],
            default: []
        },

        // Risks - array of strings
        risks: {
            type: [String],
            default: []
        },

        // Existing Control Measures (ECM)
        existingControlMeasures: {
            type: [String],
            default: []
        },

        // Likelihood (1-5) - required for risk calculation
        likelihood: {
            type: Number,
            required: [true, "Likelihood is required"],
            min: [1, "Likelihood must be between 1 and 5"],
            max: [5, "Likelihood must be between 1 and 5"]
        },

        // Severity (1-5) - required for risk calculation
        severity: {
            type: Number,
            required: [true, "Severity is required"],
            min: [1, "Severity must be between 1 and 5"],
            max: [5, "Severity must be between 1 and 5"]
        },

        // Risk Score - AUTO CALCULATED (L × S)
        riskScore: {
            type: Number,
            default: 0
        },

        // Risk Level - AUTO CALCULATED
        riskLevel: {
            type: String,
            enum: Object.values(RISK_LEVELS),
            default: RISK_LEVELS.LOW
        },

        // Opportunity (dropdown)
        opportunity: {
            type: String,
            enum: [...OPPORTUNITY_OPTIONS, ""],
            default: ""
        },

        // Additional Control Measures (ACM)
        additionalControlMeasures: {
            type: [String],
            default: []
        },

        // Residual Likelihood (1-5)
        residualLikelihood: {
            type: Number,
            min: [1, "Residual Likelihood must be between 1 and 5"],
            max: [5, "Residual Likelihood must be between 1 and 5"],
            default: null
        },

        // Residual Severity (1-5)
        residualSeverity: {
            type: Number,
            min: [1, "Residual Severity must be between 1 and 5"],
            max: [5, "Residual Severity must be between 1 and 5"],
            default: null
        },

        // Residual Risk Score - AUTO CALCULATED
        residualRiskScore: {
            type: Number,
            default: 0
        },

        // Residual Risk Level - AUTO CALCULATED
        residualRiskLevel: {
            type: String,
            enum: [...Object.values(RISK_LEVELS), ""],
            default: ""
        },

        // Responsibility
        responsibility: {
            type: String,
            trim: true,
            default: ""
        }
    },
    { _id: true }
);

// ============================================
//   MAIN HIRA JSA SCHEMA
// ============================================
const HiraJsaSchema = new mongoose.Schema(
    {
        // ===========================
        //   AUTO-GENERATED IDENTIFIERS
        // ===========================
        hiraNumber: {
            type: String,
            unique: true,
            required: true
        },

        // ===========================
        //   JOB HEADER (MANDATORY FIELDS ONLY)
        // ===========================
        jobHeader: {
            area: {
                type: String,
                required: [true, "Area is required"],
                trim: true
            },
            jobType: {
                type: String,
                required: [true, "Job Type is required"],
                trim: true
            },
            jobDetails: {
                type: String,
                required: [true, "Job Details is required"],
                trim: true
            },
            preparedBy: {
                type: String,
                required: [true, "Prepared By is required"],
                trim: true
            }
        },

        // ===========================
        //   HIRA TABLE ROWS
        // ===========================
        rows: {
            type: [hiraRowSchema],
            default: [],
            validate: {
                validator: function (rows) {
                    // At least one row is recommended, but not enforced
                    return true;
                },
                message: "At least one HIRA row is recommended"
            }
        },

        // ===========================
        //   STATUS & TRACKING
        // ===========================
        status: {
            type: String,
            enum: Object.values(HIRA_STATUS),
            default: HIRA_STATUS.DRAFT
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // ===========================
        //   PHASE 1: SAFETY & COMPLIANCE
        // ===========================
        isLocked: {
            type: Boolean,
            default: false
        },

        // Is this the default HIRA template for permits
        isDefault: {
            type: Boolean,
            default: false
        },

        lockedAt: {
            type: Date
        },

        lockedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        // ===========================
        //   PHASE 2: AUDIT TRAIL
        // ===========================
        auditTrail: [{
            action: {
                type: String,
                enum: ["created", "updated", "submitted", "locked", "row_added", "row_updated", "row_deleted"],
                required: true
            },
            performedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            performedAt: {
                type: Date,
                default: Date.now
            },
            changes: {
                type: mongoose.Schema.Types.Mixed
            },
            previousValues: {
                type: mongoose.Schema.Types.Mixed
            }
        }],

        // ===========================
        //   PHASE 2: TEMPLATE REFERENCE
        // ===========================
        clonedFrom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "HiraJsa"
        },

        // ===========================
        //   METADATA
        // ===========================
        validationWarnings: [{
            rowIndex: Number,
            message: String,
            type: {
                type: String,
                enum: ["acm_required", "high_residual_risk", "extreme_risk"]
            }
        }]
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// ============================================
//   INDEXES
// ============================================
HiraJsaSchema.index({ hiraNumber: 1 });
HiraJsaSchema.index({ createdBy: 1 });
HiraJsaSchema.index({ status: 1 });
HiraJsaSchema.index({ isDefault: 1 });
HiraJsaSchema.index({ "jobHeader.area": 1 });
HiraJsaSchema.index({ createdAt: -1 });

// ============================================
//   VIRTUALS
// ============================================

// Risk reduction indicator (aggregate)
HiraJsaSchema.virtual("riskReductionSummary").get(function () {
    if (!this.rows || this.rows.length === 0) return null;

    let totalInitialScore = 0;
    let totalResidualScore = 0;
    let rowsWithResidual = 0;

    this.rows.forEach(row => {
        totalInitialScore += row.riskScore || 0;
        if (row.residualRiskScore !== null && row.residualRiskScore !== undefined) {
            totalResidualScore += row.residualRiskScore;
            rowsWithResidual++;
        }
    });

    if (rowsWithResidual === 0) return null;

    const reduction = totalInitialScore - totalResidualScore;
    const reductionPercentage = totalInitialScore > 0
        ? Math.round((reduction / totalInitialScore) * 100)
        : 0;

    return {
        totalInitialScore,
        totalResidualScore,
        reduction,
        reductionPercentage,
        rowsAnalyzed: this.rows.length,
        rowsWithResidual
    };
});

// ============================================
//   PRE-SAVE MIDDLEWARE - RISK CALCULATIONS
// ============================================
HiraJsaSchema.pre("save", function (next) {
    const hira = this;

    // Skip if locked
    if (hira.isLocked && !hira.isNew) {
        const error = new Error("Cannot modify a locked HIRA record");
        error.statusCode = 403;
        return next(error);
    }

    // Clear validation warnings
    hira.validationWarnings = [];

    // Process each row
    if (hira.rows && hira.rows.length > 0) {
        hira.rows.forEach((row, index) => {
            // Auto-assign serial number if not set
            if (!row.serialNo) {
                row.serialNo = index + 1;
            }

            // ===========================
            //   CALCULATE INITIAL RISK
            // ===========================
            if (row.likelihood && row.severity) {
                // Always calculate risk score on backend
                row.riskScore = calculateRiskScore(row.likelihood, row.severity);
                row.riskLevel = getRiskLevel(row.riskScore);

                // Validate ACM requirement
                if (requiresACM(row.riskLevel)) {
                    if (!row.additionalControlMeasures || row.additionalControlMeasures.length === 0) {
                        hira.validationWarnings.push({
                            rowIndex: index,
                            message: `Row ${row.serialNo}: Additional Control Measures (ACM) required for ${row.riskLevel} risk level`,
                            type: "acm_required"
                        });
                    }
                }

                // Mark extreme risk
                if (row.riskLevel === RISK_LEVELS.EXTREME) {
                    hira.validationWarnings.push({
                        rowIndex: index,
                        message: `Row ${row.serialNo}: EXTREME risk identified (Score: ${row.riskScore})`,
                        type: "extreme_risk"
                    });
                }
            }

            // ===========================
            //   CALCULATE RESIDUAL RISK
            // ===========================
            if (row.residualLikelihood && row.residualSeverity) {
                row.residualRiskScore = calculateRiskScore(row.residualLikelihood, row.residualSeverity);
                row.residualRiskLevel = getRiskLevel(row.residualRiskScore);

                // Warn if residual risk is still high
                if ([RISK_LEVELS.HIGH, RISK_LEVELS.EXTREME].includes(row.residualRiskLevel)) {
                    hira.validationWarnings.push({
                        rowIndex: index,
                        message: `Row ${row.serialNo}: Residual risk is still ${row.residualRiskLevel} (Score: ${row.residualRiskScore})`,
                        type: "high_residual_risk"
                    });
                }
            } else {
                // Clear residual values if not provided
                row.residualRiskScore = 0;
                row.residualRiskLevel = "";
            }
        });

        // Re-number serial numbers to ensure consistency
        hira.rows.forEach((row, index) => {
            row.serialNo = index + 1;
        });
    }

    next();
});

// ============================================
//   STATIC METHODS
// ============================================

/**
 * Generate automatic HIRA number
 */
HiraJsaSchema.statics.generateHiraNumber = async function () {
    const currentYear = new Date().getFullYear();
    const prefix = `HIRA-${currentYear}-`;

    // Find the latest HIRA for this year
    const latestHira = await this.findOne({
        hiraNumber: new RegExp(`^${prefix}`)
    }).sort({ createdAt: -1 });

    let sequence = 1;
    if (latestHira && latestHira.hiraNumber) {
        const parts = latestHira.hiraNumber.split("-");
        if (parts.length === 3) {
            sequence = parseInt(parts[2]) + 1;
        }
    }

    return `${prefix}${sequence.toString().padStart(4, "0")}`;
};

/**
 * Validate ACM requirements for all rows
 * @param {Array} rows - HIRA rows
 * @returns {Array} Validation errors
 */
HiraJsaSchema.statics.validateACMRequirements = function (rows) {
    const errors = [];

    if (!rows || rows.length === 0) return errors;

    rows.forEach((row, index) => {
        const riskScore = calculateRiskScore(row.likelihood, row.severity);
        const riskLevel = getRiskLevel(riskScore);

        if (requiresACM(riskLevel)) {
            if (!row.additionalControlMeasures || row.additionalControlMeasures.length === 0) {
                errors.push({
                    rowIndex: index,
                    serialNo: row.serialNo || index + 1,
                    riskLevel,
                    message: `Additional Control Measures (ACM) required for ${riskLevel} risk level`
                });
            }
        }
    });

    return errors;
};

// ============================================
//   INSTANCE METHODS
// ============================================

/**
 * Lock the HIRA record (makes it read-only)
 * @param {ObjectId} userId - User locking the record
 */
HiraJsaSchema.methods.lock = async function (userId) {
    this.isLocked = true;
    this.lockedAt = new Date();
    this.lockedBy = userId;
    this.status = HIRA_STATUS.LOCKED;

    this.auditTrail.push({
        action: "locked",
        performedBy: userId,
        performedAt: new Date()
    });

    return this.save();
};

/**
 * Add audit entry
 * @param {string} action - Action performed
 * @param {ObjectId} userId - User performing action
 * @param {Object} changes - Changes made
 * @param {Object} previousValues - Previous values
 */
HiraJsaSchema.methods.addAuditEntry = function (action, userId, changes = null, previousValues = null) {
    this.auditTrail.push({
        action,
        performedBy: userId,
        performedAt: new Date(),
        changes,
        previousValues
    });
};

// ============================================
//   EXPORTS
// ============================================
module.exports = mongoose.model("HiraJsa", HiraJsaSchema);

// Export constants for use in controllers
module.exports.RISK_LEVELS = RISK_LEVELS;
module.exports.OPPORTUNITY_OPTIONS = OPPORTUNITY_OPTIONS;
module.exports.HIRA_STATUS = HIRA_STATUS;
module.exports.calculateRiskScore = calculateRiskScore;
module.exports.getRiskLevel = getRiskLevel;
module.exports.requiresACM = requiresACM;
