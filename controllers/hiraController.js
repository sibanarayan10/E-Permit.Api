const HiraJsa = require("../models/HiraJsa");
const User = require("../models/User");
const {
    RISK_LEVELS,
    OPPORTUNITY_OPTIONS,
    HIRA_STATUS,
    calculateRiskScore,
    getRiskLevel,
    requiresACM
} = require("../models/HiraJsa");
const { RESPONSE_MESSAGES, PAGINATION } = require("../config/constants");
const logger = require("../utils/logger");

// ============================================
//   PDF & EXCEL EXPORT UTILITIES (PHASE 3)
// ============================================
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

/**
 * Get risk level color for PDF/Excel
 */
const getRiskLevelColor = (riskLevel) => {
    switch (riskLevel) {
        case RISK_LEVELS.LOW: return { r: 0, g: 176, b: 80 }; // Green
        case RISK_LEVELS.MEDIUM: return { r: 255, g: 192, b: 0 }; // Yellow/Orange
        case RISK_LEVELS.HIGH: return { r: 255, g: 128, b: 0 }; // Orange
        case RISK_LEVELS.EXTREME: return { r: 255, g: 0, b: 0 }; // Red
        default: return { r: 128, g: 128, b: 128 }; // Gray
    }
};

// ============================================
//   CREATE HIRA
// ============================================

/**
 * Create a new HIRA JSA record
 * POST /api/hira
 * 
 * Request Body:
 * {
 *   "jobHeader": {
 *     "area": "Plant A",
 *     "jobType": "Maintenance",
 *     "jobDetails": "Pipe replacement",
 *     "preparedBy": "John Doe"
 *   },
 *   "rows": [
 *     {
 *       "taskActivity": "Cutting pipe",
 *       "hazards": ["Sharp edges", "Sparks"],
 *       "risks": ["Cuts", "Fire"],
 *       "existingControlMeasures": ["Gloves", "Fire extinguisher"],
 *       "likelihood": 3,
 *       "severity": 4,
 *       "opportunity": "Engineering Control",
 *       "additionalControlMeasures": ["Fire watch"],
 *       "residualLikelihood": 2,
 *       "residualSeverity": 2,
 *       "responsibility": "Site Supervisor"
 *     }
 *   ]
 * }
 */
