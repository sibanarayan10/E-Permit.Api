const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const mongoose = require("mongoose");

const connectDatabase = require("./config/database");
const configureCloudinary = require("./config/cloudinary");
const appRoutes = require("./routes/appRoutes");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");

dotenv.config();

const app = express();
app.set("trust proxy", 1);
/* =========================================================
   CORS (MUST BE FIRST – DO NOT THROW ERRORS)
========================================================= */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server, Postman, cron jobs
    if (!origin) return callback(null, true);

    // Allow all Vercel deployments (prod + preview)
    if (/\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }

    // Allow local development
    if (origin.startsWith("http://localhost")) {
      return callback(null, true);
    }

    // Block silently (don't throw error - this is important!)
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* =========================================================
   SECURITY MIDDLEWARE
========================================================= */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);

app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

/* =========================================================
   RATE LIMITING
========================================================= */
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
  })
);

/* =========================================================
   BODY PARSERS & COOKIES
========================================================= */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser(process.env.COOKIE_SECRET));

/* =========================================================
   LOGGING
========================================================= */
app.use(morgan("combined", { stream: logger.stream }));

/* =========================================================
   DATABASE & CLOUDINARY
========================================================= */
connectDatabase();

const cloudinary = configureCloudinary();
if (!cloudinary) {
  logger.warn("⚠️ Cloudinary not configured");
}

/* =========================================================
   ROUTES
========================================================= */
app.use("/api/v1", appRoutes);

/* =========================================================
   HEALTH CHECK
========================================================= */
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server running",
    environment: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    uptime: process.uptime(),
    services: {
      mongodb:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      cloudinary: cloudinary
        ? {
            configured: true,
            cloudName: cloudinary.config().cloud_name,
          }
        : { configured: false },
    },
  });
});

/* =========================================================
   404 HANDLER
========================================================= */
app.use("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */
app.use(errorHandler);

/* =========================================================
   LOCAL SERVER (NOT USED BY VERCEL)
========================================================= */
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () =>
    logger.info(`✅ Server running on http://localhost:${PORT}`)
  );
}

/* =========================================================
   EXPORT FOR VERCEL
========================================================= */
module.exports = app;
