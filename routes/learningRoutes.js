/**
 * Learning Routes
 * Routes for e-PTW learning/training content
 */

const express = require("express");
const router = express.Router();
const {
    authenticateToken,
    authorize,
} = require("../middleware/authMiddleware");
const {
    uploadLearningFields,
    processLearningMedia,
} = require("../middleware/uploadLearningMedia");
const {
    getAllLearning,
    getAllLearningAdmin,
    getLearningById,
    createLearning,
    updateLearning,
    deleteLearning,
    incrementViewCount,
} = require("../controllers/learningController");

// Public / authenticated routes
router.get("/", authenticateToken, getAllLearning);
router.get("/admin", authenticateToken, authorize("ADMIN", "SUBADMIN"), getAllLearningAdmin);
router.get("/:id", authenticateToken, getLearningById);
router.patch("/:id/view", authenticateToken, incrementViewCount);

// Admin-only routes
router.post(
    "/",
    authenticateToken,
    authorize("ADMIN", "SUBADMIN"),
    uploadLearningFields,
    processLearningMedia,
    createLearning
);

router.put(
    "/:id",
    authenticateToken,
    authorize("ADMIN", "SUBADMIN"),
    uploadLearningFields,
    processLearningMedia,
    updateLearning
);

router.delete(
    "/:id",
    authenticateToken,
    authorize("ADMIN", "SUBADMIN"),
    deleteLearning
);

module.exports = router;
