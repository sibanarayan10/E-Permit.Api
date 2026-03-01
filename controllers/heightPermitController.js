const HeightPermit = require("../models/HeightPermit");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
    PERMIT_STATUS,
    WORKFLOW_STAGES,
    NOTIFICATION_TYPES,
    RESPONSE_MESSAGES,
    PERMIT_NUMBER_CONFIG,
    LOCATIONS,
    SUB_LOCATIONS,
} = require("../config/constants");
const logger = require("../utils/logger");
const { sendTemplateEmail, buildPermitEmailData, EMAIL_TEMPLATES } = require("../services/emailService");
const { sendSms, buildPermitSmsData, SMS_EVENTS } = require("../services/smsService");

// Helper function to create notification
const createNotification = async (
    type,
    title,
    message,
    permit,
    recipientId,
    createdBy,
    metadata = {}
) => {
    try {
        const notification = new Notification({
            type,
            title,
            message,
            permitId: permit._id,
            permitNumber: permit.permitNumber,
            createdBy,
            recipient: recipientId,
            metadata,
        });
        await notification.save();
        return notification;
    } catch (error) {
        logger.error("Error creating notification:", error);
    }
};

// Generate automatic permit number for Height Permits
const generateHeightPermitNumber = async () => {
    try {
        const currentYear = new Date().getFullYear();

        // Find the latest height permit for this year
        const latestPermit = await HeightPermit.findOne({
            permitNumber: new RegExp(
                `^HT${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}`
            ),
        }).sort({ createdAt: -1 });

        let sequence = 1;
        if (latestPermit && latestPermit.permitNumber) {
            const parts = latestPermit.permitNumber.split(
                PERMIT_NUMBER_CONFIG.SEPARATOR
            );
            if (parts.length === 3) {
                sequence = parseInt(parts[2]) + 1;
            }
        }

        return `HT${PERMIT_NUMBER_CONFIG.SEPARATOR
            }${currentYear}${PERMIT_NUMBER_CONFIG.SEPARATOR}${sequence
                .toString()
                .padStart(4, "0")}`;
    } catch (error) {
        logger.error("Error generating height permit number:", error);
        // Fallback with timestamp
        return `HT${PERMIT_NUMBER_CONFIG.SEPARATOR
            }${new Date().getFullYear()}${PERMIT_NUMBER_CONFIG.SEPARATOR}${Date.now()
                .toString()
                .slice(-4)}`;
    }
};

// Generate automatic protocol number for Height Permits (SHARED SEQUENCE WITH GENERAL PERMITS)
const generateHeightProtocolNumber = async () => {
    try {
        const GeneralWorkPermit = require("../models/GeneralWorkPermit");
        const currentYear = new Date().getFullYear();

        // Find the latest protocol number from BOTH General and Height permits
        const latestGeneralPermit = await GeneralWorkPermit.findOne({
            protocolNumber: new RegExp(`^PROT${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}`),
        }).sort({ createdAt: -1 });

        const latestHeightPermit = await HeightPermit.findOne({
            protocolNumber: new RegExp(`^PROT${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}`),
        }).sort({ createdAt: -1 });

        // Extract sequence numbers from both
        let generalSequence = 0;
        let heightSequence = 0;

        if (latestGeneralPermit && latestGeneralPermit.protocolNumber) {
            const parts = latestGeneralPermit.protocolNumber.split(PERMIT_NUMBER_CONFIG.SEPARATOR);
            if (parts.length === 3) {
                generalSequence = parseInt(parts[2]) || 0;
            }
        }

        if (latestHeightPermit && latestHeightPermit.protocolNumber) {
            const parts = latestHeightPermit.protocolNumber.split(PERMIT_NUMBER_CONFIG.SEPARATOR);
            if (parts.length === 3) {
                heightSequence = parseInt(parts[2]) || 0;
            }
        }

        // Use the maximum + 1 as the next sequence
        const nextSequence = Math.max(generalSequence, heightSequence) + 1;

        return `PROT${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}${PERMIT_NUMBER_CONFIG.SEPARATOR}${nextSequence.toString().padStart(4, "0")}`;
    } catch (error) {
        logger.error("Error generating height protocol number:", error);
        // Fallback with timestamp
        return `PROT${PERMIT_NUMBER_CONFIG.SEPARATOR}${new Date().getFullYear()}${PERMIT_NUMBER_CONFIG.SEPARATOR}${Date.now().toString().slice(-4)}`;
    }
};

// Generate automatic SR number for Height Permits
const generateHeightSRNumber = async () => {
    try {
        const currentYear = new Date().getFullYear();

        // Find the latest height permit for SR number
        const latestPermit = await HeightPermit.findOne({
            srNo: new RegExp(`^HTSR${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}`),
        }).sort({ createdAt: -1 });

        let sequence = 1;
        if (latestPermit && latestPermit.srNo) {
            const parts = latestPermit.srNo.split(PERMIT_NUMBER_CONFIG.SEPARATOR);
            if (parts.length === 3) {
                sequence = parseInt(parts[2]) + 1;
            }
        }

        return `HTSR${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}${PERMIT_NUMBER_CONFIG.SEPARATOR
            }${sequence.toString().padStart(4, "0")}`;
    } catch (error) {
        logger.error("Error generating height SR number:", error);
        // Fallback with timestamp
        return `HTSR${PERMIT_NUMBER_CONFIG.SEPARATOR}${new Date().getFullYear()}${PERMIT_NUMBER_CONFIG.SEPARATOR
            }${Date.now().toString().slice(-4)}`;
    }
};

