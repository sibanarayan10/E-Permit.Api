const express = require("express");
const router = express.Router();
const userRoutes = require("./userRoutes");
const permitRoutes = require("./permitRoutes");
const heightPermitRoutes = require("./heightPermitRoutes");
const notificationRoutes = require("./notificationRoutes");
const profileRoutes = require("./profileRoutes.js");
const User = require("../models/User");
const locationRoutes = require("./locationRoutes");
const emailTemplateRoutes = require("./emailTemplateRoutes");
const settingsRoutes = require("./settingsRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const hiraRoutes = require("./hiraRoutes");
const dataRequestRoutes = require("./dataRequestRoutes");
const learningRoutes = require("./learningRoutes");
const activityRoutes = require("./activityRoutes");

// API routes
router.use("/users", userRoutes);
router.use("/permits", permitRoutes);
router.use("/height-permits", heightPermitRoutes);
router.use("/notifications", notificationRoutes);
router.use("/profile", profileRoutes);
router.use("/locations", locationRoutes);
router.use("/email-templates", emailTemplateRoutes);
router.use("/settings", settingsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/hira", hiraRoutes);
router.use("/data-requests", dataRequestRoutes);
router.use("/learning", learningRoutes);
router.use("/activity", activityRoutes);

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// System status endpoint (public)
router.get("/system-status", async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const adminCount = await User.countDocuments({ role: "ADMIN" });

    res.status(200).json({
      success: true,
      data: {
        database: "connected",
        users: userCount,
        hasAdmin: adminCount > 0,
        needsSetup: userCount === 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "System status check failed",
      error: error.message
    });
  }
});

module.exports = router;