const jwt = require("jsonwebtoken");
const logger = require("./logger");

const createToken = (id, email, role, workflowStage, expiresIn = "7d") => {
  try {
    const payload = { 
      id, 
      email, 
      role, 
      workflowStage,
      iat: Math.floor(Date.now() / 1000)
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET, { 
      expiresIn,
      issuer: "e-ptw-system",
      audience: "e-ptw-users"
    });
  } catch (error) {
    logger.error("Token creation error:", error);
    throw new Error("Failed to create authentication token");
  }
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "e-ptw-system",
      audience: "e-ptw-users"
    });
  } catch (error) {
    logger.error("Token verification error:", error);
    throw error;
  }
};

const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    logger.error("Token decoding error:", error);
    return null;
  }
};

const getTokenFromRequest = (req) => {
  return req.signedCookies[process.env.COOKIE_NAME] || 
         req.headers['authorization']?.replace('Bearer ', '');
};

module.exports = {
  createToken,
  verifyToken,
  decodeToken,
  getTokenFromRequest
};