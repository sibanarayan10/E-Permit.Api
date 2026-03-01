const express = require("express");
const router = express.Router();
const activityController = require("../controllers/activityController");
const { authenticateToken, authorize } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(authenticateToken);

// Session heartbeat - any authenticated user
router.post("/heartbeat", activityController.sessionHeartbeat);

// Admin only routes
router.get(
    "/sessions/active",
    authorize("ADMIN"),
    activityController.getActiveSessions
);

router.get(
    "/recent-logins",
    authorize("ADMIN"),
    activityController.getRecentLogins
);

router.get(
    "/login-history/:userId",
    authorize("ADMIN"),
    activityController.getUserLoginHistory
);

router.get(
    "/session-status/:userId",
    authorize("ADMIN"),
    activityController.getUserSessionStatus
);

router.post(
    "/force-logout/:userId",
    authorize("ADMIN"),
    activityController.forceLogout
);

module.exports = router;
