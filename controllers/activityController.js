const LoginActivity = require("../models/LoginActivity");
const UserSession = require("../models/UserSession");
const User = require("../models/User");
const { ROLES, RESPONSE_MESSAGES } = require("../config/constants");
const logger = require("../utils/logger");

// ============================================================
//  HELPER: Parse user-agent string into device / browser / OS
// ============================================================
const parseUserAgent = (ua) => {
    if (!ua) return { device: "Unknown", browser: "Unknown", os: "Unknown" };

    let browser = "Unknown";
    let os = "Unknown";
    let device = "Desktop";

    // Browser detection
    if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
    else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
    else if (/Chrome\//i.test(ua)) browser = "Chrome";
    else if (/Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
    else if (/MSIE|Trident/i.test(ua)) browser = "Internet Explorer";

    // Extract version
    const versionMatch = ua.match(
        /(Chrome|Firefox|Safari|OPR|Edg|MSIE)[\/\s]([\d.]+)/i
    );
    if (versionMatch) {
        browser += ` ${versionMatch[2].split(".")[0]}`;
    }

    // OS detection
    if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
    else if (/Windows/i.test(ua)) os = "Windows";
    else if (/Mac OS X/i.test(ua)) os = "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";

    // Device detection
    if (/Mobile|Android.*Mobile|iPhone/i.test(ua)) device = "Mobile";
    else if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) device = "Tablet";

    return { device, browser, os };
};

// Helper: Get client IP
const getClientIp = (req) => {
    return (
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.headers["x-real-ip"] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        "Unknown"
    );
};

// ============================================================
//  RECORD LOGIN ATTEMPT  (called by userLogin controller)
// ============================================================
exports.recordLoginAttempt = async (req, userId, status, failureReason = null) => {
    try {
        const ua = req.headers["user-agent"] || "";
        const { device, browser, os } = parseUserAgent(ua);
        const ipAddress = getClientIp(req);

        const loginRecord = new LoginActivity({
            user: userId,
            status,
            ipAddress,
            userAgent: ua,
            device,
            browser,
            os,
            failureReason,
        });

        await loginRecord.save();

        // If success, create a session
        if (status === "success") {
            // End any existing online sessions for this user
            await UserSession.updateMany(
                { user: userId, status: "online" },
                {
                    $set: {
                        status: "offline",
                        logoutReason: "manual",
                    },
                }
            );

            const session = new UserSession({
                user: userId,
                status: "online",
                sessionStart: new Date(),
                sessionExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days matching cookie
                lastActivity: new Date(),
                ipAddress,
                userAgent: ua,
                device,
                browser,
                os,
            });

            await session.save();

            // Link session to login record
            loginRecord.sessionId = session._id;
            await loginRecord.save();

            // Update last login on user
            await User.findByIdAndUpdate(userId, {
                lastLogin: new Date(),
            });

            return { loginRecord, session };
        }

        return { loginRecord };
    } catch (error) {
        logger.error("Error recording login attempt:", error);
        // Non-blocking: don't throw, just log
    }
};

// ============================================================
//  RECORD LOGOUT  (called by userLogout controller)
// ============================================================
exports.recordLogout = async (userId) => {
    try {
        // Find the most recent successful login without a logout time
        const lastLogin = await LoginActivity.findOne({
            user: userId,
            status: "success",
            logoutTime: null,
        }).sort({ loginTime: -1 });

        if (lastLogin) {
            lastLogin.logoutTime = new Date();
            await lastLogin.save();
        }

        // Mark all active sessions as offline
        await UserSession.updateMany(
            { user: userId, status: "online" },
            {
                $set: {
                    status: "offline",
                    logoutReason: "manual",
                },
            }
        );
    } catch (error) {
        logger.error("Error recording logout:", error);
    }
};

// ============================================================
//  SESSION HEARTBEAT  (called periodically by frontend)
// ============================================================
exports.sessionHeartbeat = async (req, res) => {
    try {
        const userId = req.user._id;

        // Expire stale sessions first
        await UserSession.expireStaleSessions();

        const session = await UserSession.findOne({
            user: userId,
            status: "online",
        });

        if (session) {
            session.lastActivity = new Date();
            await session.save();

            return res.status(200).json({
                success: true,
                message: "Session active",
                data: {
                    sessionId: session._id,
                    status: session.status,
                    lastActivity: session.lastActivity,
                    sessionExpiry: session.sessionExpiry,
                },
            });
        }

        return res.status(200).json({
            success: true,
            message: "No active session",
            data: { status: "offline" },
        });
    } catch (error) {
        logger.error("Session heartbeat error:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// ============================================================
//  GET LOGIN HISTORY FOR A USER  (admin only)
// ============================================================
exports.getUserLoginHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const statusFilter = req.query.status; // 'success' | 'failed' | undefined (all)

        // Build query
        const query = { user: userId };
        if (statusFilter && ["success", "failed"].includes(statusFilter)) {
            query.status = statusFilter;
        }

        const [records, total] = await Promise.all([
            LoginActivity.find(query)
                .sort({ loginTime: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            LoginActivity.countDocuments(query),
        ]);

        // Get stats
        const [totalLogins, successLogins, failedLogins] = await Promise.all([
            LoginActivity.countDocuments({ user: userId }),
            LoginActivity.countDocuments({ user: userId, status: "success" }),
            LoginActivity.countDocuments({ user: userId, status: "failed" }),
        ]);

        // Get last successful login
        const lastLogin = await LoginActivity.findOne({
            user: userId,
            status: "success",
        })
            .sort({ loginTime: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Login history fetched successfully",
            data: {
                records,
                stats: {
                    totalLogins,
                    successLogins,
                    failedLogins,
                    lastLoginTime: lastLogin?.loginTime ?? null,
                    lastLoginIp: lastLogin?.ipAddress ?? null,
                    lastLoginDevice: lastLogin?.device ?? null,
                    lastLoginBrowser: lastLogin?.browser ?? null,
                },
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    count: records.length,
                    totalRecords: total,
                },
            },
        });
    } catch (error) {
        logger.error("Error fetching login history:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// ============================================================
//  GET SESSION STATUS FOR A USER  (admin only)
// ============================================================
exports.getUserSessionStatus = async (req, res) => {
    try {
        const { userId } = req.params;

        // Expire stale sessions first
        await UserSession.expireStaleSessions();

        // Active session
        const activeSession = await UserSession.findOne({
            user: userId,
            status: "online",
        }).lean();

        // Recent sessions
        const recentSessions = await UserSession.find({ user: userId })
            .sort({ sessionStart: -1 })
            .limit(10)
            .lean();

        // User account status
        const user = await User.findById(userId).select("isActive lastLogin").lean();

        // Count failed login attempts in last 24 hours
        const failedAttemptsLast24h = await LoginActivity.countDocuments({
            user: userId,
            status: "failed",
            loginTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        });

        // Determine if account should be considered "locked" (5+ failed attempts in 24h)
        const isLocked = failedAttemptsLast24h >= 5;

        return res.status(200).json({
            success: true,
            message: "Session status fetched successfully",
            data: {
                isOnline: !!activeSession,
                activeSession,
                recentSessions,
                accountStatus: {
                    isActive: user?.isActive ?? false,
                    isLocked,
                    failedAttemptsLast24h,
                    lastLogin: user?.lastLogin ?? null,
                },
            },
        });
    } catch (error) {
        logger.error("Error fetching session status:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// ============================================================
//  GET ACTIVE SESSIONS OVERVIEW  (admin dashboard)
// ============================================================
exports.getActiveSessions = async (req, res) => {
    try {
        // Expire stale sessions first
        await UserSession.expireStaleSessions();

        const activeSessions = await UserSession.find({ status: "online" })
            .populate("user", "name email role workflowStage profilePicture userId")
            .sort({ lastActivity: -1 })
            .lean();

        const totalOnline = activeSessions.length;

        return res.status(200).json({
            success: true,
            message: "Active sessions fetched successfully",
            data: {
                totalOnline,
                sessions: activeSessions,
            },
        });
    } catch (error) {
        logger.error("Error fetching active sessions:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// ============================================================
//  GET RECENT LOGINS  (last N successful logins across all users)
// ============================================================
exports.getRecentLogins = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);

        const recentLogins = await LoginActivity.find({ status: "success" })
            .populate("user", "name email role workflowStage profilePicture userId")
            .sort({ loginTime: -1 })
            .limit(limit)
            .lean();

        return res.status(200).json({
            success: true,
            message: "Recent logins fetched successfully",
            data: {
                logins: recentLogins,
                count: recentLogins.length,
            },
        });
    } catch (error) {
        logger.error("Error fetching recent logins:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};

// ============================================================
//  FORCE LOGOUT A USER  (admin only)
// ============================================================
exports.forceLogout = async (req, res) => {
    try {
        const { userId } = req.params;

        // Mark all active sessions as offline
        const result = await UserSession.updateMany(
            { user: userId, status: "online" },
            {
                $set: {
                    status: "offline",
                    logoutReason: "admin_forced",
                },
            }
        );

        // Update login activity
        const lastLogin = await LoginActivity.findOne({
            user: userId,
            status: "success",
            logoutTime: null,
        }).sort({ loginTime: -1 });

        if (lastLogin) {
            lastLogin.logoutTime = new Date();
            await lastLogin.save();
        }

        logger.info(
            `Admin ${req.user.email} force-logged out user ${userId}`
        );

        return res.status(200).json({
            success: true,
            message: "User session terminated successfully",
            data: { sessionsTerminated: result.modifiedCount },
        });
    } catch (error) {
        logger.error("Error forcing logout:", error);
        return res.status(500).json({
            success: false,
            message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
};
