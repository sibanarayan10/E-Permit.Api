const cloudinary = require('cloudinary').v2;
const logger = require('../utils/logger');

const configureCloudinary = () => {
  try {
    // Check if environment variables are set
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      logger.warn('⚠️  Cloudinary environment variables missing. Signature upload will not work.');
      return null;
    }

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });

    // Test the connection by getting cloud name
    const config = cloudinary.config();
    logger.info(`✅ Cloudinary connected successfully - Cloud: ${config.cloud_name}`);
    
    return cloudinary;
  } catch (error) {
    logger.error('❌ Cloudinary configuration failed:', error.message);
    return null;
  }
};

module.exports = configureCloudinary;