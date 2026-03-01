const { body, param } = require("express-validator");
const { ROLES, WORKFLOW_STAGES, LOCATIONS, SUB_LOCATIONS } = require("../config/constants");
const User = require("../models/User");

const loginValidation = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
];

const updateProfileValidation = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 3 })
    .withMessage("Name must be at least 3 characters long")
    .isLength({ max: 100 })
    .withMessage("Name cannot exceed 100 characters")
];

const createUserValidation = [
  body("name")
    .trim()
    .isLength({ min: 3 })
    .withMessage("Name must be at least 3 characters long")
    .isLength({ max: 100 })
    .withMessage("Name cannot exceed 100 characters"),

  body("userId")
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("User ID must be exactly 6 digits")
    .isNumeric()
    .withMessage("User ID must contain only numbers")
    .custom(async (userId) => {
      const existingUser = await User.findOne({ userId });
      if (existingUser) {
        throw new Error("User ID already exists. Please use a unique User ID");
      }
      return true;
    }),

  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email")
    .custom(async (email) => {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error("User already registered with this email");
      }
      return true;
    }),

  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),

  body("role")
    .optional()
    .isIn(Object.values(ROLES))
    .withMessage(`Role must be one of: ${Object.values(ROLES).join(", ")}`),

  body("workflowStage")
    .optional()
    .isIn(Object.values(WORKFLOW_STAGES))
    .withMessage(`Workflow stage must be one of: ${Object.values(WORKFLOW_STAGES).join(", ")}`),

  body("phone")
    .optional()
    .trim()
    .matches(/^[+]?[\d\s-]{10,15}$/)
    .withMessage("Please provide a valid phone number (10-15 digits)"),

  body("location")
    .optional()
    .isIn(Object.values(LOCATIONS))
    .withMessage("Invalid location"),

  body("subLocation")
    .optional()
    .custom((value, { req }) => {
      if (!value) return true;
      const location = req.body.location;
      // If location is changing, validate against new location.
      // If location is NOT changing, we strictly should validate against existing user location, 
      // but in update, usually both are sent if one is changed, or we rely on the frontend sending current state. 
      // For simplicity in validation middleware without DB lookup, we assume if subLocation is sent, location should also be sent or we loosen the check.
      // However, to be safe: valid if location matches.
      if (location && (!SUB_LOCATIONS[location] || !SUB_LOCATIONS[location].includes(value))) {
        throw new Error("Invalid sub-location for selected location");
      }
      return true;
    }),

  body("location")
    .optional()
    .isIn(Object.values(LOCATIONS))
    .withMessage("Invalid location"),

  body("subLocation")
    .optional()
    .custom((value, { req }) => {
      if (!value) return true;
      const location = req.body.location;
      if (!location) {
        throw new Error("Location is required when sub-location is provided");
      }
      if (
        !SUB_LOCATIONS[location] ||
        !SUB_LOCATIONS[location].includes(value)
      ) {
        throw new Error("Invalid sub-location for selected location");
      }
      return true;
    })
];

const updateUserValidation = [
  param("id")
    .isMongoId()
    .withMessage("Invalid user ID"),

  body("name")
    .optional()
    .trim()
    .isLength({ min: 3 })
    .withMessage("Name must be at least 3 characters long")
    .isLength({ max: 100 })
    .withMessage("Name cannot exceed 100 characters"),

  body("email")
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),

  body("userId")
    .optional()
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("User ID must be exactly 6 digits")
    .isNumeric()
    .withMessage("User ID must contain only numbers")
    .custom(async (userId, { req }) => {
      const existingUser = await User.findOne({ userId, _id: { $ne: req.params.id } });
      if (existingUser) {
        throw new Error("User ID already exists. Please use a unique User ID");
      }
      return true;
    }),

  body("role")
    .optional()
    .isIn(Object.values(ROLES))
    .withMessage(`Role must be one of: ${Object.values(ROLES).join(", ")}`),

  body("workflowStage")
    .optional()
    .isIn(Object.values(WORKFLOW_STAGES))
    .withMessage(`Workflow stage must be one of: ${Object.values(WORKFLOW_STAGES).join(", ")}`),

  body("phone")
    .optional()
    .trim()
    .matches(/^[+]?[\d\s-]{10,15}$/)
    .withMessage("Please provide a valid phone number (10-15 digits)"),

  body("location")
    .optional()
    .isIn(Object.values(LOCATIONS))
    .withMessage("Invalid location"),

  body("subLocation")
    .optional()
    .custom((value, { req }) => {
      if (!value) return true;
      const location = req.body.location;
      // If location is changing, validate against new location.
      // If location is NOT changing, we strictly should validate against existing user location, 
      // but in update, usually both are sent if one is changed, or we rely on the frontend sending current state. 
      // For simplicity in validation middleware without DB lookup, we assume if subLocation is sent, location should also be sent or we loosen the check.
      // However, to be safe: valid if location matches.
      if (location && (!SUB_LOCATIONS[location] || !SUB_LOCATIONS[location].includes(value))) {
        throw new Error("Invalid sub-location for selected location");
      }
      return true;
    }),

  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean value")
];

const changePasswordValidation = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),

  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters long")
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error("New password must be different from current password");
      }
      return true;
    }),

  body("confirmPassword")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Passwords do not match");
      }
      return true;
    })
];

const forgotPasswordValidation = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email")
];

const resetPasswordValidation = [
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),

  body("confirmPassword")
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    })
];

module.exports = {
  loginValidation,
  updateProfileValidation,
  createUserValidation,
  updateUserValidation,
  changePasswordValidation,
  forgotPasswordValidation,
  resetPasswordValidation
};