exports.createHira = async (req, res) => {
    try {
        const userId = req.user._id;
        const { jobHeader, rows } = req.body;

        // Validate job header
        if (!jobHeader) {
            return res.status(400).json({
                success: false,
                message: "Job header is required"
            });
        }

        const requiredFields = ["area", "jobType", "jobDetails", "preparedBy"];
        const missingFields = requiredFields.filter(field => !jobHeader[field]);
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required job header fields: ${missingFields.join(", ")}`
            });
        }

        // Generate HIRA number
        const hiraNumber = await HiraJsa.generateHiraNumber();

        // Process rows - remove any frontend-calculated risk values
        const processedRows = (rows || []).map((row, index) => {
            // Remove frontend-calculated values - backend will recalculate
            const { riskScore, riskLevel, residualRiskScore, residualRiskLevel, ...cleanRow } = row;

            return {
                ...cleanRow,
                serialNo: index + 1
            };
        });

        // Validate each row has required fields
        for (let i = 0; i < processedRows.length; i++) {
            const row = processedRows[i];
            if (!row.taskActivity) {
                return res.status(400).json({
                    success: false,
                    message: `Row ${i + 1}: Task/Activity is required`
                });
            }
            if (!row.likelihood || !row.severity) {
                return res.status(400).json({
                    success: false,
                    message: `Row ${i + 1}: Likelihood and Severity are required`
                });
            }
        }

        // Pre-validate ACM requirements (warning only, doesn't block save)
        const acmErrors = HiraJsa.validateACMRequirements(processedRows);

        // Create HIRA document
        const hira = new HiraJsa({
            hiraNumber,
            jobHeader,
            rows: processedRows,
            createdBy: userId,
            status: HIRA_STATUS.DRAFT,
            auditTrail: [{
                action: "created",
                performedBy: userId,
                performedAt: new Date()
            }]
        });

        // Save - pre-save middleware will calculate risks
        await hira.save();

        // Populate and return
        const populatedHira = await HiraJsa.findById(hira._id)
            .populate("createdBy", "name email")
            .lean();

        logger.info(`HIRA ${hira.hiraNumber} created by user ${userId}`);

        return res.status(201).json({
            success: true,
            message: "HIRA JSA created successfully",
            data: populatedHira,
            warnings: hira.validationWarnings,
            acmValidation: acmErrors.length > 0 ? {
                hasErrors: true,
                errors: acmErrors
            } : null
        });

    } catch (error) {
        logger.error("Error creating HIRA:", error);

        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors
            });
        }

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "HIRA number already exists"
            });
        }

        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   GET ALL HIRAs
// ============================================

/**
 * Get all HIRA records with pagination
 * GET /api/hira
 */
exports.getAllHiras = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
        const limit = Math.min(
            parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT,
            PAGINATION.MAX_LIMIT
        );
        const skip = (page - 1) * limit;

        // Build query
        const query = {};

        // Filter by status
        if (req.query.status) {
            query.status = req.query.status;
        }

        // Filter by area
        if (req.query.area) {
            query["jobHeader.area"] = { $regex: req.query.area, $options: "i" };
        }

        // Filter by created by (for non-admin users)
        if (req.user.role !== "ADMIN" && req.user.role !== "SUBADMIN") {
            query.createdBy = req.user._id;
        }

        // Search by HIRA number
        if (req.query.search) {
            query.$or = [
                { hiraNumber: { $regex: req.query.search, $options: "i" } },
                { "jobHeader.area": { $regex: req.query.search, $options: "i" } },
                { "jobHeader.jobType": { $regex: req.query.search, $options: "i" } }
            ];
        }

        const [hiras, total] = await Promise.all([
            HiraJsa.find(query)
                .populate("createdBy", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            HiraJsa.countDocuments(query)
        ]);

        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            success: true,
            message: "HIRA records fetched successfully",
            data: {
                hiras,
                pagination: {
                    current: page,
                    total: totalPages,
                    count: hiras.length,
                    totalRecords: total,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            }
        });

    } catch (error) {
        logger.error("Error fetching HIRAs:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   GET HIRA BY ID
// ============================================

/**
 * Get a single HIRA by ID
 * GET /api/hira/:id
 */
exports.getHiraById = async (req, res) => {
    try {
        const { id } = req.params;

        const hira = await HiraJsa.findById(id)
            .populate("createdBy", "name email")
            .populate("lockedBy", "name email")
            .populate("clonedFrom", "hiraNumber")
            .populate("auditTrail.performedBy", "name email");

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "HIRA fetched successfully",
            data: hira
        });

    } catch (error) {
        logger.error("Error fetching HIRA:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   UPDATE HIRA
// ============================================

/**
 * Update a HIRA record
 * PUT /api/hira/:id
 */
exports.updateHira = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { jobHeader, rows } = req.body;

        const hira = await HiraJsa.findById(id);

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        // Check if locked
        if (hira.isLocked) {
            return res.status(403).json({
                success: false,
                message: "Cannot modify a locked HIRA record"
            });
        }

        // Check ownership (or admin)
        if (hira.createdBy.toString() !== userId.toString() && req.user.role !== "ADMIN" && req.user.role !== "SUBADMIN") {
            return res.status(403).json({
                success: false,
                message: "You can only update your own HIRA records"
            });
        }

        // Store previous values for audit
        const previousValues = {
            jobHeader: { ...hira.jobHeader.toObject() },
            rows: hira.rows.map(r => r.toObject())
        };

        // Update job header
        if (jobHeader) {
            hira.jobHeader = { ...hira.jobHeader.toObject(), ...jobHeader };
        }

        // Update rows
        if (rows) {
            // Process rows - remove frontend-calculated values
            hira.rows = rows.map((row, index) => {
                const { riskScore, riskLevel, residualRiskScore, residualRiskLevel, ...cleanRow } = row;
                return {
                    ...cleanRow,
                    serialNo: index + 1
                };
            });
        }

        // Add audit entry
        hira.addAuditEntry("updated", userId, { jobHeader, rowCount: rows?.length }, previousValues);

        // Save - pre-save middleware will recalculate risks
        await hira.save();

        const updatedHira = await HiraJsa.findById(hira._id)
            .populate("createdBy", "name email")
            .lean();

        logger.info(`HIRA ${hira.hiraNumber} updated by user ${userId}`);

        return res.status(200).json({
            success: true,
            message: "HIRA updated successfully",
            data: updatedHira,
            warnings: hira.validationWarnings
        });

    } catch (error) {
        logger.error("Error updating HIRA:", error);

        if (error.statusCode === 403) {
            return res.status(403).json({
                success: false,
                message: error.message
            });
        }

        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors
            });
        }

        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   DELETE HIRA
// ============================================

/**
 * Delete a HIRA record
 * DELETE /api/hira/:id
 */
exports.deleteHira = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const hira = await HiraJsa.findById(id);

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        // Check if locked
        if (hira.isLocked) {
            return res.status(403).json({
                success: false,
                message: "Cannot delete a locked HIRA record"
            });
        }

        // Check ownership (or admin)
        if (hira.createdBy.toString() !== userId.toString() && req.user.role !== "ADMIN" && req.user.role !== "SUBADMIN") {
            return res.status(403).json({
                success: false,
                message: "You can only delete your own HIRA records"
            });
        }

        await HiraJsa.findByIdAndDelete(id);

        logger.info(`HIRA ${hira.hiraNumber} deleted by user ${userId}`);

        return res.status(200).json({
            success: true,
            message: "HIRA deleted successfully"
        });

    } catch (error) {
        logger.error("Error deleting HIRA:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   SUBMIT HIRA (PHASE 1)
// ============================================

/**
 * Submit a HIRA record (validates ACM requirements)
 * POST /api/hira/:id/submit
 */
exports.submitHira = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const hira = await HiraJsa.findById(id);

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        // Check ownership
        if (hira.createdBy.toString() !== userId.toString() && req.user.role !== "ADMIN" && req.user.role !== "SUBADMIN") {
            return res.status(403).json({
                success: false,
                message: "You can only submit your own HIRA records"
            });
        }

        // Check if already submitted
        if (hira.status !== HIRA_STATUS.DRAFT) {
            return res.status(400).json({
                success: false,
                message: `HIRA is already ${hira.status}`
            });
        }

        // Validate ACM requirements (MANDATORY for Medium+ risk)
        const acmErrors = HiraJsa.validateACMRequirements(hira.rows);
        if (acmErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Cannot submit: Additional Control Measures (ACM) required for Medium/High/Extreme risk levels",
                errors: acmErrors
            });
        }

        // Update status
        hira.status = HIRA_STATUS.SUBMITTED;
        hira.addAuditEntry("submitted", userId);
        await hira.save();

        logger.info(`HIRA ${hira.hiraNumber} submitted by user ${userId}`);

        return res.status(200).json({
            success: true,
            message: "HIRA submitted successfully",
            data: hira
        });

    } catch (error) {
        logger.error("Error submitting HIRA:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   LOCK HIRA (PHASE 1)
// ============================================

/**
 * Lock a HIRA record (makes it read-only)
 * POST /api/hira/:id/lock
 */
exports.lockHira = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const hira = await HiraJsa.findById(id);

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        // Only admin or creator can lock
        if (hira.createdBy.toString() !== userId.toString() && req.user.role !== "ADMIN" && req.user.role !== "SUBADMIN") {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to lock this HIRA"
            });
        }

        if (hira.isLocked) {
            return res.status(400).json({
                success: false,
                message: "HIRA is already locked"
            });
        }

        await hira.lock(userId);

        logger.info(`HIRA ${hira.hiraNumber} locked by user ${userId}`);

        return res.status(200).json({
            success: true,
            message: "HIRA locked successfully",
            data: hira
        });

    } catch (error) {
        logger.error("Error locking HIRA:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   CLONE HIRA (PHASE 2 - TEMPLATE)
// ============================================

/**
 * Clone an existing HIRA as a template
 * POST /api/hira/:id/clone
 */
exports.cloneHira = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const sourceHira = await HiraJsa.findById(id);

        if (!sourceHira) {
            return res.status(404).json({
                success: false,
                message: "Source HIRA not found"
            });
        }

        // Generate new HIRA number
        const hiraNumber = await HiraJsa.generateHiraNumber();

        // Clone the HIRA (without IDs and status)
        const clonedData = {
            hiraNumber,
            jobHeader: { ...sourceHira.jobHeader.toObject() },
            rows: sourceHira.rows.map((row, index) => ({
                serialNo: index + 1,
                taskActivity: row.taskActivity,
                hazards: [...row.hazards],
                risks: [...row.risks],
                existingControlMeasures: [...row.existingControlMeasures],
                likelihood: row.likelihood,
                severity: row.severity,
                opportunity: row.opportunity,
                additionalControlMeasures: [...row.additionalControlMeasures],
                residualLikelihood: row.residualLikelihood,
                residualSeverity: row.residualSeverity,
                responsibility: row.responsibility
            })),
            createdBy: userId,
            status: HIRA_STATUS.DRAFT,
            clonedFrom: sourceHira._id,
            auditTrail: [{
                action: "created",
                performedBy: userId,
                performedAt: new Date(),
                changes: { clonedFrom: sourceHira.hiraNumber }
            }]
        };

        const clonedHira = new HiraJsa(clonedData);
        await clonedHira.save();

        const populatedHira = await HiraJsa.findById(clonedHira._id)
            .populate("createdBy", "name email")
            .populate("clonedFrom", "hiraNumber")
            .lean();

        logger.info(`HIRA ${clonedHira.hiraNumber} cloned from ${sourceHira.hiraNumber} by user ${userId}`);

        return res.status(201).json({
            success: true,
            message: `HIRA cloned successfully from ${sourceHira.hiraNumber}`,
            data: populatedHira
        });

    } catch (error) {
        logger.error("Error cloning HIRA:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   GET NEXT HIRA NUMBER
// ============================================

/**
 * Get the next available HIRA number
 * GET /api/hira/next-number
 */
exports.getNextHiraNumber = async (req, res) => {
    try {
        const hiraNumber = await HiraJsa.generateHiraNumber();

        return res.status(200).json({
            success: true,
            data: { hiraNumber }
        });

    } catch (error) {
        logger.error("Error generating HIRA number:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   GET RISK MATRIX REFERENCE DATA
// ============================================

/**
 * Get risk matrix reference data (for frontend display)
 * GET /api/hira/risk-matrix
 */
exports.getRiskMatrixData = async (req, res) => {
    try {
        const riskMatrix = {
            severityDefinitions: [
                { value: 1, label: "Negligible", description: "First Aid / No injury" },
                { value: 2, label: "Minor", description: "Minor Injury" },
                { value: 3, label: "Moderate", description: "Serious Injury / Occupational Disease" },
                { value: 4, label: "Major", description: "Single Fatality" },
                { value: 5, label: "Catastrophic", description: "Multiple Fatality" }
            ],
            likelihoodDefinitions: [
                { value: 1, label: "Very Unlikely", description: "Rare occurrence" },
                { value: 2, label: "Unlikely", description: "Could happen but rare" },
                { value: 3, label: "Possible", description: "Unusual but possible" },
                { value: 4, label: "Likely", description: "Quite probable" },
                { value: 5, label: "Almost Certain", description: "Expected to occur" }
            ],
            riskLevels: [
                { level: RISK_LEVELS.LOW, range: "1-5", color: "#00B050", action: "ECM" },
                { level: RISK_LEVELS.MEDIUM, range: "6-10", color: "#FFC000", action: "ECM + ACM" },
                { level: RISK_LEVELS.HIGH, range: "11-15", color: "#FF8000", action: "ECM + ACM" },
                { level: RISK_LEVELS.EXTREME, range: "16-25", color: "#FF0000", action: "Extreme High (Unacceptable)" }
            ],
            opportunityOptions: OPPORTUNITY_OPTIONS,
            legends: {
                L: "Likelihood",
                S: "Severity",
                RS: "Risk Score",
                RL: "Risk Level",
                ECM: "Existing Control Measures",
                ACM: "Additional Control Measures"
            }
        };

        return res.status(200).json({
            success: true,
            data: riskMatrix
        });

    } catch (error) {
        logger.error("Error fetching risk matrix:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   EXPORT TO PDF (PHASE 3)
// ============================================

/**
 * Export HIRA to PDF - Exact Template Format (Single Page)
 * GET /api/hira/:id/export/pdf
 */
exports.exportToPdf = async (req, res) => {
    try {
        const { id } = req.params;

        const hira = await HiraJsa.findById(id)
            .populate("createdBy", "name email")
            .lean();

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        // Create PDF document - Landscape A4
        const doc = new PDFDocument({
            size: "A4",
            layout: "landscape",
            margins: { top: 4, bottom: 4, left: 4, right: 4 },
            autoFirstPage: true,
            bufferPages: true // Allow multiple pages for large content
        });

        // Set response headers
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=HIRA_${hira.hiraNumber}.pdf`
        );

        doc.pipe(res);

        const pageWidth = 841.89;
        const pageHeight = 595.28;
        const margin = 8;
        const contentWidth = pageWidth - (margin * 2);

        // ========== RED HEADER ==========
        doc.rect(margin, margin, contentWidth, 22).fill("#C00000");
        doc.fontSize(14).font("Helvetica-Bold").fillColor("white")
            .text("HIRA TEMPLATE", margin, margin + 4, { width: contentWidth, align: "center" });

        // ========== MAIN TITLE ==========
        const titleY = margin + 24;
        doc.rect(margin, titleY, contentWidth, 16).fill("#FFF2CC").stroke("#000000");
        doc.fontSize(9).font("Helvetica-Bold").fillColor("black")
            .text("HAZARD IDENTIFICATION, RISK & OPPORTUNITY ASSESSMENT AND DETERMINING CONTROLS",
                margin, titleY + 3, { width: contentWidth, align: "center" });

        // ========== JOB HEADER FIELDS ==========
        const jobY = titleY + 18;
        const halfWidth = contentWidth / 2;
        const jobRowH = 14;
        const labelWidth = 75;

        // Row 1: Area (left) and Job Type (right)
        // AREA label
        doc.rect(margin, jobY, labelWidth, jobRowH).fill("#FFF2CC").stroke("#000000");
        doc.fontSize(7).font("Helvetica-Bold").fillColor("black");
        doc.text("AREA:", margin + 3, jobY + 3, { width: labelWidth - 6, continued: false });
        // AREA value
        doc.rect(margin + labelWidth, jobY, halfWidth - labelWidth - 3, jobRowH).stroke("#000000");
        doc.fontSize(7).font("Helvetica").fillColor("black");
        doc.text(hira.jobHeader.area || "", margin + labelWidth + 3, jobY + 3, { width: halfWidth - labelWidth - 9, continued: false });

        // JOB TYPE label
        doc.rect(margin + halfWidth, jobY, labelWidth, jobRowH).fill("#FFF2CC").stroke("#000000");
        doc.fontSize(7).font("Helvetica-Bold").fillColor("black");
        doc.text("JOB TYPE:", margin + halfWidth + 3, jobY + 3, { width: labelWidth - 6, continued: false });
        // JOB TYPE value
        doc.rect(margin + halfWidth + labelWidth, jobY, halfWidth - labelWidth - 3, jobRowH).stroke("#000000");
        doc.fontSize(7).font("Helvetica").fillColor("black");
        doc.text(hira.jobHeader.jobType || "", margin + halfWidth + labelWidth + 3, jobY + 3, { width: halfWidth - labelWidth - 9, continued: false });

        // Row 2: Job Details (full width)
        const row2Y = jobY + jobRowH;
        // JOB DETAILS label
        doc.rect(margin, row2Y, labelWidth, jobRowH).fill("#FFF2CC").stroke("#000000");
        doc.fontSize(7).font("Helvetica-Bold").fillColor("black");
        doc.text("JOB DETAILS:", margin + 3, row2Y + 3, { width: labelWidth - 6, continued: false });
        // JOB DETAILS value
        doc.rect(margin + labelWidth, row2Y, contentWidth - labelWidth, jobRowH).stroke("#000000");
        doc.fontSize(7).font("Helvetica").fillColor("black");
        doc.text(hira.jobHeader.jobDetails || "", margin + labelWidth + 3, row2Y + 3, { width: contentWidth - labelWidth - 9, continued: false });

        // Row 3: Prepared By (full width)
        const row3Y = jobY + (jobRowH * 2);
        // PREPARED BY label
        doc.rect(margin, row3Y, labelWidth, jobRowH).fill("#FFF2CC").stroke("#000000");
        doc.fontSize(7).font("Helvetica-Bold").fillColor("black");
        doc.text("PREPARED BY:", margin + 3, row3Y + 3, { width: labelWidth - 6, continued: false });
        // PREPARED BY value
        doc.rect(margin + labelWidth, row3Y, contentWidth - labelWidth, jobRowH).stroke("#000000");
        doc.fontSize(7).font("Helvetica").fillColor("black");
        doc.text(hira.jobHeader.preparedBy || "", margin + labelWidth + 3, row3Y + 3, { width: contentWidth - labelWidth - 9, continued: false });

        // ========== REFERENCE SECTION ==========
        const refY = jobY + (jobRowH * 3) + 5;
        const refTableWidth = 340;
        const legendWidth = 100;
        const matrixWidth = contentWidth - refTableWidth - legendWidth - 20;

        // === REFERENCE TABLE (Left) ===
        const refColW = [62, 22, 55, 22, 38, 75, 55]; // Total ~329
        const refHeaders = ["SEVERITY", "R", "LIKELI-HOOD", "R", "RS", "RISK LEVEL", "ACTION"];
        const refHdrH = 16;
        const refRowH = 13;

        let rx = margin;
        doc.fontSize(5.5).font("Helvetica-Bold");
        refHeaders.forEach((h, i) => {
            doc.rect(rx, refY, refColW[i], refHdrH).fill("#FFF2CC").stroke("#000000");
            doc.fillColor("black").text(h, rx + 2, refY + 4, { width: refColW[i] - 4, align: "center" });
            rx += refColW[i];
        });

        const refRows = [
            { sev: "MULTIPLE FATALITY", r1: "5", lik: "ALMOST CERTAIN", r2: "5", sc: "20-25", lv: "EXTREME HIGH", act: "ECM+ACM", clr: "#FF0000" },
            { sev: "SINGLE FATALITY", r1: "4", lik: "QUITE POSSIBLE", r2: "4", sc: "12-16", lv: "HIGH", act: "ECM+ACM", clr: "#FF8000" },
            { sev: "SERIOUS INJURY", r1: "3", lik: "UNUSUAL BUT POSSIBLE", r2: "3", sc: "5-10", lv: "MODERATE", act: "ECM+ACM", clr: "#FFC000" },
            { sev: "MINOR INJURY", r1: "2", lik: "UNLIKELY", r2: "2", sc: "1-4", lv: "LOW", act: "ECM", clr: "#00B050" },
            { sev: "FIRST AID", r1: "1", lik: "VERY UNLIKELY", r2: "1", sc: "", lv: "", act: "", clr: null }
        ];
        doc.fontSize(5).font("Helvetica");
        refRows.forEach((r, i) => {
            const ry = refY + refHdrH + (i * refRowH);
            rx = margin;

            doc.rect(rx, ry, refColW[0], refRowH).stroke("#000000");
            doc.fillColor("black").text(r.sev, rx + 2, ry + 3, { width: refColW[0] - 4 });
            rx += refColW[0];

            doc.rect(rx, ry, refColW[1], refRowH).stroke("#000000");
            doc.text(r.r1, rx, ry + 3, { width: refColW[1], align: "center" });
            rx += refColW[1];

            doc.rect(rx, ry, refColW[2], refRowH).stroke("#000000");
            doc.text(r.lik, rx + 2, ry + 3, { width: refColW[2] - 4 });
            rx += refColW[2];

            doc.rect(rx, ry, refColW[3], refRowH).stroke("#000000");
            doc.text(r.r2, rx, ry + 3, { width: refColW[3], align: "center" });
            rx += refColW[3];

            doc.rect(rx, ry, refColW[4], refRowH).stroke("#000000");
            doc.text(r.sc, rx, ry + 3, { width: refColW[4], align: "center" });
            rx += refColW[4];

            if (r.clr) {
                doc.rect(rx, ry, refColW[5], refRowH).fill(r.clr).stroke("#000000");
                doc.fillColor(r.clr === "#FFC000" ? "black" : "white");
            } else {
                doc.rect(rx, ry, refColW[5], refRowH).stroke("#000000");
                doc.fillColor("black");
            }
            doc.text(r.lv, rx + 2, ry + 3, { width: refColW[5] - 4, align: "center" });
            rx += refColW[5];

            doc.rect(rx, ry, refColW[6], refRowH).stroke("#000000");
            doc.fillColor("black").text(r.act, rx + 2, ry + 3, { width: refColW[6] - 4, align: "center" });
        });

        // Calculate reference table bottom
        const refTableBottom = refY + refHdrH + (5 * refRowH);

        // === LEGENDS (Middle) ===
        const legX = margin + refTableWidth + 8;
        const legRowH = 10;
        doc.rect(legX, refY, legendWidth, 14).fill("#FFF2CC").stroke("#000000");
        doc.fontSize(5).font("Helvetica-Bold").fillColor("black")
            .text("LEGENDS", legX, refY + 3, { width: legendWidth, align: "center" });

        const legs = ["L : LOW", "LIK : LIKELIHOOD", "M : MODERATE", "S : SEVERITY", "H : HIGH", "RS : RISK SCORE", "EH : EXTREME HIGH", "RL : RISK LEVEL"];
        doc.fontSize(5).font("Helvetica");
        legs.forEach((l, i) => {
            doc.rect(legX, refY + 14 + (i * legRowH), legendWidth, legRowH).stroke("#000000");
            doc.fillColor("black").text(l, legX + 3, refY + 16 + (i * legRowH));
        });
        const legendBottom = refY + 14 + (8 * legRowH);

        // === RISK RATING MATRIX (Right - Centered) ===
        const matX = legX + legendWidth + 8;
        const cellSz = 16;

        // Title bar spans the full matrixWidth
        doc.rect(matX, refY, matrixWidth, 14).fill("#FFF2CC").stroke("#000000");
        doc.fontSize(5).font("Helvetica-Bold").fillColor("black")
            .text("RISK RATING MATRIX", matX, refY + 3, { width: matrixWidth, align: "center" });

        const matStartY = refY + 16;

        // Calculate actual grid dimensions for centering
        const rowHeaderW = 12;           // width of the severity row headers
        const gridW = 5 * cellSz;        // 5 columns × 16px = 80px
        const totalGridW = rowHeaderW + gridW; // 92px total grid width
        // Center the grid horizontally within matrixWidth
        const gridOffsetX = Math.max(0, (matrixWidth - totalGridW) / 2);
        const matStartX = matX + gridOffsetX + rowHeaderW;

        // Column headers 1-5
        for (let c = 1; c <= 5; c++) {
            doc.rect(matStartX + ((c - 1) * cellSz), matStartY, cellSz, 10).fill("#808080").stroke("#000000");
            doc.fontSize(6).font("Helvetica-Bold").fillColor("white")
                .text(String(c), matStartX + ((c - 1) * cellSz), matStartY + 2, { width: cellSz, align: "center" });
        }

        // Row headers and cells
        for (let s = 5; s >= 1; s--) {
            const ri = 5 - s;
            doc.rect(matStartX - rowHeaderW, matStartY + 10 + (ri * cellSz), rowHeaderW, cellSz).fill("#808080").stroke("#000000");
            doc.fontSize(6).fillColor("white").text(String(s), matStartX - rowHeaderW, matStartY + 14 + (ri * cellSz), { width: rowHeaderW, align: "center" });

            for (let p = 1; p <= 5; p++) {
                const score = s * p;
                const clr = score >= 16 ? "#FF0000" : score >= 11 ? "#FF8000" : score >= 6 ? "#FFC000" : "#00B050";
                doc.rect(matStartX + ((p - 1) * cellSz), matStartY + 10 + (ri * cellSz), cellSz, cellSz)
                    .fill(clr).stroke("#000000");
                doc.fontSize(7).font("Helvetica-Bold").fillColor(clr === "#FFC000" ? "black" : "white")
                    .text(String(score), matStartX + ((p - 1) * cellSz), matStartY + 14 + (ri * cellSz), { width: cellSz, align: "center" });
            }
        }

        // Matrix legend below - also centered within matrixWidth
        const mLegY = matStartY + 10 + (5 * cellSz) + 2;
        const mLegItems = [{ t: "1-5", c: "#00B050" }, { t: "6-10", c: "#FFC000" }, { t: "11-15", c: "#FF8000" }, { t: "16-25", c: "#FF0000" }];
        const mLegTotalW = mLegItems.length * 24;  // total width of legend items
        const mLegOffsetX = matX + Math.max(0, (matrixWidth - mLegTotalW) / 2);
        mLegItems.forEach((ml, i) => {
            doc.rect(mLegOffsetX + (i * 24), mLegY, 22, 8).fill(ml.c);
            doc.fontSize(5).fillColor(ml.c === "#FFC000" ? "black" : "white").text(ml.t, mLegOffsetX + (i * 24), mLegY + 1, { width: 22, align: "center" });
        });
        const matrixBottom = mLegY + 8;

        // ========== DATA TABLE ==========
        // Position table below the tallest element in reference section
        const refSectionBottom = Math.max(refTableBottom, legendBottom, matrixBottom);
        const tblY = refSectionBottom + 5;

        // Define all possible columns with their base widths and data accessors
        const allColumns = [
            { key: "serialNo", header: "Sl.\nNo.", width: 24, group: null, getValue: (row) => row.serialNo },
            { key: "taskActivity", header: "TASK / ACTIVITY", width: 95, group: null, getValue: (row) => row.taskActivity },
            { key: "hazards", header: "HAZARDS", width: 80, group: null, getValue: (row) => (row.hazards || []).map(h => `• ${h}`).join("\n") },
            { key: "risks", header: "RISK", width: 70, group: null, getValue: (row) => (row.risks || []).map(r => `• ${r}`).join("\n") },
            { key: "ecm", header: "EXISTING CONTROL\nMEASURES (ECM)", width: 100, group: null, getValue: (row) => (row.existingControlMeasures || []).map(e => `• ${e}`).join("\n") },
            { key: "likelihood", header: "LIK", width: 22, group: "existing", getValue: (row) => row.likelihood },
            { key: "severity", header: "S", width: 22, group: "existing", getValue: (row) => row.severity },
            { key: "riskScore", header: "RS", width: 22, group: "existing", getValue: (row) => row.riskScore },
            { key: "riskLevel", header: "RL", width: 28, group: "existing", getValue: (row) => row.riskLevel ? row.riskLevel.charAt(0) : "" },
            { key: "opportunity", header: "OPPORTUNITY", width: 55, group: null, getValue: (row) => row.opportunity },
            { key: "acm", header: "ADDITIONAL CONTROL\nMEASURES (ACM)", width: 105, group: null, getValue: (row) => (row.additionalControlMeasures || []).map(a => `• ${a}`).join("\n") },
            { key: "residualLikelihood", header: "LIK", width: 22, group: "residual", getValue: (row) => row.residualLikelihood },
            { key: "residualSeverity", header: "S", width: 22, group: "residual", getValue: (row) => row.residualSeverity },
            { key: "residualRiskScore", header: "RS", width: 22, group: "residual", getValue: (row) => row.residualRiskScore },
            { key: "residualRiskLevel", header: "RL", width: 28, group: "residual", getValue: (row) => row.residualRiskLevel ? row.residualRiskLevel.charAt(0) : "" },
            { key: "responsibility", header: "Responsibility", width: 75, group: null, getValue: (row) => row.responsibility }
        ];

        // Determine which columns have data (always include serialNo)
        const columnsWithData = allColumns.filter((col, index) => {
            if (col.key === "serialNo") return true; // Always show serial number
            // Check if any row has data for this column
            return hira.rows.some(row => {
                const val = col.getValue(row);
                if (Array.isArray(val)) return val.length > 0;
                return val !== null && val !== undefined && val !== "" && val !== 0;
            });
        });

        // Calculate scaled widths to fill contentWidth
        const totalWidth = columnsWithData.reduce((sum, col) => sum + col.width, 0);
        const scale = contentWidth / totalWidth;
        const cw = columnsWithData.map(col => col.width * scale);

        // Header row
        let tx = margin;
        const hdrH = 22;
        doc.fontSize(5.5).font("Helvetica-Bold");

        // Check if we have existing or residual groups
        const hasExistingGroup = columnsWithData.some(c => c.group === "existing");
        const hasResidualGroup = columnsWithData.some(c => c.group === "residual");

        // Calculate group header positions and widths
        if (hasExistingGroup) {
            const existingCols = columnsWithData.filter(c => c.group === "existing");
            const existStartIdx = columnsWithData.findIndex(c => c.group === "existing");
            let existGrpX = margin;
            for (let i = 0; i < existStartIdx; i++) existGrpX += cw[i];
            const existGrpW = existingCols.reduce((sum, _, i) => sum + cw[existStartIdx + i], 0);

            doc.rect(existGrpX, tblY, existGrpW, 10).fill("#F4B183").stroke("#000000");
            doc.fillColor("black").text("EXISTING (RS/RL)", existGrpX, tblY + 2, { width: existGrpW, align: "center" });
        }

        if (hasResidualGroup) {
            const residualCols = columnsWithData.filter(c => c.group === "residual");
            const residStartIdx = columnsWithData.findIndex(c => c.group === "residual");
            let residGrpX = margin;
            for (let i = 0; i < residStartIdx; i++) residGrpX += cw[i];
            const residGrpW = residualCols.reduce((sum, _, i) => sum + cw[residStartIdx + i], 0);

            doc.rect(residGrpX, tblY, residGrpW, 10).fill("#F4B183").stroke("#000000");
            doc.fillColor("black").text("RESIDUAL", residGrpX, tblY + 2, { width: residGrpW, align: "center" });
        }

        // Draw individual column headers
        tx = margin;
        columnsWithData.forEach((col, i) => {
            const isSub = col.group === "existing" || col.group === "residual";
            const cy = isSub ? tblY + 10 : tblY;
            const ch = isSub ? 12 : hdrH;

            doc.rect(tx, cy, cw[i], ch).fill("#F4B183").stroke("#000000");
            doc.fontSize(5.5).font("Helvetica-Bold").fillColor("black");
            doc.text(col.header, tx + 2, cy + (isSub ? 2 : 4), { width: cw[i] - 4, align: "center" });
            tx += cw[i];
        });

        // Calculate available space for data rows - fill remaining page
        const signatureY = pageHeight - 18;
        const availableHeight = signatureY - (tblY + hdrH) - 4;

        // Calculate dynamic row height based on bullet point content + text wrapping
        // At font size 5, average char width is ~2.5px. lineHeight ~7px per visual line.
        const BULLET_FONT_SIZE = 5;
        const CHAR_WIDTH = 2.5; // approximate char width at font size 5
        const LINE_HEIGHT = 7;  // height per visual line (font + lineGap)
        const ROW_PADDING = 6;  // top + bottom padding

        // Estimate total visual lines for an array of items in a column
        const estimateLines = (items, colWidthPx) => {
            if (!items || items.length === 0) return 1;
            const usableWidth = colWidthPx - 4; // subtract cell padding
            const charsPerLine = Math.max(Math.floor(usableWidth / CHAR_WIDTH), 10);
            let totalLines = 0;
            items.forEach(item => {
                const bulletText = `• ${item}`;
                const linesForItem = Math.ceil(bulletText.length / charsPerLine);
                totalLines += Math.max(linesForItem, 1);
            });
            return totalLines;
        };

        // Map column keys to their scaled widths for height estimation
        const getScaledWidth = (key) => {
            const idx = columnsWithData.findIndex(c => c.key === key);
            return idx >= 0 ? cw[idx] : 80;
        };

        const getRowHeight = (row) => {
            const lineCounts = [
                estimateLines(row.hazards, getScaledWidth("hazards")),
                estimateLines(row.risks, getScaledWidth("risks")),
                estimateLines(row.existingControlMeasures, getScaledWidth("ecm")),
                estimateLines(row.additionalControlMeasures, getScaledWidth("acm"))
            ];
            const maxLines = Math.max(...lineCounts, 1);
            // LINE_HEIGHT per visual line + padding, minimum 28px
            return Math.max(28, maxLines * LINE_HEIGHT + ROW_PADDING);
        };

        let dy = tblY + hdrH;

        // Only render rows that have actual data
        const rowsToRender = hira.rows;

        // Helper to draw column headers on a new page
        const drawTableHeaders = (startY) => {
            let hx = margin;
            doc.fontSize(5.5).font("Helvetica-Bold");

            if (hasExistingGroup) {
                const existStartIdx = columnsWithData.findIndex(c => c.group === "existing");
                let existGrpX = margin;
                for (let i = 0; i < existStartIdx; i++) existGrpX += cw[i];
                const existingCols = columnsWithData.filter(c => c.group === "existing");
                const existGrpW = existingCols.reduce((sum, _, i) => sum + cw[existStartIdx + i], 0);
                doc.rect(existGrpX, startY, existGrpW, 10).fill("#F4B183").stroke("#000000");
                doc.fillColor("black").text("EXISTING (RS/RL)", existGrpX, startY + 2, { width: existGrpW, align: "center" });
            }

            if (hasResidualGroup) {
                const residStartIdx = columnsWithData.findIndex(c => c.group === "residual");
                let residGrpX = margin;
                for (let i = 0; i < residStartIdx; i++) residGrpX += cw[i];
                const residualCols = columnsWithData.filter(c => c.group === "residual");
                const residGrpW = residualCols.reduce((sum, _, i) => sum + cw[residStartIdx + i], 0);
                doc.rect(residGrpX, startY, residGrpW, 10).fill("#F4B183").stroke("#000000");
                doc.fillColor("black").text("RESIDUAL", residGrpX, startY + 2, { width: residGrpW, align: "center" });
            }

            hx = margin;
            columnsWithData.forEach((col, i) => {
                const isSub = col.group === "existing" || col.group === "residual";
                const cy = isSub ? startY + 10 : startY;
                const ch = isSub ? 12 : hdrH;
                doc.rect(hx, cy, cw[i], ch).fill("#F4B183").stroke("#000000");
                doc.fontSize(5.5).font("Helvetica-Bold").fillColor("black");
                doc.text(col.header, hx + 2, cy + (isSub ? 2 : 4), { width: cw[i] - 4, align: "center" });
                hx += cw[i];
            });

            return startY + hdrH;
        };

        const pageBottomLimit = pageHeight - 22; // leave space for signature

        rowsToRender.forEach((row) => {
            const rh = getRowHeight(row); // Dynamic row height

            // Check if this row would overflow the page
            if (dy + rh > pageBottomLimit) {
                doc.addPage();
                dy = drawTableHeaders(margin + 4);
            }

            tx = margin;
            doc.fontSize(6).font("Helvetica").fillColor("black");

            columnsWithData.forEach((col, i) => {
                const val = col.getValue(row);
                const displayVal = val !== null && val !== undefined ? String(val) : "";

                // Special coloring for risk level columns
                const isRiskCol = col.key === "riskLevel" || col.key === "residualRiskLevel";
                const riskLevel = col.key === "riskLevel" ? row.riskLevel : (col.key === "residualRiskLevel" ? row.residualRiskLevel : null);
                const cc = isRiskCol ? getRiskLevelColor(riskLevel) : null;

                if (cc && cc.hex) {
                    doc.rect(tx, dy, cw[i], rh).fill(cc.hex).stroke("#000000");
                    doc.fillColor("white");
                } else {
                    doc.rect(tx, dy, cw[i], rh).stroke("#000000");
                    doc.fillColor("black");
                }

                // Center align for small columns, left align for text columns
                const isSmallCol = col.group === "existing" || col.group === "residual" || col.key === "serialNo";
                const isBulletCol = col.key === "hazards" || col.key === "risks" || col.key === "ecm" || col.key === "acm";
                if (isSmallCol) {
                    doc.text(displayVal.substring(0, 10), tx, dy + (rh / 2) - 3, { width: cw[i], align: "center" });
                } else if (isBulletCol) {
                    doc.fontSize(5).text(displayVal, tx + 2, dy + 2, { width: cw[i] - 4, height: rh - 4, lineGap: 1 });
                    doc.fontSize(6); // Reset font size
                } else {
                    doc.text(displayVal, tx + 2, dy + 3, { width: cw[i] - 4, height: rh - 6 });
                }
                tx += cw[i];
            });

            dy += rh;
        });

        // ========== SIGNATURE ==========
        // Position signature right after the last row (with some spacing)
        const finalSignatureY = Math.min(dy + 10, signatureY);
        doc.fontSize(8).font("Helvetica-Bold").fillColor("black")
            .text("Signature", margin, finalSignatureY);
        doc.moveTo(margin + 55, finalSignatureY + 4).lineTo(margin + 180, finalSignatureY + 4).stroke();
        doc.end();
        logger.info(`HIRA ${hira.hiraNumber} exported to PDF`);

    } catch (error) {
        logger.error("Error exporting HIRA to PDF:", error);
        return res.status(500).json({
            success: false,
            message: "Error generating PDF"
        });
    }
};

