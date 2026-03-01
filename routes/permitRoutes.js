const express = require("express");
const router = express.Router();
const permitController = require("../controllers/permitController");
const { authenticateToken, authorizeWorkflowStage } = require("../middleware/authMiddleware");
const { handleValidationErrors } = require("../middleware/validationMiddleware");
const {
  approveValidation,
  returnValidation,
  renewPermitValidation
} = require("../validations/permitValidation");

// All routes require authentication
router.use(authenticateToken);

// Permit routes
router.get("/stats", permitController.getPermitStats);
router.get("/all-stats", permitController.getAllPermitStats); // Combined stats (General + Height)
router.get("/next-numbers", permitController.getNextPermitNumbers); // New route for getting next numbers
router.post("/", permitController.createPermit);
router.get("/my-permits", permitController.getMyPermits);
router.get("/all-permits", permitController.getAllPermits); // Combined permits (General + Height)
router.get("/available-executors", permitController.getAvailableExecutors);
router.get("/available-issuers", permitController.getAvailableIssuers);
router.get("/:id", permitController.getPermitById);
router.put("/:id", permitController.updatePermit);

router.post("/:id/renew", renewPermitValidation, handleValidationErrors, permitController.renewPermit);
// ==========================
//   CANCEL PERMIT (NON-WORKFLOW)
// ==========================
router.post(
  "/:id/cancel", handleValidationErrors,
  permitController.cancelPermit
);

// Workflow routes
router.put("/:id/submit-to-execution", permitController.submitToExecution);
router.put("/:id/execution-approve", approveValidation, handleValidationErrors, permitController.executionApprove);
router.put("/:id/execution-return", returnValidation, handleValidationErrors, permitController.executionReturn);
router.put("/:id/issuer-approve", approveValidation, handleValidationErrors, permitController.issuerApprove);
router.put("/:id/issuer-return", returnValidation, handleValidationErrors, permitController.issuerReturn);

// ==========================
//   CLOSURE WORKFLOW ROUTES
// ==========================
router.put("/:id/initiate-closure", permitController.initiateClose);
router.put("/:id/executor-approve-closure", permitController.executorApproveClosure);
router.put("/:id/issuer-approve-closure", permitController.issuerApproveClosure);

// Delete permit route
router.delete("/:id", permitController.deletePermit);

module.exports = router;