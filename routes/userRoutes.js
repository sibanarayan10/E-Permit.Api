const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateToken, authorize } = require("../middleware/authMiddleware");
const { handleValidationErrors } = require("../middleware/validationMiddleware");
const {
  loginValidation,
  updateProfileValidation,
  createUserValidation,
  updateUserValidation,
  changePasswordValidation,
  forgotPasswordValidation,
  resetPasswordValidation
} = require("../validations/userValidation");

// Public routes
router.post("/login", loginValidation, handleValidationErrors, userController.userLogin);
router.post("/initial-setup", userController.initialSetup); // New route for initial setup
router.post("/forgot-password", forgotPasswordValidation, handleValidationErrors, userController.forgotPassword);
router.post("/reset-password/:token", resetPasswordValidation, handleValidationErrors, userController.resetPassword);

// Protected routes (all users)
router.use(authenticateToken);

router.post("/logout", userController.userLogout);
router.get("/verify", userController.verifyUser);
router.get("/profile", userController.getUserProfile);
router.put("/profile", updateProfileValidation, handleValidationErrors, userController.updateUserProfile);
router.put("/change-password", changePasswordValidation, handleValidationErrors, userController.changePassword);

// Admin only routes
router.post("/", authorize("ADMIN", "SUBADMIN"), createUserValidation, handleValidationErrors, userController.createUser);
router.get("/", authorize("ADMIN", "SUBADMIN"), userController.getAllUsers);
router.get("/stats", authorize("ADMIN", "SUBADMIN"), userController.getUserStats);
router.get("/system-info", authorize("ADMIN", "SUBADMIN"), userController.getSystemInfo);
router.put("/:id", authorize("ADMIN", "SUBADMIN"), updateUserValidation, handleValidationErrors, userController.updateUser);
router.delete("/:id", authorize("ADMIN", "SUBADMIN"), userController.deleteUser);

module.exports = router;