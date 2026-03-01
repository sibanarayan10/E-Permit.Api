const { body, param } = require("express-validator");

// =============================
//      APPROVE VALIDATION
// =============================
const approveValidation = [
  param("id")
    .isMongoId()
    .withMessage("Invalid permit ID"),

  body("comments")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Comments cannot exceed 500 characters")
];

// =============================
//      RETURN VALIDATION
// =============================
const returnValidation = [
  param("id")
    .isMongoId()
    .withMessage("Invalid permit ID"),

  body("returnedReason")
    .trim()
    .notEmpty()
    .withMessage("Return reason is required")
    .isLength({ max: 500 })
    .withMessage("Return reason cannot exceed 500 characters"),

  body("comments")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Comments cannot exceed 500 characters")
];

// =============================
//    RENEW PERMIT VALIDATION
// =============================
const renewPermitValidation = [
  param("id")
    .isMongoId()
    .withMessage("Invalid permit ID"),

  body("from.date")
    .notEmpty()
    .withMessage("From date is required")
    .isISO8601()
    .withMessage("From date must be a valid date"),

  body("to.date")
    .notEmpty()
    .withMessage("To date is required")
    .isISO8601()
    .withMessage("To date must be a valid date")
    .custom((value, { req }) => {
      const fromDate = req.body.from?.date;
      if (fromDate && value) {
        // Compare only date portion using UTC to avoid timezone issues
        const from = new Date(fromDate);
        const to = new Date(value);
        // Use UTC methods to avoid timezone conversion issues
        from.setUTCHours(0, 0, 0, 0);
        to.setUTCHours(0, 0, 0, 0);
        if (to < from) {
          throw new Error("To date must be on or after from date");
        }
      }
      return true;
    }),

  body("renewalReason")
    .notEmpty()
    .withMessage("Renewal reason is required")
    .isLength({ max: 500 })
    .withMessage("Renewal reason cannot exceed 500 characters")

];

module.exports = {
  approveValidation,
  returnValidation,
  renewPermitValidation
};