// ============================================
//   EXPORT TO EXCEL (PHASE 3)
// ============================================

/**
 * Export HIRA to Excel
 * GET /api/hira/:id/export/excel
 */
exports.exportToExcel = async (req, res) => {
    try {
        const { id } = req.params;

        const hira = await HiraJsa.findById(id)
            .populate("createdBy", "name email")
            .lean();

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        // Create workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "E-Permit System";
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet("HIRA JSA", {
            pageSetup: { orientation: "landscape", fitToPage: true }
        });

        // Title Row
        worksheet.mergeCells("A1:O1");
        const titleCell = worksheet.getCell("A1");
        titleCell.value = "HAZARD IDENTIFICATION, RISK & OPPORTUNITY ASSESSMENT AND DETERMINING CONTROLS";
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: "center" };

        // Header Info
        worksheet.getCell("A3").value = `HIRA Number: ${hira.hiraNumber}`;
        worksheet.getCell("D3").value = `Area: ${hira.jobHeader.area}`;
        worksheet.getCell("H3").value = `Job Type: ${hira.jobHeader.jobType}`;
        worksheet.getCell("A4").value = `Job Details: ${hira.jobHeader.jobDetails}`;
        worksheet.getCell("H4").value = `Prepared By: ${hira.jobHeader.preparedBy}`;

        // Table Headers (Row 6)
        const headers = [
            "S.No", "Task/Activity", "Hazards", "Risks", "Existing Control Measures (ECM)",
            "L", "S", "RS", "RL", "Opportunity", "Additional Control Measures (ACM)",
            "Res.L", "Res.S", "Res.RS", "Res.RL", "Responsibility"
        ];

        const headerRow = worksheet.getRow(6);
        headers.forEach((header, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = header;
            cell.font = { bold: true };
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFE07020" }
            };
            cell.alignment = { horizontal: "center", wrapText: true };
            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" }
            };
        });

        // Data Rows
        hira.rows.forEach((row, index) => {
            const dataRow = worksheet.getRow(7 + index);

            const rowData = [
                row.serialNo,
                row.taskActivity || "",
                (row.hazards || []).join("\n"),
                (row.risks || []).join("\n"),
                (row.existingControlMeasures || []).join("\n"),
                row.likelihood,
                row.severity,
                row.riskScore,
                row.riskLevel || "",
                row.opportunity || "",
                (row.additionalControlMeasures || []).join("\n"),
                row.residualLikelihood || "",
                row.residualSeverity || "",
                row.residualRiskScore || "",
                row.residualRiskLevel || "",
                row.responsibility || ""
            ];

            rowData.forEach((data, i) => {
                const cell = dataRow.getCell(i + 1);
                cell.value = data;
                cell.alignment = { wrapText: true, vertical: "top" };
                cell.border = {
                    top: { style: "thin" },
                    left: { style: "thin" },
                    bottom: { style: "thin" },
                    right: { style: "thin" }
                };

                // Color code risk levels
                if (i === 8 || i === 14) { // RL or Res.RL columns
                    const color = getRiskLevelColor(data);
                    if (data) {
                        cell.fill = {
                            type: "pattern",
                            pattern: "solid",
                            fgColor: { argb: `FF${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}` }
                        };
                    }
                }
            });
        });

        // Column widths
        worksheet.columns = [
            { width: 5 },   // S.No
            { width: 25 },  // Task
            { width: 20 },  // Hazards
            { width: 20 },  // Risks
            { width: 25 },  // ECM
            { width: 5 },   // L
            { width: 5 },   // S
            { width: 5 },   // RS
            { width: 10 },  // RL
            { width: 15 },  // Opportunity
            { width: 25 },  // ACM
            { width: 6 },   // Res.L
            { width: 6 },   // Res.S
            { width: 6 },   // Res.RS
            { width: 10 },  // Res.RL
            { width: 15 }   // Responsibility
        ];

        // Add Risk Matrix Legend Sheet
        const legendSheet = workbook.addWorksheet("Risk Matrix Legend");
        legendSheet.getCell("A1").value = "RISK RATING MATRIX";
        legendSheet.getCell("A1").font = { bold: true, size: 14 };

        legendSheet.getCell("A3").value = "Risk Score = Likelihood × Severity";
        legendSheet.getCell("A5").value = "Severity Definitions:";
        legendSheet.getCell("A6").value = "1 - Negligible (First Aid)";
        legendSheet.getCell("A7").value = "2 - Minor Injury";
        legendSheet.getCell("A8").value = "3 - Moderate (Serious Injury)";
        legendSheet.getCell("A9").value = "4 - Major (Single Fatality)";
        legendSheet.getCell("A10").value = "5 - Catastrophic (Multiple Fatality)";

        legendSheet.getCell("C5").value = "Likelihood Definitions:";
        legendSheet.getCell("C6").value = "1 - Very Unlikely";
        legendSheet.getCell("C7").value = "2 - Unlikely";
        legendSheet.getCell("C8").value = "3 - Possible";
        legendSheet.getCell("C9").value = "4 - Likely";
        legendSheet.getCell("C10").value = "5 - Almost Certain";

        legendSheet.getCell("A12").value = "Risk Levels:";
        legendSheet.getCell("A13").value = "1-5: LOW";
        legendSheet.getCell("A13").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00B050" } };
        legendSheet.getCell("A14").value = "6-10: MEDIUM";
        legendSheet.getCell("A14").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } };
        legendSheet.getCell("A15").value = "11-15: HIGH";
        legendSheet.getCell("A15").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF8000" } };
        legendSheet.getCell("A16").value = "16-25: EXTREME";
        legendSheet.getCell("A16").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };

        // Set response headers
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=HIRA_${hira.hiraNumber}.xlsx`
        );

        await workbook.xlsx.write(res);
        res.end();

        logger.info(`HIRA ${hira.hiraNumber} exported to Excel`);

    } catch (error) {
        logger.error("Error exporting HIRA to Excel:", error);
        return res.status(500).json({
            success: false,
            message: "Error generating Excel file"
        });
    }
};

// ============================================
//   ADD ROW TO HIRA
// ============================================

/**
 * Add a new row to an existing HIRA
 * POST /api/hira/:id/rows
 */
exports.addRow = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const rowData = req.body;

        const hira = await HiraJsa.findById(id);

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        if (hira.isLocked) {
            return res.status(403).json({
                success: false,
                message: "Cannot modify a locked HIRA record"
            });
        }

        // Check ownership
        if (hira.createdBy.toString() !== userId.toString() && req.user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "You can only modify your own HIRA records"
            });
        }

        // Remove frontend-calculated values
        const { riskScore, riskLevel, residualRiskScore, residualRiskLevel, serialNo, ...cleanRowData } = rowData;

        // Validate required fields
        if (!cleanRowData.taskActivity) {
            return res.status(400).json({
                success: false,
                message: "Task/Activity is required"
            });
        }

        if (!cleanRowData.likelihood || !cleanRowData.severity) {
            return res.status(400).json({
                success: false,
                message: "Likelihood and Severity are required"
            });
        }

        // Add row with new serial number
        const newRow = {
            ...cleanRowData,
            serialNo: hira.rows.length + 1
        };

        hira.rows.push(newRow);
        hira.addAuditEntry("row_added", userId, { row: newRow });
        await hira.save();

        const updatedHira = await HiraJsa.findById(hira._id)
            .populate("createdBy", "name email")
            .lean();

        logger.info(`Row added to HIRA ${hira.hiraNumber} by user ${userId}`);

        return res.status(201).json({
            success: true,
            message: "Row added successfully",
            data: updatedHira,
            warnings: hira.validationWarnings
        });

    } catch (error) {
        logger.error("Error adding row to HIRA:", error);

        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors
            });
        }

        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   UPDATE SPECIFIC ROW
// ============================================

/**
 * Update a specific row in HIRA
 * PUT /api/hira/:id/rows/:rowId
 */
exports.updateRow = async (req, res) => {
    try {
        const { id, rowId } = req.params;
        const userId = req.user._id;
        const rowData = req.body;

        const hira = await HiraJsa.findById(id);

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        if (hira.isLocked) {
            return res.status(403).json({
                success: false,
                message: "Cannot modify a locked HIRA record"
            });
        }

        // Check ownership
        if (hira.createdBy.toString() !== userId.toString() && req.user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "You can only modify your own HIRA records"
            });
        }

        // Find the row
        const rowIndex = hira.rows.findIndex(r => r._id.toString() === rowId);
        if (rowIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Row not found"
            });
        }

        // Store previous values
        const previousRow = hira.rows[rowIndex].toObject();

        // Remove frontend-calculated values
        const { riskScore, riskLevel, residualRiskScore, residualRiskLevel, serialNo, ...cleanRowData } = rowData;

        // Update row while preserving serial number
        hira.rows[rowIndex] = {
            ...hira.rows[rowIndex].toObject(),
            ...cleanRowData,
            serialNo: previousRow.serialNo
        };

        hira.addAuditEntry("row_updated", userId, { row: cleanRowData }, { previousRow });
        await hira.save();

        const updatedHira = await HiraJsa.findById(hira._id)
            .populate("createdBy", "name email")
            .lean();

        logger.info(`Row ${rowId} updated in HIRA ${hira.hiraNumber} by user ${userId}`);

        return res.status(200).json({
            success: true,
            message: "Row updated successfully",
            data: updatedHira,
            warnings: hira.validationWarnings
        });

    } catch (error) {
        logger.error("Error updating row in HIRA:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   DELETE SPECIFIC ROW
// ============================================

/**
 * Delete a specific row from HIRA
 * DELETE /api/hira/:id/rows/:rowId
 */
exports.deleteRow = async (req, res) => {
    try {
        const { id, rowId } = req.params;
        const userId = req.user._id;

        const hira = await HiraJsa.findById(id);

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        if (hira.isLocked) {
            return res.status(403).json({
                success: false,
                message: "Cannot modify a locked HIRA record"
            });
        }

        // Check ownership
        if (hira.createdBy.toString() !== userId.toString() && req.user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "You can only modify your own HIRA records"
            });
        }

        // Find and remove the row
        const rowIndex = hira.rows.findIndex(r => r._id.toString() === rowId);
        if (rowIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Row not found"
            });
        }

        const deletedRow = hira.rows[rowIndex].toObject();
        hira.rows.splice(rowIndex, 1);

        // Re-number remaining rows
        hira.rows.forEach((row, index) => {
            row.serialNo = index + 1;
        });

        hira.addAuditEntry("row_deleted", userId, null, { deletedRow });
        await hira.save();

        const updatedHira = await HiraJsa.findById(hira._id)
            .populate("createdBy", "name email")
            .lean();

        logger.info(`Row ${rowId} deleted from HIRA ${hira.hiraNumber} by user ${userId}`);

        return res.status(200).json({
            success: true,
            message: "Row deleted successfully",
            data: updatedHira
        });

    } catch (error) {
        logger.error("Error deleting row from HIRA:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   SET DEFAULT HIRA
// ============================================

/**
 * Set a HIRA as the default template for permits
 * POST /api/hira/:id/set-default
 */
exports.setDefaultHira = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const hira = await HiraJsa.findById(id);

        if (!hira) {
            return res.status(404).json({
                success: false,
                message: "HIRA not found"
            });
        }

        // Only admin or creator can set default
        if (hira.createdBy.toString() !== userId.toString() && req.user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to set this HIRA as default"
            });
        }

        // If already default, toggle off
        if (hira.isDefault) {
            hira.isDefault = false;
            await hira.save();

            logger.info(`HIRA ${hira.hiraNumber} unset as default by user ${userId}`);

            return res.status(200).json({
                success: true,
                message: "HIRA unset as default",
                data: hira
            });
        }

        // Unset any existing default HIRA (only one default at a time)
        await HiraJsa.updateMany(
            { isDefault: true },
            { $set: { isDefault: false } }
        );

        // Set this one as default
        hira.isDefault = true;
        await hira.save();

        logger.info(`HIRA ${hira.hiraNumber} set as default by user ${userId}`);

        return res.status(200).json({
            success: true,
            message: "HIRA set as default successfully",
            data: hira
        });

    } catch (error) {
        logger.error("Error setting default HIRA:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};

// ============================================
//   GET DEFAULT HIRA
// ============================================

/**
 * Get the default HIRA template
 * GET /api/hira/default
 */
exports.getDefaultHira = async (req, res) => {
    try {
        const hira = await HiraJsa.findOne({ isDefault: true })
            .populate("createdBy", "name email")
            .lean();

        if (!hira) {
            return res.status(200).json({
                success: true,
                message: "No default HIRA set",
                data: null
            });
        }

        return res.status(200).json({
            success: true,
            message: "Default HIRA fetched successfully",
            data: hira
        });

    } catch (error) {
        logger.error("Error fetching default HIRA:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
        });
    }
};
