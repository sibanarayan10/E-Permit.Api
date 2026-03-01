/**
 * Dashboard Routes - API routes for dashboard data
 */

const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { authenticateToken } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(authenticateToken);

// Dashboard routes
router.get("/stats", dashboardController.getDashboardStats);
router.get("/permits", dashboardController.getAllPermitsForDashboard);
router.get("/recent-activity", dashboardController.getRecentUserActivity);
router.get("/validation-queue", dashboardController.getValidationQueue);

module.exports = router;
