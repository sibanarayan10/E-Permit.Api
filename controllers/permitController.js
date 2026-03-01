const GeneralWorkPermit = require("../models/GeneralWorkPermit");
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

// Generate automatic permit number
const generatePermitNumber = async () => {
  try {
    const currentYear = new Date().getFullYear();

    // Find the latest permit for this year
    const latestPermit = await GeneralWorkPermit.findOne({
      permitNumber: new RegExp(
        `^${PERMIT_NUMBER_CONFIG.PREFIX}${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}`
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

    return `${PERMIT_NUMBER_CONFIG.PREFIX}${PERMIT_NUMBER_CONFIG.SEPARATOR
      }${currentYear}${PERMIT_NUMBER_CONFIG.SEPARATOR}${sequence
        .toString()
        .padStart(4, "0")}`;
  } catch (error) {
    logger.error("Error generating permit number:", error);
    // Fallback with timestamp
    return `${PERMIT_NUMBER_CONFIG.PREFIX}${PERMIT_NUMBER_CONFIG.SEPARATOR
      }${new Date().getFullYear()}${PERMIT_NUMBER_CONFIG.SEPARATOR}${Date.now()
        .toString()
        .slice(-4)}`;
  }
};

// Generate automatic protocol number (SHARED ACROSS ALL PERMIT TYPES)
const generateProtocolNumber = async () => {
  try {
    const HeightPermit = require("../models/HeightPermit");
    const currentYear = new Date().getFullYear();
    const protocolPrefix = `PROT${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}`;

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
    logger.error("Error generating protocol number:", error);
    // Fallback with timestamp
    return `PROT${PERMIT_NUMBER_CONFIG.SEPARATOR}${new Date().getFullYear()}${PERMIT_NUMBER_CONFIG.SEPARATOR}${Date.now().toString().slice(-4)}`;
  }
};

// Generate automatic SR number
const generateSRNumber = async () => {
  try {
    const currentYear = new Date().getFullYear();

    // Find the latest permit for SR number
    const latestPermit = await GeneralWorkPermit.findOne({
      srNo: new RegExp(`^SR${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}`),
    }).sort({ createdAt: -1 });

    let sequence = 1;
    if (latestPermit && latestPermit.srNo) {
      const parts = latestPermit.srNo.split(PERMIT_NUMBER_CONFIG.SEPARATOR);
      if (parts.length === 3) {
        sequence = parseInt(parts[2]) + 1;
      }
    }

    return `SR${PERMIT_NUMBER_CONFIG.SEPARATOR}${currentYear}${PERMIT_NUMBER_CONFIG.SEPARATOR
      }${sequence.toString().padStart(4, "0")}`;
  } catch (error) {
    logger.error("Error generating SR number:", error);
    // Fallback with timestamp
    return `SR${PERMIT_NUMBER_CONFIG.SEPARATOR}${new Date().getFullYear()}${PERMIT_NUMBER_CONFIG.SEPARATOR
      }${Date.now().toString().slice(-4)}`;
  }
};

// Get available executors for assignment
exports.getAvailableExecutors = async (req, res) => {
  try {
    const executors = await User.find({
      workflowStage: WORKFLOW_STAGES.EXECUTION,
      isActive: true,
    }).select("name email _id workflowStage userId location subLocation");

    logger.info(`Fetched ${executors.length} available executors`);

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

    logger.info(`Fetched ${issuers.length} available issuers`);

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


// Get permits for current user based on their workflow stage
exports.getMyPermits = async (req, res) => {
  try {
    const user = req.user;
    const { stage, status } = req.query;

    let query = {};

    // Filter based on workflow stage and assignments
    if (user.workflowStage === WORKFLOW_STAGES.INITIATOR) {
      // Initiators see permits they created
      query.createdBy = user._id;
    } else if (user.workflowStage === WORKFLOW_STAGES.EXECUTION) {
      // Executors see ALL permits assigned to them (any stage - for history tracking)
      query.assignedExecutor = user._id;
    } else if (user.workflowStage === WORKFLOW_STAGES.ISSUER) {
      // Issuers see ALL permits assigned to them (any stage - for history tracking)
      query.assignedIssuer = user._id;
    }

    // Override for stage parameter (for admin/viewing purposes)
    if (stage && (user.role === "ADMIN" || user.role === "SUBADMIN")) {
      query = { currentStage: stage };
    }

    // Filter by status if provided
    if (status) {
      query.permitStatus = status;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const permits = await GeneralWorkPermit.find(query)
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

    const total = await GeneralWorkPermit.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      message: "Permits fetched successfully",
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
    logger.error("Error fetching permits:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// Get ALL permits (General + Height) for current user - COMBINED API
exports.getAllPermits = async (req, res) => {
  try {
    const HeightPermit = require("../models/HeightPermit");
    const user = req.user;
    const { stage, status } = req.query;

    let generalQuery = {};
    let heightQuery = {};

    // Filter based on workflow stage and assignments
    if (user.workflowStage === WORKFLOW_STAGES.INITIATOR) {
      // Initiators see permits they created
      generalQuery.createdBy = user._id;
      heightQuery.createdBy = user._id;
    } else if (user.workflowStage === WORKFLOW_STAGES.EXECUTION) {
      // Executors see ALL permits assigned to them
      generalQuery.assignedExecutor = user._id;
      heightQuery.assignedExecutor = user._id;
    } else if (user.workflowStage === WORKFLOW_STAGES.ISSUER) {
      // Issuers see ALL permits assigned to them
      generalQuery.assignedIssuer = user._id;
      heightQuery.assignedIssuer = user._id;
    }

    // Override for stage parameter (for admin/viewing purposes)
    if (stage && (user.role === "ADMIN" || user.role === "SUBADMIN")) {
      generalQuery = { currentStage: stage };
      heightQuery = { workflowStage: stage };
    }

    // Filter by status if provided
    if (status) {
      generalQuery.permitStatus = status;
      heightQuery.status = status;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Fetch General Permits
    const generalPermits = await GeneralWorkPermit.find(generalQuery)
      .populate("createdBy", "name email workflowStage")
      .populate("assignedExecutor", "name email workflowStage")
      .populate("assignedIssuer", "name email workflowStage")
      .populate("executionApproval.approvedBy", "name email")
      .populate("issuerApproval.approvedBy", "name email")
      .populate("pendingRenewal.requestedBy", "name email")
      .populate("pendingRenewal.executorApproval.approvedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    // Add permitType field to general permits
    const generalWithType = generalPermits.map(permit => ({
      ...permit,
      permitType: 'general'
    }));

    // Fetch Height Permits
    const heightPermits = await HeightPermit.find(heightQuery)
      .populate("createdBy", "name email workflowStage")
      .populate("assignedExecutor", "name email workflowStage")
      .populate("assignedIssuer", "name email workflowStage")
      .sort({ createdAt: -1 })
      .lean();

    // Add permitType field and normalize status field for height permits
    const heightWithType = heightPermits.map(permit => ({
      ...permit,
      permitType: 'height',
      permitStatus: permit.status, // Normalize status field name
      currentStage: permit.workflowStage // Normalize stage field name
    }));

    // Combine and sort by createdAt
    const allPermits = [...generalWithType, ...heightWithType].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Apply pagination to combined results
    const total = allPermits.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedPermits = allPermits.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      message: "All permits fetched successfully",
      data: {
        permits: paginatedPermits,
        pagination: {
          current: page,
          total: totalPages,
          count: paginatedPermits.length,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching all permits:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// Get combined permit statistics (General + Height) - FILTERED BY USER
exports.getAllPermitStats = async (req, res) => {
  try {
    const HeightPermit = require("../models/HeightPermit");
    const user = req.user;

    // Build query based on user's workflow stage (same logic as getAllPermits)
    let generalMatchCondition = {};
    let heightMatchCondition = {};

    if (user.role !== "ADMIN" && user.role !== "SUBADMIN") {
      if (user.workflowStage === WORKFLOW_STAGES.INITIATOR) {
        // Initiators see only permits they created
        generalMatchCondition = { createdBy: user._id };
        heightMatchCondition = { createdBy: user._id };
      } else if (user.workflowStage === WORKFLOW_STAGES.EXECUTION) {
        // Executors see only permits assigned to them
        generalMatchCondition = { assignedExecutor: user._id };
        heightMatchCondition = { assignedExecutor: user._id };
      } else if (user.workflowStage === WORKFLOW_STAGES.ISSUER) {
        // Issuers see only permits assigned to them
        generalMatchCondition = { assignedIssuer: user._id };
        heightMatchCondition = { assignedIssuer: user._id };
      }
    }

    // Get General Permit stats (filtered by user)
    const generalStats = await GeneralWorkPermit.aggregate([
      { $match: generalMatchCondition },
      {
        $group: {
          _id: "$permitStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get Height Permit stats (filtered by user)
    const heightStats = await HeightPermit.aggregate([
      { $match: heightMatchCondition },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalGeneralPermits = await GeneralWorkPermit.countDocuments(generalMatchCondition);
    const totalHeightPermits = await HeightPermit.countDocuments(heightMatchCondition);

    // Combine stats
    const formattedStats = {
      total: totalGeneralPermits + totalHeightPermits,
      totalGeneral: totalGeneralPermits,
      totalHeight: totalHeightPermits,
    };

    // Add general permit stats
    generalStats.forEach((stat) => {
      if (!formattedStats[stat._id]) {
        formattedStats[stat._id] = 0;
      }
      formattedStats[stat._id] += stat.count;
    });

    // Add height permit stats
    heightStats.forEach((stat) => {
      if (!formattedStats[stat._id]) {
        formattedStats[stat._id] = 0;
      }
      formattedStats[stat._id] += stat.count;
    });

    // Ensure all statuses are present
    Object.values(PERMIT_STATUS).forEach((status) => {
      if (!formattedStats[status]) {
        formattedStats[status] = 0;
      }
    });

    // Add user statistics for admin
    if (user.role === "ADMIN" || user.role === "SUBADMIN") {
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ isActive: true });

      formattedStats.totalUsers = totalUsers;
      formattedStats.activeUsers = activeUsers;
    }

    return res.status(200).json({
      success: true,
      message: "User-specific permit statistics fetched successfully",
      data: formattedStats,
    });
  } catch (error) {
    logger.error("Error fetching combined permit statistics:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// Get permit by ID
exports.getPermitById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const permit = await GeneralWorkPermit.findById(id)
      .populate("createdBy", "name email workflowStage")
      .populate("assignedExecutor", "name email workflowStage")
      .populate("assignedIssuer", "name email workflowStage")
      .populate("executionApproval.approvedBy", "name email")
      .populate("issuerApproval.approvedBy", "name email")
      .populate("pendingRenewal.requestedBy", "name email")
      .populate("pendingRenewal.executorApproval.approvedBy", "name email")
      .populate("hiraId", "hiraNumber jobHeader status isLocked rows");

    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
      });
    }

    // Check permissions
    // if (user.role !== 'ADMIN') {
    //   const isCreator = permit.createdBy._id.toString() === user._id.toString();
    //   const isCurrentStage = permit.currentStage === user.workflowStage;

    //   if (!isCreator && !isCurrentStage) {
    //     return res.status(403).json({
    //       success: false,
    //       message: "You are not authorized to view this permit"
    //     });
    //   }
    // }

    return res.status(200).json({
      success: true,
      message: "Permit fetched successfully",
      data: permit,
    });
  } catch (error) {
    logger.error("Error fetching permit:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// Get next permit numbers
exports.getNextPermitNumbers = async (req, res) => {
  try {
    const permitNumber = await generatePermitNumber();
    const protocolNumber = await generateProtocolNumber();
    const srNo = await generateSRNumber();

    return res.status(200).json({
      success: true,
      message: "Next permit numbers fetched successfully",
      data: {
        permitNumber,
        protocolNumber,
        srNo,
      },
    });
  } catch (error) {
    logger.error("Error generating next permit numbers:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// Create permit
// In your createPermit function, add better error logging:
exports.createPermit = async (req, res) => {
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
        message: "Only Initiators can create permits",
      });
    }

    const {
      permitNumber,
      protocolNumber,
      srNo,
      initiator,
      prePermitChecks,
      executingAgency,
      preExecutionChecks,
      isolationDetails,
      issuerCertification,
      isHiraRequired,
      hiraId,
    } = req.body;

    logger.info("Creating new permit", {
      userId,
      permitNumber: permitNumber || "auto-generated",
    });

    // Auto-generate numbers if not provided
    const autoPermitNumber = permitNumber || (await generatePermitNumber());
    const autoProtocolNumber =
      protocolNumber || (await generateProtocolNumber());
    const autoSrNo = srNo || (await generateSRNumber());

    // Check if permit number already exists
    const existingPermit = await GeneralWorkPermit.findOne({
      permitNumber: autoPermitNumber,
    });
    if (existingPermit) {
      return res.status(409).json({
        success: false,
        message: "Permit number already exists",
      });
    }

    // Helper function to convert boolean to YES/NO/NA enum
    const convertBooleanToEnum = (value) => {
      if (value === true) return "YES";
      if (value === false) return "NO";
      if (value === "YES" || value === "NO" || value === "NA") return value;
      return "NO"; // default
    };

    // Transform prePermitChecks boolean values to enum strings
    let transformedPrePermitChecks = prePermitChecks;
    if (prePermitChecks) {
      transformedPrePermitChecks = { ...prePermitChecks };
      const yesNoNaFields = [
        "electricalIsolation",
        "mechanicalIsolation",
        "gasIsolation",
        "utilitiesIsolation",
        "trafficAwareness",
        "relevantDeptAwareOfIsolation",
        "workingAtHeight",
        "workingInConfinedSpace",
        "excavation",
        "gasTestingRequired",
        "periodicGasTestingRequired",
        "multipleExecutingAgencies",
        "locationAccessible",
        "fireDeptStandby",
        "gasSafetyStandby",
        "ambulanceStandby",
      ];

      yesNoNaFields.forEach((field) => {
        if (transformedPrePermitChecks[field] !== undefined) {
          transformedPrePermitChecks[field] = convertBooleanToEnum(
            transformedPrePermitChecks[field]
          );
        }
      });
    }
    if (initiator?.equipmentLocation) {
      const { location, subLocation } = initiator.equipmentLocation;

      if (!Object.values(LOCATIONS).includes(location)) {
        return res.status(400).json({
          success: false,
          message: "Invalid location selected",
        });
      }

      if (
        !SUB_LOCATIONS[location] ||
        !SUB_LOCATIONS[location].includes(subLocation)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid sub-location for selected location",
        });
      }
    }
    // Transform preExecutionChecks boolean values to enum strings
    let transformedPreExecutionChecks = preExecutionChecks;
    if (preExecutionChecks) {
      transformedPreExecutionChecks = { ...preExecutionChecks };
      const yesNoNaFields = [
        "jobSpecificSafetyTalk",
        "sparkGeneratingWork",
        "combustibleMaterialRemoved",
        "barriersGuardsUsed",
        "barricadingRequired",
        "fireExtinguisherLocationKnown",
        "additionalIlluminationRequired",
        "additionalSupplyPointsRequired",
        "gasTestingRequired",
        "periodicGasMonitoringRequired",
      ];

      yesNoNaFields.forEach((field) => {
        if (transformedPreExecutionChecks[field] !== undefined) {
          transformedPreExecutionChecks[field] = convertBooleanToEnum(
            transformedPreExecutionChecks[field]
          );
        }
      });
    }

    // Create the permit
    const permit = new GeneralWorkPermit({
      permitNumber: autoPermitNumber.trim().toUpperCase(),
      protocolNumber: autoProtocolNumber.trim(),
      srNo: autoSrNo.trim(),
      createdBy: userId,
      currentStage: WORKFLOW_STAGES.INITIATOR,
      permitStatus: PERMIT_STATUS.DRAFT,
      initiator: initiator,
      prePermitChecks: transformedPrePermitChecks,
      executingAgency: executingAgency,
      preExecutionChecks: transformedPreExecutionChecks,
      isolationDetails: isolationDetails,
      issuerCertification: issuerCertification,
      // HIRA Linkage
      isHiraRequired: isHiraRequired === true,
      hiraId: isHiraRequired === true && hiraId ? hiraId : null,
    });

    await permit.save();

    // Create notification for permit creation
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_CREATED,
      "New Permit Created",
      `Permit ${permit.permitNumber} has been created`,
      permit,
      userId,
      userId
    );

    const populatedPermit = await GeneralWorkPermit.findById(
      permit._id
    ).populate("createdBy", "name email workflowStage");

    logger.info(`Permit ${permit.permitNumber} created by ${user.email}`);

    // Send email to initiator about permit creation (fire-and-forget)
    sendTemplateEmail(
      EMAIL_TEMPLATES.PERMIT_CREATED,
      user.email,
      buildPermitEmailData(permit, {
        initiatorName: user.name,
        recipientName: user.name
      }),
      user.name
    );

    // Send SMS notification for permit creation (fire-and-forget)
    if (user.phone) {
      sendSms(SMS_EVENTS.PERMIT_CREATED, user.phone, buildPermitSmsData(permit, {
        Name: user.name
      }));
    }

    return res.status(201).json({
      success: true,
      message: RESPONSE_MESSAGES.PERMIT_CREATED,
      data: populatedPermit,
    });
  } catch (error) {
    logger.error("Permit creation error:", {
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

// Update permit (only by initiator when in initiator stage)
exports.updatePermit = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
      });
    }

    // Check if user is the creator and permit is in initiator stage
    if (
      permit.createdBy.toString() !== user._id.toString() ||
      permit.currentStage !== WORKFLOW_STAGES.INITIATOR
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only the initiator creator can update permits in initiator stage",
      });
    }

    // Helper function to convert boolean to YES/NO/NA enum
    const convertBooleanToEnum = (value) => {
      if (value === true) return "YES";
      if (value === false) return "NO";
      if (value === "YES" || value === "NO" || value === "NA") return value;
      return "NO"; // default
    };

    // Define allowed fields for update
    const allowedUpdates = [
      "initiator",
      "prePermitChecks",
      "executingAgency",
      "preExecutionChecks",
      "isolationDetails",
      "issuerCertification",
      "isHiraRequired",
      "hiraId",
    ];

    const updateFields = {};
    allowedUpdates.forEach((field) => {
      if (updates[field] !== undefined) {
        updateFields[field] = updates[field];
      }
    });

    // Handle HIRA linkage - if isHiraRequired is false, clear hiraId
    if (updates.isHiraRequired === false) {
      updateFields.isHiraRequired = false;
      updateFields.hiraId = null;
    } else if (updates.isHiraRequired === true && updates.hiraId) {
      updateFields.isHiraRequired = true;
      updateFields.hiraId = updates.hiraId;
    }

    // Transform prePermitChecks boolean values to enum strings
    if (updateFields.prePermitChecks) {
      const transformedPrePermitChecks = { ...updateFields.prePermitChecks };
      const yesNoNaFields = [
        "electricalIsolation",
        "mechanicalIsolation",
        "gasIsolation",
        "utilitiesIsolation",
        "trafficAwareness",
        "relevantDeptAwareOfIsolation",
        "workingAtHeight",
        "workingInConfinedSpace",
        "excavation",
        "gasTestingRequired",
        "periodicGasTestingRequired",
        "multipleExecutingAgencies",
        "locationAccessible",
        "fireDeptStandby",
        "gasSafetyStandby",
        "ambulanceStandby",
      ];

      yesNoNaFields.forEach((field) => {
        if (transformedPrePermitChecks[field] !== undefined) {
          transformedPrePermitChecks[field] = convertBooleanToEnum(
            transformedPrePermitChecks[field]
          );
        }
      });
      updateFields.prePermitChecks = transformedPrePermitChecks;
    }
    if (updates?.initiator?.equipmentLocation) {
      const { location, subLocation } = updates.initiator.equipmentLocation;

      if (
        !SUB_LOCATIONS[location] ||
        !SUB_LOCATIONS[location].includes(subLocation)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid sub-location for selected location",
        });
      }
    }

    // Transform preExecutionChecks boolean values to enum strings
    if (updateFields.preExecutionChecks) {
      const transformedPreExecutionChecks = {
        ...updateFields.preExecutionChecks,
      };
      const yesNoNaFields = [
        "jobSpecificSafetyTalk",
        "sparkGeneratingWork",
        "combustibleMaterialRemoved",
        "barriersGuardsUsed",
        "barricadingRequired",
        "fireExtinguisherLocationKnown",
        "additionalIlluminationRequired",
        "additionalSupplyPointsRequired",
        "gasTestingRequired",
        "periodicGasMonitoringRequired",
      ];

      yesNoNaFields.forEach((field) => {
        if (transformedPreExecutionChecks[field] !== undefined) {
          transformedPreExecutionChecks[field] = convertBooleanToEnum(
            transformedPreExecutionChecks[field]
          );
        }
      });
      updateFields.preExecutionChecks = transformedPreExecutionChecks;
    }

    // Auto-fill initiator details if updating initiator section
    if (updates.initiator) {
      updateFields.initiator = {
        ...updates.initiator,
        initiatorDetails: {
          name: user.name,
          signature: user.name,
          date: new Date(),
          time: new Date().toLocaleTimeString("en-IN", { hour12: false }),
          ...updates.initiator.initiatorDetails,
        },
      };
    }

    const updatedPermit = await GeneralWorkPermit.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    ).populate("createdBy", "name email workflowStage");

    // Create notification for permit update
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_UPDATED,
      "Permit Updated",
      `Permit ${permit.permitNumber} has been updated`,
      updatedPermit,
      user._id,
      user._id
    );

    logger.info(`Permit ${permit.permitNumber} updated by ${user.email}`);

    return res.status(200).json({
      success: true,
      message: RESPONSE_MESSAGES.PERMIT_UPDATED,
      data: updatedPermit,
    });
  } catch (error) {
    logger.error("Error updating permit:", error);
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

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
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
    permit.currentStage = WORKFLOW_STAGES.EXECUTION;
    permit.permitStatus = PERMIT_STATUS.PENDING_EXECUTION;
    permit.assignedExecutor = assignedExecutorId;
    permit.assignedExecutorAt = new Date();
    permit.assignedExecutorBy = user._id;
    await permit.save();

    // Notify ONLY the assigned executor
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_FORWARDED,
      "Permit Assigned to You",
      `Permit ${permit.permitNumber} has been assigned to you for execution review`,
      permit,
      assignedExecutorId,
      user._id,
      {
        fromStage: WORKFLOW_STAGES.INITIATOR,
        toStage: WORKFLOW_STAGES.EXECUTION,
        assignedBy: user.name,
      }
    );

    // Notify admin
    const adminUsers = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of adminUsers) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_FORWARDED,
        "Permit Assigned to Executor",
        `Permit ${permit.permitNumber} has been assigned to ${assignedExecutor.name} for execution`,
        permit,
        admin._id,
        user._id
      );
    }

    // Notify the initiator
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_FORWARDED,
      "Permit Submitted to Execution",
      `Your permit ${permit.permitNumber} has been assigned to ${assignedExecutor.name} for review`,
      permit,
      permit.createdBy,
      user._id
    );

    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email workflowStage")
      .populate("assignedExecutor", "name email workflowStage");

    logger.info(
      `Permit ${permit.permitNumber} submitted to execution by ${user.email}, assigned to ${assignedExecutor.email}`
    );

    // Send email to assigned executor (fire-and-forget)
    sendTemplateEmail(
      EMAIL_TEMPLATES.PERMIT_ASSIGNED_TO_EXECUTOR,
      assignedExecutor.email,
      buildPermitEmailData(permit, {
        executorName: assignedExecutor.name,
        executorEmail: assignedExecutor.email,
        assignedByName: user.name,
        recipientName: assignedExecutor.name
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
      message: `Permit assigned to ${assignedExecutor.name} successfully`,
      data: populatedPermit,
    });
  } catch (error) {
    logger.error("Error submitting to execution:", error);
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
    const { assignedIssuerId, comments, preExecutionChecks, executingAgency, isRenewalApproval } = req.body;
    const user = req.user;

    // Check if user is from Execution
    if (user.workflowStage !== WORKFLOW_STAGES.EXECUTION) {
      return res.status(403).json({
        success: false,
        message: "Only Execution users can approve permits",
      });
    }

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
      });
    }

    // Check if user is the assigned executor
    if (permit.assignedExecutor && permit.assignedExecutor.toString() !== user._id.toString()) {
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
      // RENEWAL APPROVAL FLOW - Simplified, only approves the period change

      // Use existing assigned issuer or require one
      let targetIssuerId = assignedIssuerId || permit.assignedIssuer;
      if (!targetIssuerId) {
        return res.status(400).json({
          success: false,
          message: "Issuer assignment is required. Please select an issuer.",
        });
      }

      const assignedIssuer = await User.findOne({
        _id: targetIssuerId,
        workflowStage: WORKFLOW_STAGES.ISSUER,
        isActive: true,
      });

      if (!assignedIssuer) {
        return res.status(400).json({
          success: false,
          message: "Invalid issuer assignment. User must be an active Issuer.",
        });
      }

      // Update ONLY the pending renewal's executor approval (don't touch main execution data)
      permit.pendingRenewal.executorApproval = {
        approved: true,
        approvedBy: user._id,
        approvedAt: new Date(),
        comments: comments?.trim(),
      };

      // Forward to issuer stage
      permit.permitStatus = PERMIT_STATUS.PENDING_ISSUER;
      permit.currentStage = WORKFLOW_STAGES.ISSUER;
      permit.assignedIssuer = targetIssuerId;
      permit.assignedIssuerAt = new Date();
      permit.assignedIssuerBy = user._id;

      await permit.save();

      // Notify issuer about renewal approval needed
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_FORWARDED,
        "Renewal Approval Required",
        `Permit ${permit.permitNumber} renewal request approved by executor, needs your final approval`,
        permit,
        targetIssuerId,
        user._id,
        {
          fromStage: WORKFLOW_STAGES.EXECUTION,
          toStage: WORKFLOW_STAGES.ISSUER,
          isRenewal: true,
        }
      );

      // Notify initiator
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_RENEWED,
        "Renewal Approved by Executor",
        `Your permit ${permit.permitNumber} renewal request has been approved by executor and forwarded to issuer`,
        permit,
        permit.createdBy,
        user._id
      );

      const populatedPermit = await GeneralWorkPermit.findById(permit._id)
        .populate("createdBy", "name email workflowStage phone")
        .populate("assignedExecutor", "name email workflowStage phone")
        .populate("assignedIssuer", "name email workflowStage phone")
        .populate("pendingRenewal.requestedBy", "name email")
        .populate("pendingRenewal.executorApproval.approvedBy", "name email");

      logger.info(
        `Permit ${permit.permitNumber} renewal approved by executor: ${user.email}, forwarded to issuer: ${assignedIssuer.email}`
      );

      // 📧 Send email to initiator about renewal executor approval (fire-and-forget)
      if (populatedPermit.createdBy && populatedPermit.createdBy.email) {
        sendTemplateEmail(
          EMAIL_TEMPLATES.RENEWAL_EXECUTOR_APPROVED,
          populatedPermit.createdBy.email,
          buildPermitEmailData(permit, {
            executorName: user.name,
            initiatorName: populatedPermit.createdBy.name,
            recipientName: populatedPermit.createdBy.name,
            issuerName: assignedIssuer.name
          }),
          populatedPermit.createdBy.name
        );
      }

      // 📧 Send email to issuer about renewal pending approval (fire-and-forget)
      if (assignedIssuer && assignedIssuer.email) {
        sendTemplateEmail(
          EMAIL_TEMPLATES.RENEWAL_EXECUTOR_APPROVED,
          assignedIssuer.email,
          buildPermitEmailData(permit, {
            executorName: user.name,
            initiatorName: populatedPermit.createdBy?.name,
            recipientName: assignedIssuer.name,
            issuerName: assignedIssuer.name
          }),
          assignedIssuer.name
        );
      }

      // 📱 Send SMS to initiator about renewal executor approval (fire-and-forget)
      if (populatedPermit.createdBy && populatedPermit.createdBy.phone) {
        sendSms(SMS_EVENTS.EXECUTOR_APPROVED, populatedPermit.createdBy.phone, buildPermitSmsData(permit, {
          Name: populatedPermit.createdBy.name,
          Executor: user.name
        }));
      }

      // 📱 Send SMS to issuer about renewal pending approval (fire-and-forget)
      if (assignedIssuer && assignedIssuer.phone) {
        sendSms(SMS_EVENTS.PERMIT_ASSIGNED_TO_ISSUER, assignedIssuer.phone, buildPermitSmsData(permit, {
          Name: assignedIssuer.name,
          Initiator: populatedPermit.createdBy?.name,
          Executor: user.name
        }));
      }

      return res.status(200).json({
        success: true,
        message: `Renewal approved and forwarded to ${assignedIssuer.name} for final approval`,
        data: populatedPermit,
      });
    }

    // =============================================
    //   STANDARD EXECUTION APPROVAL (Non-renewal)
    // =============================================

    // Validate issuer assignment
    if (!assignedIssuerId) {
      return res.status(400).json({
        success: false,
        message: "Issuer assignment is required. Please select an issuer.",
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
        message: "Invalid issuer assignment. User must be an active Issuer.",
      });
    }

    // Update execution approval and data
    permit.executionApproval = {
      approved: true,
      approvedBy: user._id,
      approvedAt: new Date(),
      comments: comments?.trim(),
    };

    // Helper function to convert boolean to YES/NO/NA enum
    const convertBooleanToEnum = (value) => {
      if (value === true) return "YES";
      if (value === false) return "NO";
      if (value === "YES" || value === "NO" || value === "NA") return value;
      return "NO"; // default
    };

    if (preExecutionChecks) {
      const transformedPreExecutionChecks = { ...preExecutionChecks };
      const yesNoNaFields = [
        "jobSpecificSafetyTalk",
        "sparkGeneratingWork",
        "combustibleMaterialRemoved",
        "barriersGuardsUsed",
        "barricadingRequired",
        "fireExtinguisherLocationKnown",
        "additionalIlluminationRequired",
        "additionalSupplyPointsRequired",
        "gasTestingRequired",
        "periodicGasMonitoringRequired",
      ];

      yesNoNaFields.forEach((field) => {
        if (transformedPreExecutionChecks[field] !== undefined) {
          transformedPreExecutionChecks[field] = convertBooleanToEnum(
            transformedPreExecutionChecks[field]
          );
        }
      });
      permit.preExecutionChecks = transformedPreExecutionChecks;
    }

    if (executingAgency) {
      permit.executingAgency = executingAgency;
    }

    // Update permit with issuer assignment
    permit.permitStatus = PERMIT_STATUS.PENDING_ISSUER;
    permit.currentStage = WORKFLOW_STAGES.ISSUER;
    permit.assignedIssuer = assignedIssuerId;
    permit.assignedIssuerAt = new Date();
    permit.assignedIssuerBy = user._id;

    await permit.save();

    // Notify ONLY the assigned issuer
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_FORWARDED,
      "Permit Assigned to You",
      `Permit ${permit.permitNumber} has been assigned to you for final approval`,
      permit,
      assignedIssuerId,
      user._id,
      {
        fromStage: WORKFLOW_STAGES.EXECUTION,
        toStage: WORKFLOW_STAGES.ISSUER,
        assignedBy: user.name,
      }
    );

    // Notify initiator
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_APPROVED,
      "Permit Approved by Execution",
      `Your permit ${permit.permitNumber} has been approved by execution and assigned to ${assignedIssuer.name}`,
      permit,
      permit.createdBy,
      user._id
    );

    // Notify admin
    const adminUsers = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of adminUsers) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_APPROVED,
        "Permit Assigned to Issuer",
        `Permit ${permit.permitNumber} has been approved by execution and assigned to ${assignedIssuer.name}`,
        permit,
        admin._id,
        user._id
      );
    }

    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email workflowStage")
      .populate("assignedExecutor", "name email workflowStage")
      .populate("assignedIssuer", "name email workflowStage")
      .populate("executionApproval.approvedBy", "name email");

    logger.info(
      `Permit ${permit.permitNumber} approved by execution user: ${user.email}, assigned to issuer: ${assignedIssuer.email}`
    );

    // Send email to assigned issuer (fire-and-forget)
    sendTemplateEmail(
      EMAIL_TEMPLATES.PERMIT_ASSIGNED_TO_ISSUER,
      assignedIssuer.email,
      buildPermitEmailData(permit, {
        issuerName: assignedIssuer.name,
        issuerEmail: assignedIssuer.email,
        executorName: user.name,
        assignedByName: user.name,
        recipientName: assignedIssuer.name
      }),
      assignedIssuer.name
    );

    // Send SMS notification to assigned issuer (fire-and-forget)
    if (assignedIssuer.phone) {
      sendSms(SMS_EVENTS.PERMIT_ASSIGNED_TO_ISSUER, assignedIssuer.phone, buildPermitSmsData(permit, {
        Name: assignedIssuer.name,
        Initiator: populatedPermit.createdBy?.name || 'Initiator',
        Executor: user.name
      }));
    }

    // Send email to initiator about executor approval (Template #4)
    logger.info(`Template #4 check: createdBy=${populatedPermit.createdBy?._id}, email=${populatedPermit.createdBy?.email}`);
    if (populatedPermit.createdBy && populatedPermit.createdBy.email) {
      sendTemplateEmail(
        EMAIL_TEMPLATES.EXECUTOR_APPROVED,
        populatedPermit.createdBy.email,
        buildPermitEmailData(permit, {
          executorName: user.name,
          issuerName: assignedIssuer.name,
          initiatorName: populatedPermit.createdBy.name,
          recipientName: populatedPermit.createdBy.name
        }),
        populatedPermit.createdBy.name
      );

      // Send SMS notification to initiator about executor approval (fire-and-forget)
      if (populatedPermit.createdBy.phone) {
        sendSms(SMS_EVENTS.EXECUTOR_APPROVED, populatedPermit.createdBy.phone, buildPermitSmsData(permit, {
          Name: populatedPermit.createdBy.name,
          Executor: user.name,
          Issuer: assignedIssuer.name
        }));
      }
    } else {
      logger.warn(`Template #4 skipped: createdBy not populated or no email`);
    }

    return res.status(200).json({
      success: true,
      message: `Permit approved and assigned to ${assignedIssuer.name} successfully`,
      data: populatedPermit,
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
    const { returnedReason, comments } = req.body;
    const user = req.user;

    // Check if user is from Execution
    if (user.workflowStage !== WORKFLOW_STAGES.EXECUTION) {
      return res.status(403).json({
        success: false,
        message: "Only Execution users can return permits",
      });
    }

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
      });
    }

    if (!returnedReason) {
      return res.status(400).json({
        success: false,
        message: "Return reason is required",
      });
    }

    // Update execution approval as returned
    permit.executionApproval = {
      approved: false,
      approvedBy: user._id,
      approvedAt: new Date(),
      comments: comments?.trim(),
    };
    permit.returnedReason = returnedReason;
    permit.permitStatus = PERMIT_STATUS.RETURNED;
    permit.currentStage = WORKFLOW_STAGES.INITIATOR;

    await permit.save();

    // Notify initiator
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_RETURNED,
      "Permit Returned by Execution",
      `Your permit ${permit.permitNumber} has been returned by execution. Reason: ${returnedReason}`,
      permit,
      permit.createdBy,
      user._id,
      { returnedReason, comments }
    );

    // Notify admin
    const adminUsers = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of adminUsers) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_RETURNED,
        "Permit Returned by Execution",
        `Permit ${permit.permitNumber} has been returned by execution. Reason: ${returnedReason}`,
        permit,
        admin._id,
        user._id
      );
    }

    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email workflowStage phone")
      .populate("executionApproval.approvedBy", "name email");

    logger.info(
      `Permit ${permit.permitNumber} returned by execution user: ${user.email}`
    );

    // Send SMS notification to initiator about permit return (fire-and-forget)
    if (populatedPermit.createdBy && populatedPermit.createdBy.phone) {
      sendSms(SMS_EVENTS.PERMIT_RETURNED, populatedPermit.createdBy.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.createdBy.name,
        ReturnedBy: user.name
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Permit returned to initiator successfully",
      data: populatedPermit,
    });
  } catch (error) {
    logger.error("Error in execution return:", error);
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
    const { comments, issuerCertification, isolationDetails, isRenewalApproval } = req.body;
    const user = req.user;

    // Check if user is from Issuer
    if (user.workflowStage !== WORKFLOW_STAGES.ISSUER) {
      return res.status(403).json({
        success: false,
        message: "Only Issuer users can approve permits",
      });
    }

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
      });
    }

    // Check if user is the assigned issuer
    if (permit.assignedIssuer && permit.assignedIssuer.toString() !== user._id.toString()) {
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
      // RENEWAL FINAL APPROVAL - Actually update the permit period NOW

      // Validate that executor has approved the renewal
      if (!permit.pendingRenewal.executorApproval || !permit.pendingRenewal.executorApproval.approved) {
        return res.status(400).json({
          success: false,
          message: "Renewal must be approved by executor first",
        });
      }

      // 🔑 KEY: Store previous period BEFORE overwriting
      const originalFromDate = permit.initiator.periodOfWork?.from?.date;
      const originalFromHrs = permit.initiator.periodOfWork?.from?.hrs;
      const originalToDate = permit.initiator.periodOfWork?.to?.date;
      const originalToHrs = permit.initiator.periodOfWork?.to?.hrs;

      // If this is the first renewal, store the original period permanently
      if (!permit.originalPeriod?.from?.date) {
        permit.originalPeriod = {
          from: {
            date: originalFromDate,
            hrs: originalFromHrs,
          },
          to: {
            date: originalToDate,
            hrs: originalToHrs,
          },
        };
      }

      // Add to renewal history
      const renewalRecord = {
        renewalNumber: permit.renewalCount,
        previousPeriod: {
          from: {
            date: originalFromDate,
            hrs: originalFromHrs,
          },
          to: {
            date: originalToDate,
            hrs: originalToHrs,
          },
        },
        newPeriod: {
          from: {
            date: permit.pendingRenewal.from.date,
            hrs: permit.pendingRenewal.from.hrs,
          },
          to: {
            date: permit.pendingRenewal.to.date,
            hrs: permit.pendingRenewal.to.hrs,
          },
        },
        renewalReason: permit.pendingRenewal.renewalReason,
        requestedBy: permit.pendingRenewal.requestedBy,
        requestedAt: permit.pendingRenewal.requestedAt,
        executorApprovedBy: permit.pendingRenewal.executorApproval?.approvedBy,
        executorApprovedAt: permit.pendingRenewal.executorApproval?.approvedAt,
        issuerApprovedBy: user._id,
        issuerApprovedAt: new Date(),
      };

      if (!permit.renewalHistory) {
        permit.renewalHistory = [];
      }
      permit.renewalHistory.push(renewalRecord);

      permit.pendingRenewal.previousPeriod = {
        from: {
          date: originalFromDate,
          hrs: originalFromHrs,
        },
        to: {
          date: originalToDate,
          hrs: originalToHrs,
        },
      };

      // 🔑 KEY: Copy new period from pendingRenewal to actual period
      permit.initiator.periodOfWork = {
        from: {
          date: permit.pendingRenewal.from.date,
          hrs: permit.pendingRenewal.from.hrs || originalFromHrs,
        },
        to: {
          date: permit.pendingRenewal.to.date,
          hrs: permit.pendingRenewal.to.hrs || originalToHrs,
        },
      };

      // Mark as renewed
      permit.isRenewed = true;
      permit.renewalReason = permit.pendingRenewal.renewalReason;

      // Clear pending renewal (deactivate it)
      permit.pendingRenewal.isActive = false;

      // Restore permit to approved status
      permit.permitStatus = PERMIT_STATUS.APPROVED;
      permit.currentStage = WORKFLOW_STAGES.ISSUER;

      // Mark nested objects as modified so Mongoose detects the changes
      permit.markModified('initiator.periodOfWork');
      permit.markModified('pendingRenewal');
      permit.markModified('originalPeriod');
      permit.markModified('renewalHistory');

      await permit.save();

      // Notify initiator about successful renewal
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_RENEWED,
        "Permit Renewal Approved",
        `Your permit ${permit.permitNumber} renewal has been approved. New validity period is now active.`,
        permit,
        permit.createdBy,
        user._id
      );

      // Notify execution users
      const executionUsers = await User.find({
        workflowStage: WORKFLOW_STAGES.EXECUTION,
        isActive: true,
      });
      for (const execUser of executionUsers) {
        await createNotification(
          NOTIFICATION_TYPES.PERMIT_RENEWED,
          "Permit Renewal Completed",
          `Permit ${permit.permitNumber} renewal has been approved by issuer`,
          permit,
          execUser._id,
          user._id
        );
      }

      // Notify admin
      const adminUsers = await User.find({ role: "ADMIN", isActive: true });
      for (const admin of adminUsers) {
        await createNotification(
          NOTIFICATION_TYPES.PERMIT_RENEWED,
          "Permit Renewal Completed",
          `Permit ${permit.permitNumber} renewal has been approved by issuer ${user.name}`,
          permit,
          admin._id,
          user._id
        );
      }

      const populatedPermit = await GeneralWorkPermit.findById(permit._id)
        .populate("createdBy", "name email workflowStage phone")
        .populate("assignedExecutor", "name email workflowStage phone")
        .populate("assignedIssuer", "name email workflowStage phone")
        .populate("pendingRenewal.requestedBy", "name email");

      logger.info(
        `Permit ${permit.permitNumber} renewal approved by issuer: ${user.email}. Period updated successfully.`
      );

      // 📧 Send email to initiator about renewal approval (fire-and-forget)
      if (populatedPermit.createdBy && populatedPermit.createdBy.email) {
        sendTemplateEmail(
          EMAIL_TEMPLATES.RENEWAL_APPROVED,
          populatedPermit.createdBy.email,
          buildPermitEmailData(permit, {
            issuerName: user.name,
            initiatorName: populatedPermit.createdBy.name,
            recipientName: populatedPermit.createdBy.name,
            newValidFrom: permit.initiator?.periodOfWork?.from?.date ?
              new Date(permit.initiator.periodOfWork.from.date).toLocaleDateString() : "",
            newValidTo: permit.initiator?.periodOfWork?.to?.date ?
              new Date(permit.initiator.periodOfWork.to.date).toLocaleDateString() : ""
          }),
          populatedPermit.createdBy.name
        );
      }

      // 📧 Send email to executor about renewal approval (fire-and-forget)
      if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.email) {
        sendTemplateEmail(
          EMAIL_TEMPLATES.RENEWAL_APPROVED,
          populatedPermit.assignedExecutor.email,
          buildPermitEmailData(permit, {
            issuerName: user.name,
            executorName: populatedPermit.assignedExecutor.name,
            recipientName: populatedPermit.assignedExecutor.name,
            newValidFrom: permit.initiator?.periodOfWork?.from?.date ?
              new Date(permit.initiator.periodOfWork.from.date).toLocaleDateString() : "",
            newValidTo: permit.initiator?.periodOfWork?.to?.date ?
              new Date(permit.initiator.periodOfWork.to.date).toLocaleDateString() : ""
          }),
          populatedPermit.assignedExecutor.name
        );
      }

      // 📱 Send SMS to initiator about renewal approval (fire-and-forget)
      if (populatedPermit.createdBy && populatedPermit.createdBy.phone) {
        sendSms(SMS_EVENTS.RENEWAL_APPROVED, populatedPermit.createdBy.phone, buildPermitSmsData(permit, {
          Name: populatedPermit.createdBy.name,
          Issuer: user.name
        }));
      }

      // 📱 Send SMS to executor about renewal approval (fire-and-forget)
      if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.phone) {
        sendSms(SMS_EVENTS.RENEWAL_APPROVED, populatedPermit.assignedExecutor.phone, buildPermitSmsData(permit, {
          Name: populatedPermit.assignedExecutor.name,
          Issuer: user.name
        }));
      }

      return res.status(200).json({
        success: true,
        message: "Renewal approved successfully. Permit period has been updated.",
        data: populatedPermit,
      });
    }

    // =============================================
    //   STANDARD ISSUER APPROVAL (Non-renewal)
    // =============================================

    // Update issuer approval
    permit.issuerApproval = {
      approved: true,
      approvedBy: user._id,
      approvedAt: new Date(),
      comments: comments?.trim(),
    };

    if (issuerCertification) {
      permit.issuerCertification = issuerCertification;
    }

    if (isolationDetails) {
      permit.isolationDetails = isolationDetails;
    }

    permit.permitStatus = PERMIT_STATUS.APPROVED;
    permit.currentStage = WORKFLOW_STAGES.ISSUER;

    await permit.save();

    // Notify initiator
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_APPROVED,
      "Permit Approved by Issuer",
      `Your permit ${permit.permitNumber} has been approved by issuer and is now active`,
      permit,
      permit.createdBy,
      user._id
    );

    // Notify execution users
    const executionUsers = await User.find({
      workflowStage: WORKFLOW_STAGES.EXECUTION,
      isActive: true,
    });
    for (const execUser of executionUsers) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_APPROVED,
        "Permit Approved by Issuer",
        `Permit ${permit.permitNumber} has been fully approved and is now active`,
        permit,
        execUser._id,
        user._id
      );
    }

    // Notify admin
    const adminUsers = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of adminUsers) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_APPROVED,
        "Permit Fully Approved",
        `Permit ${permit.permitNumber} has been fully approved by issuer`,
        permit,
        admin._id,
        user._id
      );
    }

    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email workflowStage phone")
      .populate("assignedExecutor", "name email phone")
      .populate("executionApproval.approvedBy", "name email")
      .populate("issuerApproval.approvedBy", "name email");

    logger.info(
      `Permit ${permit.permitNumber} approved by issuer user: ${user.email}`
    );

    // Send email to initiator about permit approval (fire-and-forget)
    if (populatedPermit.createdBy && populatedPermit.createdBy.email) {
      sendTemplateEmail(
        EMAIL_TEMPLATES.ISSUER_APPROVED,
        populatedPermit.createdBy.email,
        buildPermitEmailData(permit, {
          issuerName: user.name,
          initiatorName: populatedPermit.createdBy.name,
          recipientName: populatedPermit.createdBy.name
        }),
        populatedPermit.createdBy.name
      );
    }

    // Send email to executor about permit approval (fire-and-forget)
    if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.email) {
      sendTemplateEmail(
        EMAIL_TEMPLATES.ISSUER_APPROVED,
        populatedPermit.assignedExecutor.email,
        buildPermitEmailData(permit, {
          issuerName: user.name,
          executorName: populatedPermit.assignedExecutor.name,
          recipientName: populatedPermit.assignedExecutor.name
        }),
        populatedPermit.assignedExecutor.name
      );
    }

    // Send SMS notification to initiator about permit approval (fire-and-forget)
    if (populatedPermit.createdBy && populatedPermit.createdBy.phone) {
      sendSms(SMS_EVENTS.ISSUER_APPROVED, populatedPermit.createdBy.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.createdBy.name,
        Issuer: user.name
      }));
    }

    // Send SMS notification to executor about permit approval (fire-and-forget)
    if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.phone) {
      sendSms(SMS_EVENTS.ISSUER_APPROVED, populatedPermit.assignedExecutor.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.assignedExecutor.name,
        Issuer: user.name
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Permit approved successfully",
      data: populatedPermit,
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
    const { returnedReason, comments } = req.body;
    const user = req.user;

    // Check if user is from Issuer
    if (user.workflowStage !== WORKFLOW_STAGES.ISSUER) {
      return res.status(403).json({
        success: false,
        message: "Only Issuer users can return permits",
      });
    }

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
      });
    }

    if (!returnedReason) {
      return res.status(400).json({
        success: false,
        message: "Return reason is required",
      });
    }

    // Update issuer approval as returned
    permit.issuerApproval = {
      approved: false,
      approvedBy: user._id,
      approvedAt: new Date(),
      comments: comments?.trim(),
    };
    permit.returnedReason = returnedReason;
    permit.permitStatus = PERMIT_STATUS.RETURNED;
    permit.currentStage = WORKFLOW_STAGES.INITIATOR;

    await permit.save();

    // Notify initiator
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_RETURNED,
      "Permit Returned by Issuer",
      `Your permit ${permit.permitNumber} has been returned by issuer. Reason: ${returnedReason}`,
      permit,
      permit.createdBy,
      user._id,
      { returnedReason, comments }
    );

    // Notify execution users
    const executionUsers = await User.find({
      workflowStage: WORKFLOW_STAGES.EXECUTION,
      isActive: true,
    });
    for (const execUser of executionUsers) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_RETURNED,
        "Permit Returned by Issuer",
        `Permit ${permit.permitNumber} has been returned by issuer. Reason: ${returnedReason}`,
        permit,
        execUser._id,
        user._id
      );
    }

    // Notify admin
    const adminUsers = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of adminUsers) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_RETURNED,
        "Permit Returned by Issuer",
        `Permit ${permit.permitNumber} has been returned by issuer. Reason: ${returnedReason}`,
        permit,
        admin._id,
        user._id
      );
    }

    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email workflowStage phone")
      .populate("issuerApproval.approvedBy", "name email");

    logger.info(
      `Permit ${permit.permitNumber} returned by issuer user: ${user.email}`
    );

    // Send SMS notification to initiator about permit return (fire-and-forget)
    if (populatedPermit.createdBy && populatedPermit.createdBy.phone) {
      sendSms(SMS_EVENTS.PERMIT_RETURNED, populatedPermit.createdBy.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.createdBy.name,
        ReturnedBy: user.name
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Permit returned to initiator successfully",
      data: populatedPermit,
    });
  } catch (error) {
    logger.error("Error in issuer return:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// Get permit statistics
exports.getPermitStats = async (req, res) => {
  try {
    const user = req.user;

    const stats = await GeneralWorkPermit.aggregate([
      {
        $group: {
          _id: "$permitStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalPermits = await GeneralWorkPermit.countDocuments();

    const formattedStats = {
      total: totalPermits,
    };

    stats.forEach((stat) => {
      formattedStats[stat._id] = stat.count;
    });

    // Ensure all statuses are present
    Object.values(PERMIT_STATUS).forEach((status) => {
      if (!formattedStats[status]) {
        formattedStats[status] = 0;
      }
    });

    // Add user statistics for admin
    if (user.role === "ADMIN") {
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ isActive: true });

      formattedStats.totalUsers = totalUsers;
      formattedStats.activeUsers = activeUsers;
    }

    return res.status(200).json({
      success: true,
      message: "Permit statistics fetched successfully",
      data: formattedStats,
    });
  } catch (error) {
    logger.error("Error fetching permit statistics:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// Delete permit
exports.deletePermit = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
      });
    }

    // Check permissions
    if (user.role !== "ADMIN" && user.role !== "SUBADMIN") {
      const isCreator = permit.createdBy.toString() === user._id.toString();
      const isInInitiatorStage =
        permit.currentStage === WORKFLOW_STAGES.INITIATOR;

      if (!isCreator || !isInInitiatorStage) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own permits in initiator stage",
        });
      }
    }

    await GeneralWorkPermit.findByIdAndDelete(id);

    // Create notification for permit deletion
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_DELETED,
      "Permit Deleted",
      `Permit ${permit.permitNumber} has been deleted`,
      permit,
      user._id,
      user._id
    );

    logger.info(`Permit ${permit.permitNumber} deleted by ${user.email}`);

    return res.status(200).json({
      success: true,
      message: RESPONSE_MESSAGES.PERMIT_DELETED,
    });
  } catch (error) {
    logger.error("Error deleting permit:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};
// ==========================
//      RENEW PERMIT (PERIOD-ONLY CHANGE)
//      New Workflow: Initiator → Executor → Issuer (no workflow reset)
// ==========================
exports.renewPermit = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to, renewalReason } = req.body;
    const user = req.user;

    // 1. Fetch permit
    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: "Permit not found",
      });
    }

    // 2. Only approved permits can be renewed
    if (permit.permitStatus !== PERMIT_STATUS.APPROVED) {
      return res.status(400).json({
        success: false,
        message: "Only fully approved permits can be renewed",
      });
    }

    // 3. Check if there's already a pending renewal
    if (permit.pendingRenewal && permit.pendingRenewal.isActive) {
      return res.status(400).json({
        success: false,
        message: "There is already a pending renewal request for this permit",
      });
    }

    // 4. Validate renewal data
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "New period dates are required (from and to)",
      });
    }

    // 5. Store new period TEMPORARILY in pendingRenewal (do NOT update actual period yet)
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

    // 6. Change status to Pending Execution (WITHOUT resetting approvals or other data)
    //    The permit goes directly to Executor for review
    permit.permitStatus = PERMIT_STATUS.PENDING_EXECUTION;
    permit.currentStage = WORKFLOW_STAGES.EXECUTION;

    // 7. Increment renewal count
    permit.renewalCount = (permit.renewalCount || 0) + 1;

    await permit.save();

    // 8. Notify assigned executor about renewal request
    if (permit.assignedExecutor) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_RENEWED,
        "Permit Renewal Request",
        `Permit ${permit.permitNumber} has a renewal request pending your approval`,
        permit,
        permit.assignedExecutor,
        user._id
      );
    }

    // 9. Notify all execution users about renewal request
    const executionUsers = await User.find({
      workflowStage: WORKFLOW_STAGES.EXECUTION,
      isActive: true,
    });
    for (const execUser of executionUsers) {
      if (!permit.assignedExecutor || execUser._id.toString() !== permit.assignedExecutor.toString()) {
        await createNotification(
          NOTIFICATION_TYPES.PERMIT_RENEWED,
          "Permit Renewal Request",
          `Permit ${permit.permitNumber} has a renewal request pending executor approval`,
          permit,
          execUser._id,
          user._id
        );
      }
    }

    // 10. Notify admin
    const adminUsers = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of adminUsers) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_RENEWED,
        "Permit Renewal Request Submitted",
        `Permit ${permit.permitNumber} renewal request submitted by ${user.name}`,
        permit,
        admin._id,
        user._id
      );
    }

    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email workflowStage phone")
      .populate("assignedExecutor", "name email workflowStage phone")
      .populate("assignedIssuer", "name email workflowStage phone")
      .populate("pendingRenewal.requestedBy", "name email");

    logger.info(
      `Permit ${permit.permitNumber} renewal request submitted by ${user.email}`
    );

    // 📧 Send email to executor about renewal request (fire-and-forget)
    if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.email) {
      sendTemplateEmail(
        EMAIL_TEMPLATES.RENEWAL_REQUESTED,
        populatedPermit.assignedExecutor.email,
        buildPermitEmailData(permit, {
          initiatorName: user.name,
          executorName: populatedPermit.assignedExecutor.name,
          recipientName: populatedPermit.assignedExecutor.name,
          renewalReason: renewalReason || "Not Provided",
          newValidFrom: from?.date ? new Date(from.date).toLocaleDateString() : "",
          newValidTo: to?.date ? new Date(to.date).toLocaleDateString() : ""
        }),
        populatedPermit.assignedExecutor.name
      );
    }

    // 📱 Send SMS to executor about renewal request (fire-and-forget)
    if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.phone) {
      sendSms(SMS_EVENTS.RENEWAL_REQUESTED, populatedPermit.assignedExecutor.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.assignedExecutor.name,
        Initiator: user.name
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Renewal request submitted successfully. Awaiting executor approval.",
      data: populatedPermit,
    });
  } catch (error) {
    logger.error("Error submitting renewal request:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// ==========================
//   CANCEL PERMIT (NON-WORKFLOW)
// ==========================
exports.cancelPermit = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, comments } = req.body;
    const user = req.user;

    // Only Issuer can cancel
    if (user.workflowStage !== WORKFLOW_STAGES.ISSUER) {
      return res.status(403).json({
        success: false,
        message: "Only Issuer can cancel a permit",
      });
    }

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
      });
    }

    // Prevent double cancellation
    if (permit.permitStatus === PERMIT_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: "Permit is already cancelled",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Cancellation reason is required",
      });
    }
    if (!comments || !comments.trim()) {
      return res.status(400).json({
        success: false,
        message: "Cancellation comment is required",
      });
    }

    // ✅ SET CANCELLATION (NO WORKFLOW CHANGE)
    permit.permitStatus = PERMIT_STATUS.CANCELLED;
    permit.cancellation = {
      cancelled: true,
      reason,
      comments: comments.trim(),
      issuerDetails: {
        name: user.name,
        signature: user.name,
        date: new Date(),
        time: new Date().toLocaleTimeString("en-IN", { hour12: false }),
      },
    };

    await permit.save();

    // 🔔 Notify Initiator
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_CANCELLED,
      "Permit Cancelled",
      `Permit ${permit.permitNumber} has been cancelled by issuer`,
      permit,
      permit.createdBy,
      user._id,
      { reason, comments }
    );

    // 🔔 Notify Admin
    const admins = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of admins) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_CANCELLED,
        "Permit Cancelled",
        `Permit ${permit.permitNumber} has been cancelled`,
        permit,
        admin._id,
        user._id,
        { reason }
      );
    }

    // Populate permit with user details for email/SMS
    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email phone")
      .populate("assignedExecutor", "name email phone");

    logger.info(
      `Permit ${permit.permitNumber} cancelled by issuer ${user.email}`
    );

    // 📧 Send email to initiator about permit cancellation (fire-and-forget)
    if (populatedPermit.createdBy && populatedPermit.createdBy.email) {
      sendTemplateEmail(
        EMAIL_TEMPLATES.PERMIT_CANCELLED,
        populatedPermit.createdBy.email,
        buildPermitEmailData(permit, {
          issuerName: user.name,
          initiatorName: populatedPermit.createdBy.name,
          recipientName: populatedPermit.createdBy.name,
          cancellationReason: reason,
          cancellationComments: comments
        }),
        populatedPermit.createdBy.name
      );
    }

    // 📧 Send email to executor about permit cancellation (fire-and-forget)
    if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.email) {
      sendTemplateEmail(
        EMAIL_TEMPLATES.PERMIT_CANCELLED,
        populatedPermit.assignedExecutor.email,
        buildPermitEmailData(permit, {
          issuerName: user.name,
          executorName: populatedPermit.assignedExecutor.name,
          recipientName: populatedPermit.assignedExecutor.name,
          cancellationReason: reason,
          cancellationComments: comments
        }),
        populatedPermit.assignedExecutor.name
      );
    }

    // 📱 Send SMS to initiator about permit cancellation (fire-and-forget)
    if (populatedPermit.createdBy && populatedPermit.createdBy.phone) {
      sendSms(SMS_EVENTS.PERMIT_CANCELLED, populatedPermit.createdBy.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.createdBy.name,
        Issuer: user.name
      }));
    }

    // 📱 Send SMS to executor about permit cancellation (fire-and-forget)
    if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.phone) {
      sendSms(SMS_EVENTS.PERMIT_CANCELLED, populatedPermit.assignedExecutor.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.assignedExecutor.name,
        Issuer: user.name
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Permit cancelled successfully",
      data: populatedPermit,
    });
  } catch (error) {
    logger.error("Error cancelling permit:", error);
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
    const { initiatorDetails, executingAgencyRepSignature, assignedExecutorId } = req.body;
    const user = req.user;

    // Only Initiator can initiate closure
    if (user.workflowStage !== WORKFLOW_STAGES.INITIATOR) {
      return res.status(403).json({
        success: false,
        message: "Only Initiator can initiate permit closure",
      });
    }

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
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
    if (permit.permitStatus !== PERMIT_STATUS.APPROVED && permit.permitStatus !== PERMIT_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: "Only approved or cancelled permits can be closed",
      });
    }

    // Check if permit already has closure initiated
    if (permit.closure?.initiatedAt) {
      return res.status(400).json({
        success: false,
        message: "Closure has already been initiated for this permit",
      });
    }

    // Validate and assign executor if provided
    let assignedExecutor = permit.assignedExecutor;
    if (assignedExecutorId) {
      const executor = await User.findOne({
        _id: assignedExecutorId,
        workflowStage: WORKFLOW_STAGES.EXECUTION,
        isActive: true,
      });

      if (!executor) {
        return res.status(400).json({
          success: false,
          message: "Invalid executor assignment. User must be an active Executor.",
        });
      }
      assignedExecutor = assignedExecutorId;
    }

    // Set closure initiation data
    // Use date/time from frontend if provided (for correct local timezone), otherwise fallback to server time
    const closureDate = initiatorDetails?.date ? new Date(initiatorDetails.date) : new Date();
    const closureTime = initiatorDetails?.time || new Date().toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" });

    permit.closure = {
      initiatorClosure: {
        confirmationText: "The job is completed. All men & materials are removed from the site. Safe to restore isolations as stated in Section (C)",
        initiatorDetails: {
          name: initiatorDetails?.name || user.name,
          signature: initiatorDetails?.signature || user.signature?.url || user.name,
          date: closureDate,
          time: closureTime,
        },
        executingAgencyRepSignature: executingAgencyRepSignature || null,
      },
      initiatedAt: new Date(),
      initiatedBy: user._id,
    };

    permit.permitStatus = PERMIT_STATUS.PENDING_CLOSURE_EXECUTION;
    permit.currentStage = WORKFLOW_STAGES.EXECUTION;

    // Update assigned executor if a new one was selected
    if (assignedExecutorId) {
      permit.assignedExecutor = assignedExecutor;
    }

    await permit.save();

    // Notify assigned executor
    if (permit.assignedExecutor) {
      await createNotification(
        NOTIFICATION_TYPES.CLOSURE_INITIATED,
        "Permit Closure Initiated",
        `Permit ${permit.permitNumber} closure has been initiated and requires your approval`,
        permit,
        permit.assignedExecutor,
        user._id
      );
    }

    // Notify admin
    const admins = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of admins) {
      await createNotification(
        NOTIFICATION_TYPES.CLOSURE_INITIATED,
        "Permit Closure Initiated",
        `Permit ${permit.permitNumber} closure has been initiated by ${user.name}`,
        permit,
        admin._id,
        user._id
      );
    }

    logger.info(
      `Permit ${permit.permitNumber} closure initiated by ${user.email}`
    );

    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email workflowStage phone")
      .populate("assignedExecutor", "name email workflowStage phone")
      .populate("assignedIssuer", "name email workflowStage phone");

    // 📧 Send email to executor about closure request (fire-and-forget)
    if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.email) {
      sendTemplateEmail(
        EMAIL_TEMPLATES.CLOSURE_INITIATED,
        populatedPermit.assignedExecutor.email,
        buildPermitEmailData(permit, {
          initiatorName: user.name,
          executorName: populatedPermit.assignedExecutor.name,
          recipientName: populatedPermit.assignedExecutor.name
        }),
        populatedPermit.assignedExecutor.name
      );
    }

    // 📱 Send SMS to executor about closure request (fire-and-forget)
    if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.phone) {
      sendSms(SMS_EVENTS.CLOSURE_INITIATED, populatedPermit.assignedExecutor.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.assignedExecutor.name,
        Initiator: user.name
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Permit closure initiated successfully",
      data: populatedPermit,
    });
  } catch (error) {
    logger.error("Error initiating permit closure:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

// 2. Executor Approves Closure with Handover Checklist
exports.executorApproveClosure = async (req, res) => {
  try {
    const { id } = req.params;
    const { checklist, executingAgencyRepDetails, assignedIssuerId } = req.body;
    const user = req.user;

    // Only Executor can approve closure
    if (user.workflowStage !== WORKFLOW_STAGES.EXECUTION) {
      return res.status(403).json({
        success: false,
        message: "Only Executor can approve permit closure",
      });
    }

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
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
    if (permit.permitStatus !== PERMIT_STATUS.PENDING_CLOSURE_EXECUTION) {
      return res.status(400).json({
        success: false,
        message: "Permit is not pending closure execution approval",
      });
    }

    // Validate checklist
    if (!checklist) {
      return res.status(400).json({
        success: false,
        message: "Handover checklist is required",
      });
    }

    // Validate issuer assignment for next step
    let assignedIssuer = permit.assignedIssuer;
    if (assignedIssuerId) {
      const issuer = await User.findOne({
        _id: assignedIssuerId,
        workflowStage: WORKFLOW_STAGES.ISSUER,
        isActive: true,
      });

      if (!issuer) {
        return res.status(400).json({
          success: false,
          message: "Invalid issuer assignment. User must be an active Issuer.",
        });
      }
      assignedIssuer = assignedIssuerId;
    }

    if (!assignedIssuer) {
      return res.status(400).json({
        success: false,
        message: "Issuer assignment is required for closure approval",
      });
    }

    // Helper function to sanitize YES/NO enum values - empty strings and null become undefined
    const sanitizeYesNo = (value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }
      return value;
    };

    // Update closure with executor checklist
    // Use date/time from frontend if provided (for correct local timezone), otherwise fallback to server time
    const executorClosureDate = executingAgencyRepDetails?.date ? new Date(executingAgencyRepDetails.date) : new Date();
    const executorClosureTime = executingAgencyRepDetails?.time || new Date().toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" });

    permit.closure.executorChecklist = {
      isWorkCompleted: sanitizeYesNo(checklist.isWorkCompleted),
      equipmentRemoved: sanitizeYesNo(checklist.equipmentRemoved),
      personnelMovedToSafe: sanitizeYesNo(checklist.personnelMovedToSafe),
      locksRemoved: sanitizeYesNo(checklist.locksRemoved),
      workAreaCleaned: sanitizeYesNo(checklist.workAreaCleaned),
      testRunRequired: sanitizeYesNo(checklist.testRunRequired),
      testingProcedureAgreed: sanitizeYesNo(checklist.testingProcedureAgreed),
      executingAgencyRepDetails: {
        name: executingAgencyRepDetails?.name || user.name,
        signature: executingAgencyRepDetails?.signature || user.signature?.url || user.name,
        date: executorClosureDate,
        time: executorClosureTime,
      },
    };

    permit.closure.executorApproval = {
      approved: true,
      approvedBy: user._id,
      approvedAt: new Date(),
    };

    permit.permitStatus = PERMIT_STATUS.PENDING_CLOSURE_ISSUER;
    permit.currentStage = WORKFLOW_STAGES.ISSUER;
    permit.assignedIssuer = assignedIssuer;

    await permit.save();

    // Notify assigned issuer
    await createNotification(
      NOTIFICATION_TYPES.CLOSURE_APPROVED_EXECUTION,
      "Permit Closure Approved by Executor",
      `Permit ${permit.permitNumber} closure has been approved by executor and requires your final approval`,
      permit,
      assignedIssuer,
      user._id
    );

    // Notify initiator
    await createNotification(
      NOTIFICATION_TYPES.CLOSURE_APPROVED_EXECUTION,
      "Permit Closure Progressing",
      `Permit ${permit.permitNumber} closure has been approved by executor`,
      permit,
      permit.createdBy,
      user._id
    );

    // Notify admin
    const admins = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of admins) {
      await createNotification(
        NOTIFICATION_TYPES.CLOSURE_APPROVED_EXECUTION,
        "Permit Closure Approved by Executor",
        `Permit ${permit.permitNumber} closure approved by ${user.name}`,
        permit,
        admin._id,
        user._id
      );
    }

    logger.info(
      `Permit ${permit.permitNumber} closure approved by executor ${user.email}`
    );

    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email workflowStage phone")
      .populate("assignedExecutor", "name email workflowStage phone")
      .populate("assignedIssuer", "name email workflowStage phone")
      .populate("closure.executorApproval.approvedBy", "name email");

    // Fetch assigned issuer details for email
    const issuerUser = await User.findById(assignedIssuer);

    // 📧 Send email to initiator about closure executor approval (fire-and-forget)
    if (populatedPermit.createdBy && populatedPermit.createdBy.email) {
      sendTemplateEmail(
        EMAIL_TEMPLATES.CLOSURE_EXECUTOR_APPROVED,
        populatedPermit.createdBy.email,
        buildPermitEmailData(permit, {
          executorName: user.name,
          initiatorName: populatedPermit.createdBy.name,
          recipientName: populatedPermit.createdBy.name,
          issuerName: issuerUser?.name || "Issuer"
        }),
        populatedPermit.createdBy.name
      );
    }

    // 📧 Send email to issuer about closure pending approval (fire-and-forget)
    if (issuerUser && issuerUser.email) {
      sendTemplateEmail(
        EMAIL_TEMPLATES.CLOSURE_EXECUTOR_APPROVED,
        issuerUser.email,
        buildPermitEmailData(permit, {
          executorName: user.name,
          initiatorName: populatedPermit.createdBy?.name,
          recipientName: issuerUser.name,
          issuerName: issuerUser.name
        }),
        issuerUser.name
      );
    }

    // 📱 Send SMS to initiator about closure executor approval (fire-and-forget)
    if (populatedPermit.createdBy && populatedPermit.createdBy.phone) {
      sendSms(SMS_EVENTS.EXECUTOR_CLOSURE_APPROVED, populatedPermit.createdBy.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.createdBy.name,
        Executor: user.name
      }));
    }

    // 📱 Send SMS to issuer about closure pending approval (fire-and-forget)
    if (issuerUser && issuerUser.phone) {
      sendSms(SMS_EVENTS.CLOSURE_INITIATED, issuerUser.phone, buildPermitSmsData(permit, {
        Name: issuerUser.name,
        Initiator: populatedPermit.createdBy?.name
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Closure approved by executor successfully",
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
    const { checklist, isolationRemovalDetails, finalCertification, issuerDetails } = req.body;
    const user = req.user;

    // Only Issuer can final close
    if (user.workflowStage !== WORKFLOW_STAGES.ISSUER) {
      return res.status(403).json({
        success: false,
        message: "Only Issuer can perform final permit closure",
      });
    }

    const permit = await GeneralWorkPermit.findById(id);
    if (!permit) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.PERMIT_NOT_FOUND,
      });
    }

    // Check if user is the assigned issuer
    if (permit.assignedIssuer && permit.assignedIssuer.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the assigned issuer can close this permit",
      });
    }

    // Permit must be in Pending Closure Issuer status
    if (permit.permitStatus !== PERMIT_STATUS.PENDING_CLOSURE_ISSUER) {
      return res.status(400).json({
        success: false,
        message: "Permit is not pending issuer closure approval",
      });
    }

    // Validate checklist
    if (!checklist) {
      return res.status(400).json({
        success: false,
        message: "Issuer closure checklist is required",
      });
    }

    // Helper function to sanitize YES/NO enum values - empty strings and null become undefined
    const sanitizeYesNo = (value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }
      return value;
    };

    // Update closure with issuer checklist
    // Use date/time from frontend if provided (for correct local timezone), otherwise fallback to server time
    const issuerClosureDate = issuerDetails?.date ? new Date(issuerDetails.date) : new Date();
    const issuerClosureTime = issuerDetails?.time || new Date().toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" });

    permit.closure.issuerChecklist = {
      multiplePermitsIssued: sanitizeYesNo(checklist.multiplePermitsIssued),
      allWorkCompleted: sanitizeYesNo(checklist.allWorkCompleted),
      isolationCertificatesReturned: sanitizeYesNo(checklist.isolationCertificatesReturned),
      testRunRequired: sanitizeYesNo(checklist.testRunRequired),
      equipmentMovedToSafe: sanitizeYesNo(checklist.equipmentMovedToSafe),
      emergencyProceduresInPlace: sanitizeYesNo(checklist.emergencyProceduresInPlace),
      issuerDetails: {
        name: issuerDetails?.name || user.name,
        signature: issuerDetails?.signature || user.signature?.url || user.name,
        date: issuerClosureDate,
        time: issuerClosureTime,
      },
    };

    // Save isolation removal details if provided
    if (isolationRemovalDetails && Array.isArray(isolationRemovalDetails)) {
      permit.closure.isolationRemovalDetails = isolationRemovalDetails;
    }

    // Save final certification
    // Use same date/time for final certification as issuer closure
    permit.closure.finalCertification = {
      allIsolationsRestored: finalCertification?.allIsolationsRestored || false,
      issuerSignature: {
        name: user.name,
        signature: user.signature?.url || user.name,
        date: issuerClosureDate,
        time: issuerClosureTime,
      },
    };

    permit.closure.issuerApproval = {
      approved: true,
      approvedBy: user._id,
      approvedAt: new Date(),
    };

    permit.closure.closedAt = new Date();
    permit.closure.closedBy = user._id;

    permit.permitStatus = PERMIT_STATUS.CLOSED;
    permit.currentStage = WORKFLOW_STAGES.ISSUER;

    await permit.save();

    // Notify initiator
    await createNotification(
      NOTIFICATION_TYPES.PERMIT_CLOSED,
      "Permit Closed",
      `Permit ${permit.permitNumber} has been successfully closed`,
      permit,
      permit.createdBy,
      user._id
    );

    // Notify executor
    if (permit.assignedExecutor) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_CLOSED,
        "Permit Closed",
        `Permit ${permit.permitNumber} has been successfully closed`,
        permit,
        permit.assignedExecutor,
        user._id
      );
    }

    // Notify admin
    const admins = await User.find({ role: "ADMIN", isActive: true });
    for (const admin of admins) {
      await createNotification(
        NOTIFICATION_TYPES.PERMIT_CLOSED,
        "Permit Closed",
        `Permit ${permit.permitNumber} has been closed by ${user.name}`,
        permit,
        admin._id,
        user._id
      );
    }

    logger.info(
      `Permit ${permit.permitNumber} closed by issuer ${user.email}`
    );

    const populatedPermit = await GeneralWorkPermit.findById(permit._id)
      .populate("createdBy", "name email workflowStage phone")
      .populate("assignedExecutor", "name email workflowStage phone")
      .populate("assignedIssuer", "name email workflowStage phone")
      .populate("closure.executorApproval.approvedBy", "name email")
      .populate("closure.issuerApproval.approvedBy", "name email")
      .populate("closure.closedBy", "name email");

    // NOTE: Email with PDF attachment is sent from the frontend after closure
    // Backend only sends SMS notifications to avoid duplicate emails

    // 📱 Send SMS notification to initiator about permit closure (fire-and-forget)
    if (populatedPermit.createdBy && populatedPermit.createdBy.phone) {
      sendSms(SMS_EVENTS.PERMIT_CLOSED, populatedPermit.createdBy.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.createdBy.name,
        Issuer: user.name
      }));
    }

    // 📱 Send SMS notification to executor about permit closure (fire-and-forget)
    if (populatedPermit.assignedExecutor && populatedPermit.assignedExecutor.phone) {
      sendSms(SMS_EVENTS.PERMIT_CLOSED, populatedPermit.assignedExecutor.phone, buildPermitSmsData(permit, {
        Name: populatedPermit.assignedExecutor.name,
        Issuer: user.name
      }));
    }

    return res.status(200).json({
      success: true,
      message: "Permit closed successfully",
      data: populatedPermit,
    });
  } catch (error) {
    logger.error("Error in issuer closure approval:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};
