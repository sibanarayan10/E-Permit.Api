/**
 * Dashboard Controller - Aggregated dashboard data for the redesigned UI
 */

const GeneralWorkPermit = require("../models/GeneralWorkPermit");
const HeightPermit = require("../models/HeightPermit");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { PERMIT_STATUS, RESPONSE_MESSAGES } = require("../config/constants");
const logger = require("../utils/logger");

/**
 * Get dashboard statistics - Aggregated stats across all permits
 * Returns: Active, Pending Validation, Expiring Soon, Recently Expired counts
 */
exports.getDashboardStats = async (req, res) => {
    try {
        const now = new Date();
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // General Permits stats
        const generalActive = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.APPROVED,
        });

        const generalPendingExecution = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.PENDING_EXECUTION,
        });

        const generalPendingIssuer = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.PENDING_ISSUER,
        });

        const generalReturned = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.RETURNED,
        });

        const generalClosed = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.CLOSED,
        });

        // Height Permits stats
        const heightActive = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.APPROVED,
        });

        const heightPendingExecution = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.PENDING_EXECUTION,
        });

        const heightPendingIssuer = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.PENDING_ISSUER,
        });

        const heightReturned = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.RETURNED,
        });

        const heightClosed = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.CLOSED,
        });

        // Calculate totals
        const activePermits = generalActive + heightActive;
        const needValidation = generalPendingExecution + generalPendingIssuer + heightPendingExecution + heightPendingIssuer;
        const returnedPermits = generalReturned + heightReturned;
        const closedPermits = generalClosed + heightClosed;

        // Expiring soon - permits with period ending within 3 days
        const generalExpiringSoon = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.APPROVED,
            "period.to": { $lte: threeDaysFromNow, $gte: now },
        });

        const heightExpiringSoon = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.APPROVED,
            "period.to": { $lte: threeDaysFromNow, $gte: now },
        });

        const expiringSoon = generalExpiringSoon + heightExpiringSoon;

        // Total counts
        const totalGeneral = await GeneralWorkPermit.countDocuments();
        const totalHeight = await HeightPermit.countDocuments();

        // Draft permits
        const generalDraft = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.DRAFT,
        });

        const heightDraft = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.DRAFT,
        });

        const draftPermits = generalDraft + heightDraft;
        const pendingExecution = generalPendingExecution + heightPendingExecution;
        const pendingIssuer = generalPendingIssuer + heightPendingIssuer;

        return res.status(200).json({
            success: true,
            message: "Dashboard statistics fetched successfully",
            data: {
                activePermits,
                expiringSoon,
                needValidation,
                pendingExecution,
                pendingIssuer,
                draftPermits,
                returnedPermits,
                closedPermits,
                totalPermits: totalGeneral + totalHeight,
                totalGeneral,
                totalHeight,
            },
        });
    } catch (error) {
        logger.error("Error fetching dashboard statistics:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

/**
 * Get all permits for dashboard - Combined list of all permits
 */
exports.getAllPermitsForDashboard = async (req, res) => {
    try {
        const { search, sortBy = "createdAt", sortOrder = "desc" } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        let generalQuery = {};
        let heightQuery = {};

        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, "i");
            generalQuery.$or = [
                { permitNumber: searchRegex },
                { protocolNumber: searchRegex },
                { "initiator.briefDescriptionOfWork": searchRegex },
            ];
            heightQuery.$or = [
                { permitNumber: searchRegex },
                { protocolNumber: searchRegex },
                { "jobDescription.taskDetails": searchRegex },
            ];
        }

        // Fetch General Permits
        const generalPermits = await GeneralWorkPermit.find(generalQuery)
            .populate("createdBy", "name email workflowStage profilePicture")
            .populate("assignedExecutor", "name email workflowStage profilePicture")
            .populate("assignedIssuer", "name email workflowStage profilePicture")
            .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
            .lean();

        // Map to unified format
        const generalWithType = generalPermits.map((permit) => ({
            _id: permit._id,
            permitNumber: permit.permitNumber,
            protocolNumber: permit.protocolNumber,
            permitType: "general",
            status: permit.permitStatus,
            currentStage: permit.currentStage,
            description: permit.initiator?.briefDescriptionOfWork || "-",
            createdBy: permit.createdBy,
            assignedExecutor: permit.assignedExecutor,
            assignedIssuer: permit.assignedIssuer,
            period: permit.period,
            createdAt: permit.createdAt,
            updatedAt: permit.updatedAt,
        }));

        // Fetch Height Permits
        const heightPermits = await HeightPermit.find(heightQuery)
            .populate("createdBy", "name email workflowStage profilePicture")
            .populate("assignedExecutor", "name email workflowStage profilePicture")
            .populate("assignedIssuer", "name email workflowStage profilePicture")
            .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
            .lean();

        // Map to unified format
        const heightWithType = heightPermits.map((permit) => ({
            _id: permit._id,
            permitNumber: permit.permitNumber,
            protocolNumber: permit.protocolNumber,
            permitType: "height",
            status: permit.status,
            currentStage: permit.workflowStage,
            description: permit.jobDescription?.taskDetails || "-",
            createdBy: permit.createdBy,
            assignedExecutor: permit.assignedExecutor,
            assignedIssuer: permit.assignedIssuer,
            period: permit.period,
            createdAt: permit.createdAt,
            updatedAt: permit.updatedAt,
        }));

        // Combine and sort
        const allPermits = [...generalWithType, ...heightWithType].sort((a, b) => {
            const order = sortOrder === "desc" ? -1 : 1;
            return order * (new Date(b[sortBy]) - new Date(a[sortBy]));
        });

        // Apply pagination
        const total = allPermits.length;
        const totalPages = Math.ceil(total / limit);
        const skip = (page - 1) * limit;
        const paginatedPermits = allPermits.slice(skip, skip + limit);

        return res.status(200).json({
            success: true,
            message: "Dashboard permits fetched successfully",
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
        logger.error("Error fetching dashboard permits:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

/**
 * Get recent user activity - Users who have recently performed actions
 * Returns users with their recent actions (create, approve, return)
 */
exports.getRecentUserActivity = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Get recent general permit activities
        const recentGeneralPermits = await GeneralWorkPermit.find({
            updatedAt: { $gte: sevenDaysAgo },
        })
            .populate("createdBy", "name email workflowStage profilePicture")
            .populate("assignedExecutor", "name email workflowStage profilePicture")
            .populate("assignedIssuer", "name email workflowStage profilePicture")
            .populate("executionApproval.approvedBy", "name email workflowStage profilePicture")
            .populate("issuerApproval.approvedBy", "name email workflowStage profilePicture")
            .sort({ updatedAt: -1 })
            .limit(50)
            .lean();

        // Get recent height permit activities
        const recentHeightPermits = await HeightPermit.find({
            updatedAt: { $gte: sevenDaysAgo },
        })
            .populate("createdBy", "name email workflowStage profilePicture")
            .populate("assignedExecutor", "name email workflowStage profilePicture")
            .populate("assignedIssuer", "name email workflowStage profilePicture")
            .sort({ updatedAt: -1 })
            .limit(50)
            .lean();

        // Build activity list
        const activities = [];

        // Process General Permits
        recentGeneralPermits.forEach((permit) => {
            // Check for issuer approval
            if (permit.issuerApproval?.approvedBy && permit.issuerApproval?.approvedAt) {
                activities.push({
                    user: permit.issuerApproval.approvedBy,
                    action: "approved",
                    actionLabel: "Approval",
                    permitNumber: permit.permitNumber,
                    permitType: "general",
                    timestamp: permit.issuerApproval.approvedAt,
                });
            }
            // Check for execution approval
            if (permit.executionApproval?.approvedBy && permit.executionApproval?.approvedAt) {
                activities.push({
                    user: permit.executionApproval.approvedBy,
                    action: "approved",
                    actionLabel: "Execution Approval",
                    permitNumber: permit.permitNumber,
                    permitType: "general",
                    timestamp: permit.executionApproval.approvedAt,
                });
            }
            // Check for creation
            if (permit.createdBy) {
                activities.push({
                    user: permit.createdBy,
                    action: "created",
                    actionLabel: "Created",
                    permitNumber: permit.permitNumber,
                    permitType: "general",
                    timestamp: permit.createdAt,
                });
            }
            // Check for returns
            if (permit.permitStatus === "Returned" && permit.returnedReason) {
                const returner = permit.assignedExecutor || permit.assignedIssuer;
                if (returner) {
                    activities.push({
                        user: returner,
                        action: "returned",
                        actionLabel: "Returned",
                        permitNumber: permit.permitNumber,
                        permitType: "general",
                        timestamp: permit.updatedAt,
                    });
                }
            }
        });

        // Process Height Permits
        recentHeightPermits.forEach((permit) => {
            if (permit.createdBy) {
                activities.push({
                    user: permit.createdBy,
                    action: "created",
                    actionLabel: "Created",
                    permitNumber: permit.permitNumber,
                    permitType: "height",
                    timestamp: permit.createdAt,
                });
            }
            if (permit.status === "Returned") {
                const returner = permit.assignedExecutor || permit.assignedIssuer;
                if (returner) {
                    activities.push({
                        user: returner,
                        action: "returned",
                        actionLabel: "Returned",
                        permitNumber: permit.permitNumber,
                        permitType: "height",
                        timestamp: permit.updatedAt,
                    });
                }
            }
        });

        // Sort by timestamp and deduplicate by user + action
        const sortedActivities = activities
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit * 3);

        // Group by user, keeping most recent action
        const userActivityMap = new Map();
        sortedActivities.forEach((activity) => {
            if (activity.user && activity.user._id) {
                const key = activity.user._id.toString();
                if (!userActivityMap.has(key)) {
                    userActivityMap.set(key, {
                        user: activity.user,
                        recentActions: [],
                        totalPermits: 0,
                    });
                }
                const entry = userActivityMap.get(key);
                if (entry.recentActions.length < 2) {
                    entry.recentActions.push({
                        action: activity.action,
                        actionLabel: activity.actionLabel,
                        permitNumber: activity.permitNumber,
                        permitType: activity.permitType,
                        timestamp: activity.timestamp,
                    });
                }
                entry.totalPermits++;
            }
        });

        const recentUserActivity = Array.from(userActivityMap.values()).slice(0, limit);

        return res.status(200).json({
            success: true,
            message: "Recent user activity fetched successfully",
            data: recentUserActivity,
        });
    } catch (error) {
        logger.error("Error fetching recent user activity:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

/**
 * Get validation queue - Permits pending validation/action
 */
exports.getValidationQueue = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        // Count permits in different validation states
        const generalPendingExecution = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.PENDING_EXECUTION,
        });

        const generalPendingIssuer = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.PENDING_ISSUER,
        });

        const heightPendingExecution = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.PENDING_EXECUTION,
        });

        const heightPendingIssuer = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.PENDING_ISSUER,
        });

        // Count returned permits (need attention)
        const generalReturned = await GeneralWorkPermit.countDocuments({
            permitStatus: PERMIT_STATUS.RETURNED,
        });

        const heightReturned = await HeightPermit.countDocuments({
            status: PERMIT_STATUS.RETURNED,
        });

        // Count closure pending permits
        const generalClosurePending = await GeneralWorkPermit.countDocuments({
            currentStage: { $in: ["Closure_Pending_Executor", "Closure_Pending_Issuer"] },
        });

        const heightClosurePending = await HeightPermit.countDocuments({
            workflowStage: { $in: ["Closure_Pending_Executor", "Closure_Pending_Issuer"] },
        });

        // Get recent notifications about validation
        const recentNotifications = await Notification.find({
            type: { $in: ["PERMIT_SUBMITTED", "PERMIT_APPROVED", "PERMIT_RETURNED", "CLOSURE_INITIATED"] },
        })
            .populate("createdBy", "name email")
            .populate("permitId", "permitNumber")
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const validationStats = {
            pendingExecution: generalPendingExecution + heightPendingExecution,
            pendingIssuer: generalPendingIssuer + heightPendingIssuer,
            returned: generalReturned + heightReturned,
            closurePending: generalClosurePending + heightClosurePending,
            total: generalPendingExecution + generalPendingIssuer + heightPendingExecution + heightPendingIssuer + generalReturned + heightReturned + generalClosurePending + heightClosurePending,
        };

        return res.status(200).json({
            success: true,
            message: "Validation queue fetched successfully",
            data: {
                stats: validationStats,
                recentNotifications,
            },
        });
    } catch (error) {
        logger.error("Error fetching validation queue:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};
