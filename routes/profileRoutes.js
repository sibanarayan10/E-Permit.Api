const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const { authenticateToken, authorize } = require("../middleware/authMiddleware");
const handleSignatureUpload = require("../middleware/uploadSignature");
const handleProfilePictureUpload = require("../middleware/uploadProfilePicture");

// All routes require authentication
router.use(authenticateToken);

// ==================== PROFILE PICTURE ROUTES ====================
router.post("/profile-picture/upload", handleProfilePictureUpload, profileController.uploadProfilePicture);
router.delete("/profile-picture/delete", profileController.deleteProfilePicture);
router.get("/profile-picture/my-picture", profileController.getProfilePicture);

// ==================== SIGNATURE ROUTES ====================
router.post("/signature/upload", handleSignatureUpload, profileController.uploadSignature);
router.delete("/signature/delete", profileController.deleteSignature);
router.get("/signature/my-signature", profileController.getSignature);

// ==================== COMBINED ROUTES ====================
router.get("/my-profile-data", profileController.getProfileAndSignature);

// ==================== ADMIN ROUTES ====================
router.get("/user/:id", authorize("ADMIN", "SUBADMIN"), profileController.getUserProfileData);

module.exports = router;