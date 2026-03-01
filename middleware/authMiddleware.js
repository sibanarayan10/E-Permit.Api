const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { COOKIE_CONFIG, ROLES, WORKFLOW_STAGES } = require("../config/constants");
const logger = require("../utils/logger");

const authenticateToken = async (req, res, next) => {
  try {
    // Skip for OPTIONS requests
    if (req.method === "OPTIONS") {
      return next();
    }

    const token = req.signedCookies[COOKIE_CONFIG.NAME];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No authentication token provided."
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user exists and is active
    const user = await User.findById(decoded.id).select("-password");
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or account is inactive."
      });
    }

    req.user = user;
    res.locals.jwtData = decoded;
    
    next();
  } catch (error) {
    logger.error("Authentication error:", error);
    
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token."
      });
    }
    
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired."
      });
    }

    return res.status(500).json({
      success: false,
      message: "Authentication failed."
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(", ")}`
      });
    }
    next();
  };
};

const authorizeWorkflowStage = (...stages) => {
  return (req, res, next) => {
    if (!stages.includes(req.user.workflowStage)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required workflow stage: ${stages.join(", ")}`
      });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorize,
  authorizeWorkflowStage
};