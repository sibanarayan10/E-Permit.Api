const express = require("express");
const router = express.Router();
const { getSettings, updateSettings } = require("../controllers/settingsController");
const { authenticateToken, authorize } = require("../middleware/authMiddleware");
const { ROLES } = require("../config/constants");

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(authorize(ROLES.ADMIN));

// Get current settings
router.get("/", getSettings);

// Update settings
router.put("/", updateSettings);

module.exports = router;
