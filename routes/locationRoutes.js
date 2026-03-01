const express = require("express");
const router = express.Router();
const locationController = require("../controllers/locationController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.use(authenticateToken);

router.get("/", locationController.getLocations);
router.get("/:location/sub-locations", locationController.getSubLocations);

module.exports = router;
