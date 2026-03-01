const express = require("express");
const router = express.Router();
const {
    createDataRequest,
    getAllDataRequests,
    getDataRequestById,
    sendToExecutor,
    verifyToken,
    requestOtp,
    verifyOtp,
    executorApprove,
    sendToIssuer,
    issuerApprove,
    deleteDataRequest,
} = require("../controllers/dataRequestController");
const { authenticateToken } = require("../middleware/authMiddleware");

// Protected routes (require authentication)
router.post("/", authenticateToken, createDataRequest);
router.get("/", authenticateToken, getAllDataRequests);
router.get("/:id", authenticateToken, getDataRequestById);
router.post("/:id/send-to-executor", authenticateToken, sendToExecutor);
router.post("/:id/send-to-issuer", authenticateToken, sendToIssuer);
router.delete("/:id", authenticateToken, deleteDataRequest);

// Public routes (token-based authentication for external verification)
router.post("/verify-token", verifyToken);
router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);
router.post("/:id/executor-approve", executorApprove);
router.post("/:id/issuer-approve", issuerApprove);

module.exports = router;
