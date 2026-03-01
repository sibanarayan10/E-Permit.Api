const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const stream = require('stream');
const logger = require('../utils/logger');

// Configure Cloudinary - check if it's configured
const isCloudinaryConfigured = () => {
  try {
    const config = cloudinary.config();
    return !!(config.cloud_name && config.api_key && config.api_secret);
  } catch (error) {
    return false;
  }
};

// Create multer storage in memory
const memoryStorage = multer.memoryStorage();

// Configure multer
const upload = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/svg+xml'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and SVG images are allowed.'), false);
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  }
});

// Function to upload buffer to Cloudinary
const uploadBufferToCloudinary = (buffer, userId) => {
  return new Promise((resolve, reject) => {
    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      reject(new Error('Cloudinary not configured'));
      return;
    }
    
    const timestamp = Date.now();
    const publicId = `signature_${userId}_${timestamp}`;
    const folder = process.env.CLOUDINARY_FOLDER || 'e-ptw/signatures';
    
    // Create a readable stream from buffer
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: publicId,
        resource_type: 'image',
        transformation: [
          { width: 300, height: 150, crop: 'limit' },
          { quality: 'auto:good' }
        ]
      },
      (error, result) => {
        if (error) {
          logger.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          logger.info(`✅ File uploaded to Cloudinary: ${result.public_id}`);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes
          });
        }
      }
    );
    
    bufferStream.pipe(uploadStream);
  });
};

// Middleware to handle signature upload
const handleSignatureUpload = async (req, res, next) => {
  // First check if Cloudinary is configured
  if (!isCloudinaryConfigured()) {
    logger.error('Cloudinary not configured. Check environment variables.');
    return res.status(500).json({
      success: false,
      message: 'Cloud storage service not configured. Please contact administrator.'
    });
  }

  // Use multer to parse the file
  upload.single('signature')(req, res, async (err) => {
    if (err) {
      logger.error('Multer error:', err);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 2MB.'
        });
      }
      
      if (err.message.includes('Invalid file type')) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Error processing signature file'
      });
    }
    
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No signature file provided'
      });
    }
    
    try {
      // Get user ID from authenticated user
      const userId = req.user?._id || 'anonymous';
      
      // Upload to Cloudinary
      const uploadResult = await uploadBufferToCloudinary(req.file.buffer, userId);
      
      // Add Cloudinary result to request
      req.uploadResult = uploadResult;
      
      logger.info(`✅ Signature uploaded successfully for user ${userId}`);
      
      next();
    } catch (uploadError) {
      logger.error('❌ Cloudinary upload error:', uploadError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload signature to cloud storage. Please try again.'
      });
    }
  });
};

module.exports = handleSignatureUpload;