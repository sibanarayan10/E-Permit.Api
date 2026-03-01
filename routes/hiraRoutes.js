const express = require("express");
const router = express.Router();
const hiraController = require("../controllers/hiraController");
const { authenticateToken } = require("../middleware/authMiddleware");

/**
 * HIRA JSA Routes
 * 
 * All routes require authentication
 * 
 * Base path: /api/v1/hira
 */

// Apply authentication to all routes
router.use(authenticateToken);

// ============================================
//   REFERENCE DATA ROUTES (GET)
// ============================================

/**
 * GET /api/v1/hira/next-number
 * Get the next available HIRA number
 */
router.get("/next-number", hiraController.getNextHiraNumber);

/**
 * GET /api/v1/hira/risk-matrix
 * Get risk matrix reference data (for frontend display)
 * This is the middle information box data
 */
router.get("/risk-matrix", hiraController.getRiskMatrixData);

/**
 * GET /api/v1/hira/default
 * Get the default HIRA template for permits
 */
router.get("/default", hiraController.getDefaultHira);

// ============================================
//   CRUD ROUTES
// ============================================

/**
 * POST /api/v1/hira
 * Create a new HIRA JSA record
 * 
 * Request Body:
 * {
 *   "jobHeader": {
 *     "area": "Plant A",
 *     "jobType": "Maintenance",
 *     "jobDetails": "Pipe replacement",
 *     "preparedBy": "John Doe"
 *   },
 *   "rows": [...]
 * }
 */
router.post("/", hiraController.createHira);

/**
 * GET /api/v1/hira
 * Get all HIRA records with pagination
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 * - status: Filter by status (Draft/Submitted/Locked)
 * - area: Filter by area
 * - search: Search by HIRA number, area, or job type
 */
router.get("/", hiraController.getAllHiras);

/**
 * GET /api/v1/hira/:id
 * Get a single HIRA by ID
 */
router.get("/:id", hiraController.getHiraById);

/**
 * PUT /api/v1/hira/:id
 * Update a HIRA record
 * Cannot update locked records
 */
router.put("/:id", hiraController.updateHira);

/**
 * DELETE /api/v1/hira/:id
 * Delete a HIRA record
 * Cannot delete locked records
 */
router.delete("/:id", hiraController.deleteHira);

// ============================================
//   WORKFLOW ROUTES
// ============================================

/**
 * POST /api/v1/hira/:id/submit
 * Submit a HIRA record
 * Validates that ACM is provided for Medium+ risk levels
 */
router.post("/:id/submit", hiraController.submitHira);

/**
 * POST /api/v1/hira/:id/lock
 * Lock a HIRA record (makes it read-only)
 */
router.post("/:id/lock", hiraController.lockHira);

/**
 * POST /api/v1/hira/:id/clone
 * Clone an existing HIRA as a template
 */
router.post("/:id/clone", hiraController.cloneHira);

/**
 * POST /api/v1/hira/:id/set-default
 * Set a HIRA as the default template for permits (toggles on/off)
 */
router.post("/:id/set-default", hiraController.setDefaultHira);

// ============================================
//   EXPORT ROUTES (PHASE 3)
// ============================================

/**
 * GET /api/v1/hira/:id/export/pdf
 * Export HIRA to PDF format
 */
router.get("/:id/export/pdf", hiraController.exportToPdf);

/**
 * GET /api/v1/hira/:id/export/excel
 * Export HIRA to Excel format
 */
router.get("/:id/export/excel", hiraController.exportToExcel);

// ============================================
//   ROW MANAGEMENT ROUTES
// ============================================

/**
 * POST /api/v1/hira/:id/rows
 * Add a new row to an existing HIRA
 */
router.post("/:id/rows", hiraController.addRow);

/**
 * PUT /api/v1/hira/:id/rows/:rowId
 * Update a specific row in HIRA
 */
router.put("/:id/rows/:rowId", hiraController.updateRow);

/**
 * DELETE /api/v1/hira/:id/rows/:rowId
 * Delete a specific row from HIRA
 */
router.delete("/:id/rows/:rowId", hiraController.deleteRow);

module.exports = router;