// Get available executors for assignment
exports.getAvailableExecutors = async (req, res) => {
    try {
        const executors = await User.find({
            workflowStage: WORKFLOW_STAGES.EXECUTION,
            isActive: true,
        }).select("name email _id workflowStage");

        logger.info(`Fetched ${executors.length} available executors for height permit`);

        return res.status(200).json({
            success: true,
            data: executors,
        });
    } catch (error) {
        logger.error("Error fetching available executors:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Get available issuers for assignment
exports.getAvailableIssuers = async (req, res) => {
    try {
        const issuers = await User.find({
            workflowStage: WORKFLOW_STAGES.ISSUER,
            isActive: true,
        }).select("name email _id workflowStage");

        logger.info(`Fetched ${issuers.length} available issuers for height permit`);

        return res.status(200).json({
            success: true,
            data: issuers,
        });
    } catch (error) {
        logger.error("Error fetching available issuers:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Get height permits for current user based on their workflow stage
exports.getMyHeightPermits = async (req, res) => {
    try {
        const user = req.user;
        const { stage, status } = req.query;

        let query = {};

        // Filter based on workflow stage and assignments
        if (user.workflowStage === WORKFLOW_STAGES.INITIATOR) {
            // Initiators see permits they created
            query.createdBy = user._id;
        } else if (user.workflowStage === WORKFLOW_STAGES.EXECUTION) {
            // Executors see ALL permits assigned to them
            query.assignedExecutor = user._id;
        } else if (user.workflowStage === WORKFLOW_STAGES.ISSUER) {
            // Issuers see ALL permits assigned to them
            query.assignedIssuer = user._id;
        }

        // Override for stage parameter (for admin/viewing purposes)
        if (stage && user.role === "ADMIN") {
            query = { workflowStage: stage };
        }

        // Filter by status if provided
        if (status) {
            query.status = status;
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const permits = await HeightPermit.find(query)
            .populate("createdBy", "name email workflowStage")
            .populate("assignedExecutor", "name email workflowStage")
            .populate("assignedIssuer", "name email workflowStage")
            .populate("executionApproval.approvedBy", "name email")
            .populate("issuerApproval.approvedBy", "name email")
            .populate("pendingRenewal.requestedBy", "name email")
            .populate("pendingRenewal.executorApproval.approvedBy", "name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await HeightPermit.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            success: true,
            message: "Height permits fetched successfully",
            data: {
                permits,
                pagination: {
                    current: page,
                    total: totalPages,
                    count: permits.length,
                    totalRecords: total,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                },
            },
        });
    } catch (error) {
        logger.error("Error fetching height permits:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Get height permit by ID
exports.getHeightPermitById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const permit = await HeightPermit.findById(id)
            .populate("createdBy", "name email workflowStage")
            .populate("assignedExecutor", "name email workflowStage")
            .populate("assignedIssuer", "name email workflowStage")
            .populate("executionApproval.approvedBy", "name email")
            .populate("issuerApproval.approvedBy", "name email")
            .populate("pendingRenewal.requestedBy", "name email")
            .populate("pendingRenewal.executorApproval.approvedBy", "name email");

        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Height permit fetched successfully",
            data: permit,
        });
    } catch (error) {
        logger.error("Error fetching height permit:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Get next permit numbers
exports.getNextHeightPermitNumbers = async (req, res) => {
    try {
        const permitNumber = await generateHeightPermitNumber();
        const protocolNumber = await generateHeightProtocolNumber();
        const srNo = await generateHeightSRNumber();

        return res.status(200).json({
            success: true,
            message: "Next height permit numbers fetched successfully",
            data: {
                permitNumber,
                protocolNumber,
                srNo,
            },
        });
    } catch (error) {
        logger.error("Error generating next height permit numbers:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Create height permit
exports.createHeightPermit = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Only Initiators can create permits
        if (user.workflowStage !== WORKFLOW_STAGES.INITIATOR) {
            return res.status(403).json({
                success: false,
                message: "Only Initiators can create height permits",
            });
        }

        const {
            permitNumber,
            protocolNumber,
            srNo,
            ...permitData
        } = req.body;

        logger.info("Creating new height permit", {
            userId,
            permitNumber: permitNumber || "auto-generated",
        });

        // Auto-generate numbers if not provided
        const autoPermitNumber = permitNumber || (await generateHeightPermitNumber());
        const autoProtocolNumber = protocolNumber || (await generateHeightProtocolNumber());
        const autoSrNo = srNo || (await generateHeightSRNumber());

        // Check if permit number already exists
        const existingPermit = await HeightPermit.findOne({
            permitNumber: autoPermitNumber,
        });
        if (existingPermit) {
            return res.status(409).json({
                success: false,
                message: "Permit number already exists",
            });
        }


        // Create the height permit with safe string handling
        const permit = new HeightPermit({
            permitNumber: String(autoPermitNumber || '').trim().toUpperCase() || 'HT-ERROR',
            protocolNumber: String(autoProtocolNumber || '').trim() || '',
            srNo: String(autoSrNo || '').trim() || '',
            createdBy: userId,
            workflowStage: WORKFLOW_STAGES.INITIATOR,
            status: PERMIT_STATUS.DRAFT,
            ...permitData,
        });


        await permit.save();

        // Create notification for permit creation
        await createNotification(
            NOTIFICATION_TYPES.PERMIT_CREATED,
            "New Height Permit Created",
            `Height Permit ${permit.permitNumber} has been created`,
            permit,
            userId,
            userId
        );

        const populatedPermit = await HeightPermit.findById(
            permit._id
        ).populate("createdBy", "name email workflowStage");

        logger.info(`Height Permit ${permit.permitNumber} created by ${user.email}`);

        // Send email to initiator about permit creation
        sendTemplateEmail(
            EMAIL_TEMPLATES.PERMIT_CREATED,
            user.email,
            buildPermitEmailData(permit, {
                initiatorName: user.name,
                recipientName: user.name,
                permitType: "Height"
            }),
            user.name
        );

        // Send SMS notification for height permit creation (fire-and-forget)
        if (user.phone) {
            sendSms(SMS_EVENTS.PERMIT_CREATED, user.phone, buildPermitSmsData(permit, {
                Name: user.name
            }));
        }

        return res.status(201).json({
            success: true,
            message: "Height permit created successfully",
            data: populatedPermit,
        });
    } catch (error) {
        logger.error("Height permit creation error:", {
            error: error.message,
            stack: error.stack,
        });

        // Mongoose validation errors
        if (error.name === "ValidationError") {
            const errors = Object.values(error.errors).map((err) => err.message);
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: errors,
            });
        }

        // Mongoose duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Duplicate entry found",
                field: Object.keys(error.keyValue)[0],
            });
        }

        // General server error
        return res.status(500).json({
            success: false,
            message: "Internal server error: " + error.message,
        });
    }
};

// Update height permit (only by initiator when in initiator stage)
exports.updateHeightPermit = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const user = req.user;

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Check if user is the creator and permit is in initiator stage
        if (
            permit.createdBy.toString() !== user._id.toString() ||
            permit.workflowStage !== WORKFLOW_STAGES.INITIATOR
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Only the initiator creator can update permits in initiator stage",
            });
        }

        const updatedPermit = await HeightPermit.findByIdAndUpdate(
            id,
            updates,
            { new: true, runValidators: true }
        ).populate("createdBy", "name email workflowStage");

        // Create notification for permit update
        await createNotification(
            NOTIFICATION_TYPES.PERMIT_UPDATED,
            "Height Permit Updated",
            `Height Permit ${permit.permitNumber} has been updated`,
            updatedPermit,
            user._id,
            user._id
        );

        logger.info(`Height Permit ${permit.permitNumber} updated by ${user.email}`);

        return res.status(200).json({
            success: true,
            message: "Height permit updated successfully",
            data: updatedPermit,
        });
    } catch (error) {
        logger.error("Error updating height permit:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Submit to execution with executor assignment
exports.submitToExecution = async (req, res) => {
    try {
        const { id } = req.params;
        const { assignedExecutorId } = req.body;
        const user = req.user;

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Check if user is the creator and an Initiator
        if (
            permit.createdBy.toString() !== user._id.toString() ||
            user.workflowStage !== WORKFLOW_STAGES.INITIATOR
        ) {
            return res.status(403).json({
                success: false,
                message: "Only the initiator creator can submit to execution",
            });
        }

        // Validate executor assignment
        if (!assignedExecutorId) {
            return res.status(400).json({
                success: false,
                message: "Executor assignment is required. Please select an executor.",
            });
        }

        const assignedExecutor = await User.findOne({
            _id: assignedExecutorId,
            workflowStage: WORKFLOW_STAGES.EXECUTION,
            isActive: true,
        });

        if (!assignedExecutor) {
            return res.status(400).json({
                success: false,
                message: "Invalid executor assignment. User must be an active Executor.",
            });
        }

        // Update permit with assignment
        permit.workflowStage = WORKFLOW_STAGES.EXECUTION;
        permit.status = PERMIT_STATUS.PENDING_EXECUTION;
        permit.assignedExecutor = assignedExecutorId;
        permit.assignedExecutorAt = new Date();
        permit.assignedExecutorBy = user._id;
        await permit.save();

        // Notify ONLY the assigned executor
        await createNotification(
            NOTIFICATION_TYPES.PERMIT_FORWARDED,
            "Height Permit Assigned to You",
            `Height Permit ${permit.permitNumber} has been assigned to you for execution review`,
            permit,
            assignedExecutorId,
            user._id,
            {
                fromStage: WORKFLOW_STAGES.INITIATOR,
                toStage: WORKFLOW_STAGES.EXECUTION,
                assignedBy: user.name,
            }
        );

        logger.info(`Height Permit ${permit.permitNumber} submitted to execution by ${user.email}`);

        // Send email notification
        sendTemplateEmail(
            EMAIL_TEMPLATES.PERMIT_FORWARDED,
            assignedExecutor.email,
            buildPermitEmailData(permit, {
                initiatorName: user.name,
                recipientName: assignedExecutor.name,
                permitType: "Height"
            }),
            assignedExecutor.name
        );

        // Send SMS notification to executor (fire-and-forget)
        if (assignedExecutor.phone) {
            sendSms(SMS_EVENTS.PERMIT_ASSIGNED_TO_EXECUTOR, assignedExecutor.phone, buildPermitSmsData(permit, {
                Name: assignedExecutor.name,
                Initiator: user.name
            }));
        }

        return res.status(200).json({
            success: true,
            message: "Height permit submitted to execution successfully",
            data: permit,
        });
    } catch (error) {
        logger.error("Error submitting height permit to execution:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Execution approve with issuer assignment
exports.executionApprove = async (req, res) => {
    try {
        const { id } = req.params;
        const { assignedIssuerId, isRenewalApproval, comments, ...executionData } = req.body;
        const user = req.user;

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Check if user is assigned executor
        if (permit.assignedExecutor.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Only the assigned executor can approve this permit",
            });
        }

        // =============================================
        //   CHECK IF THIS IS A RENEWAL APPROVAL
        // =============================================
        const isRenewal = permit.pendingRenewal && permit.pendingRenewal.isActive;

        if (isRenewal || isRenewalApproval) {
            // RENEWAL APPROVAL - Forward to issuer for final approval

            // Record executor approval on the pending renewal
            permit.pendingRenewal.executorApproval = {
                approved: true,
                approvedBy: user._id,
                approvedAt: new Date(),
                comments: comments || "",
            };

            // Forward to issuer (keep existing issuer or assign new one)
            const targetIssuerId = assignedIssuerId || permit.assignedIssuer;

            if (!targetIssuerId) {
                return res.status(400).json({
                    success: false,
                    message: "Issuer assignment is required for renewal approval",
                });
            }

            permit.workflowStage = WORKFLOW_STAGES.ISSUER;
            permit.status = PERMIT_STATUS.PENDING_ISSUER;
            permit.assignedIssuer = targetIssuerId;
            permit.assignedIssuerAt = new Date();
            permit.assignedIssuerBy = user._id;

            await permit.save();

            // Notify issuer about renewal approval needed
            await createNotification(
                NOTIFICATION_TYPES.RENEWAL_FORWARDED,
                "Height Permit Renewal - Awaiting Your Approval",
                `Height Permit ${permit.permitNumber} renewal has been approved by executor and requires your final approval`,
                permit,
                targetIssuerId,
                user._id
            );

            logger.info(`Height Permit ${permit.permitNumber} renewal approved by executor ${user.email}`);

            const populatedPermit = await HeightPermit.findById(permit._id)
                .populate("createdBy", "name email workflowStage")
                .populate("assignedExecutor", "name email workflowStage")
                .populate("assignedIssuer", "name email workflowStage");

            return res.status(200).json({
                success: true,
                message: "Renewal approved and forwarded to issuer for final approval",
                data: populatedPermit,
            });
        }

        // =============================================
        //   REGULAR (NON-RENEWAL) APPROVAL
        // =============================================

        // Validate issuer assignment
        if (!assignedIssuerId) {
            return res.status(400).json({
                success: false,
                message: "Issuer assignment is required",
            });
        }

        const assignedIssuer = await User.findOne({
            _id: assignedIssuerId,
            workflowStage: WORKFLOW_STAGES.ISSUER,
            isActive: true,
        });

        if (!assignedIssuer) {
            return res.status(400).json({
                success: false,
                message: "Invalid issuer assignment",
            });
        }

        // Update permit
        permit.workflowStage = WORKFLOW_STAGES.ISSUER;
        permit.status = PERMIT_STATUS.PENDING_ISSUER;
        permit.assignedIssuer = assignedIssuerId;
        permit.assignedIssuerAt = new Date();
        permit.assignedIssuerBy = user._id;
        permit.executionApproval = {
            approved: true,
            approvedBy: user._id,
            approvedAt: new Date(),
            ...executionData,
        };
        await permit.save();

        // Notify issuer
        await createNotification(
            NOTIFICATION_TYPES.PERMIT_FORWARDED,
            "Height Permit Assigned to You",
            `Height Permit ${permit.permitNumber} has been assigned to you for issuer review`,
            permit,
            assignedIssuerId,
            user._id,
            {
                fromStage: WORKFLOW_STAGES.EXECUTION,
                toStage: WORKFLOW_STAGES.ISSUER,
                assignedBy: user.name,
            }
        );

        logger.info(`Height Permit ${permit.permitNumber} approved by executor ${user.email}`);

        // Send email notification
        sendTemplateEmail(
            EMAIL_TEMPLATES.PERMIT_FORWARDED,
            assignedIssuer.email,
            buildPermitEmailData(permit, {
                initiatorName: user.name,
                recipientName: assignedIssuer.name,
                permitType: "Height"
            }),
            assignedIssuer.name
        );

        return res.status(200).json({
            success: true,
            message: "Height permit approved by executor successfully",
            data: permit,
        });
    } catch (error) {
        logger.error("Error in execution approval:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Execution return
exports.executionReturn = async (req, res) => {
    try {
        const { id } = req.params;
        const { returnReason } = req.body;
        const user = req.user;

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Check if user is assigned executor
        if (permit.assignedExecutor.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Only the assigned executor can return this permit",
            });
        }

        // Return to initiator
        permit.workflowStage = WORKFLOW_STAGES.INITIATOR;
        permit.status = PERMIT_STATUS.RETURNED;
        await permit.save();

        // Notify initiator
        await createNotification(
            NOTIFICATION_TYPES.PERMIT_RETURNED,
            "Height Permit Returned",
            `Height Permit ${permit.permitNumber} has been returned: ${returnReason}`,
            permit,
            permit.createdBy,
            user._id,
            { returnReason }
        );

        logger.info(`Height Permit ${permit.permitNumber} returned by executor ${user.email}`);

        return res.status(200).json({
            success: true,
            message: "Height permit returned successfully",
            data: permit,
        });
    } catch (error) {
        logger.error("Error returning height permit:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Issuer approve
exports.issuerApprove = async (req, res) => {
    try {
        const { id } = req.params;
        const issuerData = req.body;
        const user = req.user;
        const { isRenewalApproval } = req.body;

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Check if user is assigned issuer
        if (permit.assignedIssuer.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Only the assigned issuer can approve this permit",
            });
        }

        // =============================================
        //   CHECK IF THIS IS A RENEWAL APPROVAL
        // =============================================
        const isRenewal = permit.pendingRenewal && permit.pendingRenewal.isActive;

        if (isRenewal || isRenewalApproval) {
            // RENEWAL FINAL APPROVAL - Actually update the permit schedule NOW

            // Validate that executor has approved the renewal
            if (!permit.pendingRenewal.executorApproval || !permit.pendingRenewal.executorApproval.approved) {
                return res.status(400).json({
                    success: false,
                    message: "Renewal must be approved by executor first",
                });
            }

            // 🔑 KEY: Store previous period BEFORE overwriting
            const originalStartHrs = permit.schedule?.startTimeDate?.hrs;
            const originalFinishHrs = permit.schedule?.finishTimeDate?.hrs;

            permit.pendingRenewal.previousPeriod = {
                from: {
                    date: permit.schedule?.startTimeDate?.date,
                    hrs: originalStartHrs,
                },
                to: {
                    date: permit.schedule?.finishTimeDate?.date,
                    hrs: originalFinishHrs,
                },
            };

            // 🔑 KEY: Copy new period from pendingRenewal to actual schedule
            permit.schedule = {
                startTimeDate: {
                    date: permit.pendingRenewal.from.date,
                    hrs: permit.pendingRenewal.from.hrs || originalStartHrs,
                },
                finishTimeDate: {
                    date: permit.pendingRenewal.to.date,
                    hrs: permit.pendingRenewal.to.hrs || originalFinishHrs,
                },
            };

            // Mark as renewed
            permit.isRenewed = true;
            permit.renewalReason = permit.pendingRenewal.renewalReason;

            // Record issuer approval for the renewal
            permit.pendingRenewal.issuerApproval = {
                approved: true,
                approvedBy: user._id,
                approvedAt: new Date(),
            };

            // Clear pending renewal (deactivate it)
            permit.pendingRenewal.isActive = false;

            // Restore permit to approved status
            permit.status = PERMIT_STATUS.APPROVED;

            // Mark nested objects as modified so Mongoose detects the changes
            permit.markModified('schedule');
            permit.markModified('pendingRenewal');

            await permit.save();

            // Notify initiator about successful renewal
            await createNotification(
                NOTIFICATION_TYPES.PERMIT_RENEWED,
                "Height Permit Renewal Approved",
                `Your Height Permit ${permit.permitNumber} renewal has been approved. New validity period is now active.`,
                permit,
                permit.createdBy,
                user._id
            );

            logger.info(`Height Permit ${permit.permitNumber} renewal approved by issuer ${user.email}`);

            const populatedPermit = await HeightPermit.findById(permit._id)
                .populate("createdBy", "name email workflowStage")
                .populate("assignedExecutor", "name email workflowStage")
                .populate("assignedIssuer", "name email workflowStage");

            return res.status(200).json({
                success: true,
                message: "Height permit renewal approved - Period updated successfully",
                data: populatedPermit,
            });
        }

        // =============================================
        //   REGULAR (NON-RENEWAL) APPROVAL
        // =============================================
        permit.status = PERMIT_STATUS.APPROVED;
        permit.issuerApproval = {
            approved: true,
            approvedBy: user._id,
            approvedAt: new Date(),
            ...issuerData,
        };
        await permit.save();

        // Notify initiator
        await createNotification(
            NOTIFICATION_TYPES.PERMIT_APPROVED,
            "Height Permit Approved",
            `Height Permit ${permit.permitNumber} has been approved`,
            permit,
            permit.createdBy,
            user._id
        );

        logger.info(`Height Permit ${permit.permitNumber} approved by issuer ${user.email}`);

        return res.status(200).json({
            success: true,
            message: "Height permit approved successfully",
            data: permit,
        });
    } catch (error) {
        logger.error("Error in issuer approval:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Issuer return
exports.issuerReturn = async (req, res) => {
    try {
        const { id } = req.params;
        const { returnReason, returnToStage } = req.body;
        const user = req.user;

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Check if user is assigned issuer
        if (permit.assignedIssuer.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Only the assigned issuer can return this permit",
            });
        }

        // Determine return stage
        const targetStage = returnToStage === WORKFLOW_STAGES.INITIATOR
            ? WORKFLOW_STAGES.INITIATOR
            : WORKFLOW_STAGES.EXECUTION;

        permit.workflowStage = targetStage;
        permit.status = PERMIT_STATUS.RETURNED;
        await permit.save();

        // Notify appropriate person
        const recipientId = targetStage === WORKFLOW_STAGES.INITIATOR
            ? permit.createdBy
            : permit.assignedExecutor;

        await createNotification(
            NOTIFICATION_TYPES.PERMIT_RETURNED,
            "Height Permit Returned",
            `Height Permit ${permit.permitNumber} has been returned: ${returnReason}`,
            permit,
            recipientId,
            user._id,
            { returnReason, returnToStage: targetStage }
        );

        logger.info(`Height Permit ${permit.permitNumber} returned by issuer ${user.email}`);

        return res.status(200).json({
            success: true,
            message: "Height permit returned successfully",
            data: permit,
        });
    } catch (error) {
        logger.error("Error returning height permit:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Get height permit statistics
exports.getHeightPermitStats = async (req, res) => {
    try {
        const user = req.user;

        let query = {};

        // Filter based on user role
        if (user.workflowStage === WORKFLOW_STAGES.INITIATOR) {
            query.createdBy = user._id;
        } else if (user.workflowStage === WORKFLOW_STAGES.EXECUTION) {
            query.assignedExecutor = user._id;
        } else if (user.workflowStage === WORKFLOW_STAGES.ISSUER) {
            query.assignedIssuer = user._id;
        }

        const stats = await HeightPermit.aggregate([
            { $match: query },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                },
            },
        ]);

        // Transform to object format
        const statusCounts = {};
        stats.forEach((stat) => {
            statusCounts[stat._id] = stat.count;
        });

        // Calculate total
        const total = stats.reduce((sum, stat) => sum + stat.count, 0);

        return res.status(200).json({
            success: true,
            message: "Height permit statistics fetched successfully",
            data: {
                ...statusCounts,
                total,
            },
        });
    } catch (error) {
        logger.error("Error fetching height permit stats:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// Download height permit PDF (Backend PDF generation)
exports.downloadHeightPermitPDF = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Import PDF service
        const { generateHeightPermitPDF } = require("../services/heightPermitPdfService");

        // Generate and stream PDF
        await generateHeightPermitPDF(id, res);

        logger.info(`Height Permit PDF downloaded: ${permit.permitNumber} by ${user.email}`);
    } catch (error) {
        logger.error("Error downloading height permit PDF:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate PDF: " + error.message,
        });
    }
};

// Delete height permit
exports.deleteHeightPermit = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        if (user.role !== "ADMIN" && user.role !== "SUBADMIN") {
            // Only initiator creator can delete, and only in draft/initiator stage
            if (
                permit.createdBy.toString() !== user._id.toString() ||
                permit.workflowStage !== WORKFLOW_STAGES.INITIATOR
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Only the initiator can delete permits in draft stage",
                });
            }
        }

        await HeightPermit.findByIdAndDelete(id);

        logger.info(`Height Permit ${permit.permitNumber} deleted by ${user.email}`);

        return res.status(200).json({
            success: true,
            message: "Height permit deleted successfully",
        });
    } catch (error) {
        logger.error("Error deleting height permit:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// ==========================
//   CLOSURE WORKFLOW
// ==========================

// 1. Initiator Initiates Closure
exports.initiateClose = async (req, res) => {
    try {
        const { id } = req.params;
        const { initiatorDetails } = req.body;
        const user = req.user;

        // Only Initiator can initiate closure
        if (user.workflowStage !== WORKFLOW_STAGES.INITIATOR) {
            return res.status(403).json({
                success: false,
                message: "Only Initiator can initiate permit closure",
            });
        }

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Only the creator can close their permit
        if (permit.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Only the permit creator can initiate closure",
            });
        }

        // Permit must be in Approved or Cancelled status
        if (permit.status !== PERMIT_STATUS.APPROVED && permit.status !== PERMIT_STATUS.CANCELLED) {
            return res.status(400).json({
                success: false,
                message: "Only approved or cancelled permits can be closed",
            });
        }

        // Check if permit already has closure initiated
        if (permit.closure?.initiatorClosure?.initiatedAt) {
            return res.status(400).json({
                success: false,
                message: "Closure has already been initiated for this permit",
            });
        }

        // Set closure initiation data
        permit.closure = {
            initiatorClosure: {
                confirmationText: "All work associated with this permit has been completed. All equipment associated with this work has been returned in serviceable condition and the job site is clear of any hazards associated with this work.",
                initiatedBy: user._id,
                initiatedAt: new Date(),
                initiatorDetails: {
                    name: initiatorDetails?.name || user.name,
                    designation: initiatorDetails?.designation || "",
                    department: initiatorDetails?.department || "",
                    signature: initiatorDetails?.signature || user.signature?.url || user.name,
                    date: new Date(),
                    time: new Date().toLocaleTimeString("en-IN", { hour12: false }),
                },
            },
        };

        permit.status = PERMIT_STATUS.PENDING_CLOSURE_EXECUTION;
        permit.workflowStage = WORKFLOW_STAGES.EXECUTION;

        await permit.save();

        // Notify assigned executor
        if (permit.assignedExecutor) {
            await createNotification(
                NOTIFICATION_TYPES.CLOSURE_INITIATED,
                "Height Permit Closure Initiated",
                `Height Permit ${permit.permitNumber} closure has been initiated and requires your approval`,
                permit,
                permit.assignedExecutor,
                user._id
            );
        }

        logger.info(
            `Height Permit ${permit.permitNumber} closure initiated by ${user.email}`
        );

        const populatedPermit = await HeightPermit.findById(permit._id)
            .populate("createdBy", "name email workflowStage")
            .populate("assignedExecutor", "name email workflowStage")
            .populate("assignedIssuer", "name email workflowStage");

        return res.status(200).json({
            success: true,
            message: "Height permit closure initiated successfully",
            data: populatedPermit,
        });
    } catch (error) {
        logger.error("Error initiating height permit closure:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// 2. Executor Approves Closure
exports.executorApproveClosure = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        // Only Executor can approve closure
        if (user.workflowStage !== WORKFLOW_STAGES.EXECUTION) {
            return res.status(403).json({
                success: false,
                message: "Only Executor can approve permit closure",
            });
        }

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Check if user is the assigned executor
        if (permit.assignedExecutor && permit.assignedExecutor.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Only the assigned executor can approve this closure",
            });
        }

        // Permit must be in Pending Closure Execution status
        if (permit.status !== PERMIT_STATUS.PENDING_CLOSURE_EXECUTION) {
            return res.status(400).json({
                success: false,
                message: "Permit is not pending closure execution approval",
            });
        }

        // Set executor approval
        permit.closure.executorApproval = {
            approved: true,
            approvedBy: user._id,
            approvedAt: new Date(),
        };

        permit.status = PERMIT_STATUS.PENDING_CLOSURE_ISSUER;
        permit.workflowStage = WORKFLOW_STAGES.ISSUER;

        await permit.save();

        // Notify assigned issuer
        if (permit.assignedIssuer) {
            await createNotification(
                NOTIFICATION_TYPES.CLOSURE_FORWARDED,
                "Height Permit Closure - Awaiting Your Approval",
                `Height Permit ${permit.permitNumber} closure has been approved by executor and requires your final approval`,
                permit,
                permit.assignedIssuer,
                user._id
            );
        }

        logger.info(
            `Height Permit ${permit.permitNumber} closure approved by executor ${user.email}`
        );

        const populatedPermit = await HeightPermit.findById(permit._id)
            .populate("createdBy", "name email workflowStage")
            .populate("assignedExecutor", "name email workflowStage")
            .populate("assignedIssuer", "name email workflowStage");

        return res.status(200).json({
            success: true,
            message: "Height permit closure approved by executor successfully",
            data: populatedPermit,
        });
    } catch (error) {
        logger.error("Error in executor closure approval:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// 3. Issuer Final Closure Approval
exports.issuerApproveClosure = async (req, res) => {
    try {
        const { id } = req.params;
        const { checklist } = req.body;
        const user = req.user;

        // Only Issuer can give final closure approval
        if (user.workflowStage !== WORKFLOW_STAGES.ISSUER) {
            return res.status(403).json({
                success: false,
                message: "Only Issuer can give final closure approval",
            });
        }

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Check if user is the assigned issuer
        if (permit.assignedIssuer && permit.assignedIssuer.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Only the assigned issuer can give final closure approval",
            });
        }

        // Permit must be in Pending Closure Issuer status
        if (permit.status !== PERMIT_STATUS.PENDING_CLOSURE_ISSUER) {
            return res.status(400).json({
                success: false,
                message: "Permit is not pending issuer closure approval",
            });
        }

        // Validate checklist
        const sanitizeYesNo = (value) => {
            if (value === "YES" || value === "NO") return value;
            if (value === true) return "YES";
            if (value === false) return "NO";
            return undefined;
        };

        // Set issuer checklist and approval
        permit.closure.issuerChecklist = {
            allWorkCompleted: sanitizeYesNo(checklist?.allWorkCompleted) || "NO",
            jobCompletionReported: sanitizeYesNo(checklist?.jobCompletionReported) || "NO",
        };

        permit.closure.issuerApproval = {
            approved: true,
            approvedBy: user._id,
            approvedAt: new Date(),
        };

        permit.closure.closedAt = new Date();
        permit.closure.closedBy = user._id;

        permit.status = PERMIT_STATUS.CLOSED;
        permit.workflowStage = WORKFLOW_STAGES.ISSUER;

        await permit.save();

        // Notify initiator
        await createNotification(
            NOTIFICATION_TYPES.PERMIT_CLOSED,
            "Height Permit Closed",
            `Height Permit ${permit.permitNumber} has been successfully closed`,
            permit,
            permit.createdBy,
            user._id
        );

        logger.info(
            `Height Permit ${permit.permitNumber} fully closed by issuer ${user.email}`
        );

        const populatedPermit = await HeightPermit.findById(permit._id)
            .populate("createdBy", "name email workflowStage")
            .populate("assignedExecutor", "name email workflowStage")
            .populate("assignedIssuer", "name email workflowStage");

        return res.status(200).json({
            success: true,
            message: "Height permit closed successfully",
            data: populatedPermit,
        });
    } catch (error) {
        logger.error("Error in issuer final closure approval:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// ==========================
//   RENEWAL WORKFLOW
// ==========================

exports.renewHeightPermit = async (req, res) => {
    try {
        const { id } = req.params;
        const { from, to, renewalReason } = req.body;
        const user = req.user;

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Only initiator creator can request renewal
        if (permit.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Only the permit creator can request renewal",
            });
        }

        // Permit must be approved
        if (permit.status !== PERMIT_STATUS.APPROVED) {
            return res.status(400).json({
                success: false,
                message: "Only approved permits can be renewed",
            });
        }

        // Check if there's already a pending renewal
        if (permit.pendingRenewal && permit.pendingRenewal.isActive) {
            return res.status(400).json({
                success: false,
                message: "There is already a pending renewal request for this permit",
            });
        }

        // Validate renewal data
        if (!from || !to) {
            return res.status(400).json({
                success: false,
                message: "New period dates are required (from and to)",
            });
        }

        // Set pending renewal request (like General Permit)
        permit.pendingRenewal = {
            from: {
                date: from?.date,
                hrs: from?.hrs || "00:00",
            },
            to: {
                date: to?.date,
                hrs: to?.hrs || "00:00",
            },
            renewalReason: renewalReason || "Not Provided",
            requestedBy: user._id,
            requestedAt: new Date(),
            isActive: true, // Mark as active pending renewal
            executorApproval: {
                approved: false,
            },
        };

        // Change status to Pending Execution (like General Permit)
        permit.status = PERMIT_STATUS.PENDING_EXECUTION;
        permit.workflowStage = WORKFLOW_STAGES.EXECUTION;

        // Increment renewal count
        permit.renewalCount = (permit.renewalCount || 0) + 1;

        await permit.save();

        // Notify assigned executor about renewal request
        if (permit.assignedExecutor) {
            await createNotification(
                NOTIFICATION_TYPES.RENEWAL_REQUESTED,
                "Height Permit Renewal Request",
                `Height Permit ${permit.permitNumber} has a renewal request pending your approval`,
                permit,
                permit.assignedExecutor,
                user._id
            );
        }

        // Notify all execution users about renewal request
        const executionUsers = await User.find({
            workflowStage: WORKFLOW_STAGES.EXECUTION,
            isActive: true,
        });
        for (const execUser of executionUsers) {
            if (!permit.assignedExecutor || execUser._id.toString() !== permit.assignedExecutor.toString()) {
                await createNotification(
                    NOTIFICATION_TYPES.RENEWAL_REQUESTED,
                    "Height Permit Renewal Request",
                    `Height Permit ${permit.permitNumber} has a renewal request pending executor approval`,
                    permit,
                    execUser._id,
                    user._id
                );
            }
        }

        const populatedPermit = await HeightPermit.findById(permit._id)
            .populate("createdBy", "name email workflowStage")
            .populate("assignedExecutor", "name email workflowStage")
            .populate("assignedIssuer", "name email workflowStage")
            .populate("pendingRenewal.requestedBy", "name email");

        logger.info(`Height Permit ${permit.permitNumber} renewal requested by ${user.email}`);

        return res.status(200).json({
            success: true,
            message: "Renewal request submitted successfully. Awaiting executor approval.",
            data: populatedPermit,
        });
    } catch (error) {
        logger.error("Error renewing height permit:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// ==========================
//   CANCEL PERMIT
// ==========================

exports.cancelHeightPermit = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, comments, cancellationReason } = req.body;
        const user = req.user;

        // Only Issuer can cancel (same as General Permit)
        if (user.workflowStage !== WORKFLOW_STAGES.ISSUER) {
            return res.status(403).json({
                success: false,
                message: "Only Issuer can cancel a permit",
            });
        }

        const permit = await HeightPermit.findById(id);
        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Height permit not found",
            });
        }

        // Prevent double cancellation
        if (permit.status === PERMIT_STATUS.CANCELLED) {
            return res.status(400).json({
                success: false,
                message: "Permit is already cancelled",
            });
        }

        // Cannot cancel closed permits
        if (permit.status === PERMIT_STATUS.CLOSED) {
            return res.status(400).json({
                success: false,
                message: "Cannot cancel a closed permit",
            });
        }

        // Validate reason (support both 'reason' and 'cancellationReason' field names)
        const cancelReason = reason || cancellationReason;
        if (!cancelReason) {
            return res.status(400).json({
                success: false,
                message: "Cancellation reason is required",
            });
        }

        // Set cancellation (same structure as General Permit)
        permit.status = PERMIT_STATUS.CANCELLED;
        permit.cancellation = {
            cancelled: true,
            reason: cancelReason,
            comments: (comments || "").trim(),
            issuerDetails: {
                name: user.name,
                signature: user.name,
                date: new Date(),
                time: new Date().toLocaleTimeString("en-IN", { hour12: false }),
            },
        };

        await permit.save();

        // Notify Initiator
        await createNotification(
            NOTIFICATION_TYPES.PERMIT_CANCELLED,
            "Height Permit Cancelled",
            `Height Permit ${permit.permitNumber} has been cancelled by issuer`,
            permit,
            permit.createdBy,
            user._id,
            { reason: cancelReason, comments }
        );

        // Notify Executor
        if (permit.assignedExecutor) {
            await createNotification(
                NOTIFICATION_TYPES.PERMIT_CANCELLED,
                "Height Permit Cancelled",
                `Height Permit ${permit.permitNumber} has been cancelled: ${cancelReason}`,
                permit,
                permit.assignedExecutor,
                user._id
            );
        }

        // Notify Admin
        const admins = await User.find({ role: "ADMIN", isActive: true });
        for (const admin of admins) {
            await createNotification(
                NOTIFICATION_TYPES.PERMIT_CANCELLED,
                "Height Permit Cancelled",
                `Height Permit ${permit.permitNumber} has been cancelled`,
                permit,
                admin._id,
                user._id,
                { reason: cancelReason }
            );
        }

        logger.info(`Height Permit ${permit.permitNumber} cancelled by issuer ${user.email}`);

        return res.status(200).json({
            success: true,
            message: "Height permit cancelled successfully",
            data: permit,
        });
    } catch (error) {
        logger.error("Error cancelling height permit:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};
