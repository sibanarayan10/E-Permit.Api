const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDatabase = async () => {
  try {
    // Select MongoDB URL based on environment
    // VERCEL_ENV is automatically set by Vercel:
    // - "production" for production deployments
    // - "preview" for preview deployments (PRs, branches)
    // - undefined for local development
    const vercelEnv = process.env.VERCEL_ENV;

    let mongoURL;
    let envName;

    if (vercelEnv === "production") {
      // Production deployment - use Atlas production database
      mongoURL = process.env.MONGO_URL_ATLAS;
      envName = "Production (Atlas)";
    } else if (vercelEnv === "preview") {
      // Preview deployment (PRs, branches) - use development database
      mongoURL = process.env.MONGO_URL_DEV;
      envName = "Preview (Dev)";
    } else {
      // Local development - use local MongoDB
      mongoURL = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL_DEV;
      envName = "Local";
    }

    if (!mongoURL) {
      logger.error(`MongoDB connection URL is missing for environment: ${vercelEnv || 'local'}`);
      // Don't exit - let the app run so CORS/health endpoints work
      return;
    }

    logger.info(`🔄 Connecting to MongoDB [${envName}]...`);

    await mongoose.connect(mongoURL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      retryWrites: true,
      w: "majority"
    });

    logger.info(`✅ Successfully connected to MongoDB [${envName}]`);

    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });

    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      logger.info("MongoDB connection closed through app termination");
      process.exit(0);
    });

  } catch (error) {
    logger.error("❌ MongoDB connection failed:", error);
    // Don't exit - let the app run so CORS/health endpoints work
    // Individual routes will fail gracefully when DB is unavailable
  }
};

module.exports = connectDatabase;