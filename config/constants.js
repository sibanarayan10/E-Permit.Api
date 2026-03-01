const ROLES = {
  ADMIN: "ADMIN",
  SUBADMIN: "SUBADMIN",
  CLIENT: "CLIENT"
};

const PERMIT_STATUS = {
  DRAFT: "Draft",
  PENDING_EXECUTION: "Pending_Execution",
  PENDING_ISSUER: "Pending_Issuer",
  APPROVED: "Approved",
  RETURNED: "Returned",
  REJECTED: "Rejected",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  // Closure workflow statuses
  PENDING_CLOSURE_EXECUTION: "Pending_Closure_Execution",
  PENDING_CLOSURE_ISSUER: "Pending_Closure_Issuer",
};

const NOTIFICATION_TYPES = {
  PERMIT_CREATED: "PERMIT_CREATED",
  PERMIT_UPDATED: "PERMIT_UPDATED",
  PERMIT_APPROVED: "PERMIT_APPROVED",
  PERMIT_RETURNED: "PERMIT_RETURNED",
  PERMIT_REJECTED: "PERMIT_REJECTED",
  PERMIT_FORWARDED: "PERMIT_FORWARDED",
  PERMIT_DELETED: "PERMIT_DELETED",
  // Closure workflow notifications
  CLOSURE_INITIATED: "CLOSURE_INITIATED",
  CLOSURE_APPROVED_EXECUTION: "CLOSURE_APPROVED_EXECUTION",
  CLOSURE_APPROVED_ISSUER: "CLOSURE_APPROVED_ISSUER",
  PERMIT_CLOSED: "PERMIT_CLOSED"
};

const WORKFLOW_STAGES = {
  INITIATOR: "Initiator",
  EXECUTION: "Execution",
  ISSUER: "Issuer"
};

const COOKIE_CONFIG = {
  NAME: "auth_token",
  OPTIONS: {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    signed: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    domain: process.env.NODE_ENV === "production" ? ".vercel.app" : undefined,
    path: "/",
  }
};

const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100
};

const RESPONSE_MESSAGES = {
  USER_CREATED: "User registered successfully",
  USER_LOGGED_IN: "Login successful",
  USER_LOGGED_OUT: "Logged out successfully",
  USER_NOT_FOUND: "User not found",
  USER_UNAUTHORIZED: "Unauthorized access",
  PASSWORD_CHANGED: "Password changed successfully",

  PERMIT_CREATED: "Permit created successfully",
  PERMIT_UPDATED: "Permit updated successfully",
  PERMIT_DELETED: "Permit deleted successfully",
  PERMIT_APPROVED: "Permit approved successfully",
  PERMIT_RETURNED: "Permit returned successfully",
  PERMIT_FORWARDED: "Permit forwarded successfully",
  PERMIT_NOT_FOUND: "Permit not found",

  INTERNAL_SERVER_ERROR: "Internal server error",
  VALIDATION_ERROR: "Validation failed",
  DUPLICATE_ERROR: "Resource already exists",
  NOT_FOUND: "Resource not found",
  FORBIDDEN: "Access forbidden"
};
const LOCATIONS = {
  PLANT_A: "Bhilai"
};

const SUB_LOCATIONS = {
  [LOCATIONS.PLANT_A]: [
    "DIC-01-CO-CCD",
    "DIC-02-BF-1-8-SGP",
    "DIC-03-EMD",
    "DIC-04-UTILITIES",
    "DIC-05-SMS2",
    "DIC-06-SHOPS",
    "DIC-07-PLATEMILL",
    "DIC-08-PBS",
    "DIC-09-RSM-RTR",
    "DIC-10-RMP",
    "DIC-11-WMD",
    "DIC-12-WRM-MM",
    "DIC-13-BRM",
    "DIC-14-MECH",
    "DIC-15-OHP",
    "DIC-16-SP2",
    "DIC-17-SP3",
    "DIC-18-T&D",
    "DIC-19-URM",
    "DIC-20-SMS3",
    "DIC-21-ELECT-ORG",
    "DIC-22-RCL",
    "DIC-23-INA",
    "DIC-24-RED",
    "DIC-25-SERVICES",
    "DIC-26-TOWNSERVICES-CnIT-HRD",
    "DIC-27-PROJECTS-CONSTRUCTION",
    "DIC-28-FINANCE-ACCOUNTS-MM",
    "DIC-29-FIRE-SAFETY-ENV"
  ]
};

// Auto-numbering configuration
const PERMIT_NUMBER_CONFIG = {
  PREFIX: "PT",
  SEPARATOR: "-",
  YEAR_LENGTH: 4
};

module.exports = {
  ROLES,
  PERMIT_STATUS,
  WORKFLOW_STAGES,
  NOTIFICATION_TYPES,
  COOKIE_CONFIG,
  PAGINATION,
  RESPONSE_MESSAGES,
  PERMIT_NUMBER_CONFIG,
  LOCATIONS,
  SUB_LOCATIONS
};