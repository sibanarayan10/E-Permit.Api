const express = require("express");
const router = express.Router();
const heightPermitController = require("../controllers/heightPermitController");
const { authenticateToken, authorizeWorkflowStage } = require("../middleware/authMiddleware");
const { WORKFLOW_STAGES } = require("../config/constants");

// All height permit routes require authentication
router.use(authenticateToken);

// Get available executors and issuers
router.get("/executors", heightPermitController.getAvailableExecutors);
router.get("/issuers", heightPermitController.getAvailableIssuers);

// Get my height permits
router.get("/my-permits", heightPermitController.getMyHeightPermits);

// Get height permit statistics
router.get("/stats", heightPermitController.getHeightPermitStats);

// Get next permit numbers
router.get("/next-numbers", heightPermitController.getNextHeightPermitNumbers);

// Get height permit by ID
router.get("/:id", heightPermitController.getHeightPermitById);

// Download height permit PDF (backend generation)
router.get("/:id/download-pdf", heightPermitController.downloadHeightPermitPDF);

// Create height permit (Initiators only)
router.post(
    "/",
    authorizeWorkflowStage(WORKFLOW_STAGES.INITIATOR),
    heightPermitController.createHeightPermit
);

// Update height permit (Initiators only, in draft stage)
router.put(
    "/:id",
    authorizeWorkflowStage(WORKFLOW_STAGES.INITIATOR),
    heightPermitController.updateHeightPermit
);

// Delete height permit (Initiators only, in draft stage)
router.delete(
    "/:id",
    authorizeWorkflowStage(WORKFLOW_STAGES.INITIATOR),
    heightPermitController.deleteHeightPermit
);

// Submit to execution (Initiators only)
router.post(
    "/:id/submit",
    authorizeWorkflowStage(WORKFLOW_STAGES.INITIATOR),
    heightPermitController.submitToExecution
);

// Execution approve (Executors only)
router.post(
    "/:id/execute-approve",
    authorizeWorkflowStage(WORKFLOW_STAGES.EXECUTION),
    heightPermitController.executionApprove
);

// Execution return (Executors only)
router.post(
    "/:id/execute-return",
    authorizeWorkflowStage(WORKFLOW_STAGES.EXECUTION),
    heightPermitController.executionReturn
);

// Issuer approve (Issuers only)
router.post(
    "/:id/issuer-approve",
    authorizeWorkflowStage(WORKFLOW_STAGES.ISSUER),
    heightPermitController.issuerApprove
);

// Issuer return (Issuers only)
router.post(
    "/:id/issuer-return",
    authorizeWorkflowStage(WORKFLOW_STAGES.ISSUER),
    heightPermitController.issuerReturn
);

// Closure workflow routes
router.post(
    "/:id/initiate-close",
    authorizeWorkflowStage(WORKFLOW_STAGES.INITIATOR),
    heightPermitController.initiateClose
);

router.post(
    "/:id/executor-close",
    authorizeWorkflowStage(WORKFLOW_STAGES.EXECUTION),
    heightPermitController.executorApproveClosure
);

router.post(
    "/:id/issuer-close",
    authorizeWorkflowStage(WORKFLOW_STAGES.ISSUER),
    heightPermitController.issuerApproveClosure
);

// Renewal route
router.post(
    "/:id/renew",
    authorizeWorkflowStage(WORKFLOW_STAGES.INITIATOR),
    heightPermitController.renewHeightPermit
);

// Cancel route (no workflow restriction - controller handles permission logic)
router.post(
    "/:id/cancel",
    heightPermitController.cancelHeightPermit
);

module.exports = router;
