const express = require("express");
const router = express.Router();
const {
    createTemplate,
    getAllTemplates,
    getTemplateById,
    getTemplateByNo,
    updateTemplate,
    toggleTemplateStatus,
    deleteTemplate,
    getAvailablePlaceholders,
    sendPermitEmailWithPDF
} = require("../controllers/emailTemplateController");
const { authenticateToken, authorize } = require("../middleware/authMiddleware");
const { ROLES } = require("../config/constants");

// All routes require authentication
router.use(authenticateToken);

// Send email with PDF - accessible to all authenticated users (for approval/closure emails)
router.post("/send-with-pdf", sendPermitEmailWithPDF);

// Admin-only routes below
// Get available placeholders (for UI help)
router.get("/placeholders", authorize(ROLES.ADMIN), getAvailablePlaceholders);

// CRUD routes - admin only
router.post("/", authorize(ROLES.ADMIN), createTemplate);
router.get("/", authorize(ROLES.ADMIN), getAllTemplates);
router.get("/by-number/:templateNo", authorize(ROLES.ADMIN), getTemplateByNo);
router.get("/:id", authorize(ROLES.ADMIN), getTemplateById);
router.put("/:id", authorize(ROLES.ADMIN), updateTemplate);
router.patch("/:id/toggle", authorize(ROLES.ADMIN), toggleTemplateStatus);
router.delete("/:id", authorize(ROLES.ADMIN), deleteTemplate);

module.exports = router;

