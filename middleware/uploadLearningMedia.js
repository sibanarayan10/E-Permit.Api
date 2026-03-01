/**
 * Middleware for uploading learning media (video + thumbnail) to Cloudinary
 * Uses multer for multipart handling, then streams to Cloudinary
 */

const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const logger = require("../utils/logger");

// Multer storage - memory buffer (no disk writes)
const storage = multer.memoryStorage();

// File filter: accept video and image files
const fileFilter = (req, file, cb) => {
    const allowedVideo = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
    const allowedImage = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (file.fieldname === "video" && allowedVideo.includes(file.mimetype)) {
        cb(null, true);
    } else if (file.fieldname === "thumbnail" && allowedImage.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type for ${file.fieldname}: ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100 MB max per file
    },
});

// Upload buffer to Cloudinary as a promise
const uploadToCloudinary = (buffer, options) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
        stream.end(buffer);
    });
};

/**
 * Process and upload learning media after multer parsing
 */
const processLearningMedia = async (req, res, next) => {
    try {
        // Upload thumbnail if present
        if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
            const thumbnailFile = req.files.thumbnail[0];
            const result = await uploadToCloudinary(thumbnailFile.buffer, {
                folder: "eptw-learning/thumbnails",
                resource_type: "image",
                transformation: [{ width: 640, height: 360, crop: "fill", quality: "auto" }],
                timeout: 120000, // 2 min timeout for image
            });
            req.body.thumbnail = {
                url: result.secure_url,
                publicId: result.public_id,
            };
        }

        // Upload video if present
        if (req.files && req.files.video && req.files.video[0]) {
            const videoFile = req.files.video[0];
            const result = await uploadToCloudinary(videoFile.buffer, {
                folder: "eptw-learning/videos",
                resource_type: "video",
                chunk_size: 10000000,   // 10 MB chunks for faster upload
                timeout: 300000,        // 5 min timeout for video
            });
            req.body.video = {
                url: result.secure_url,
                publicId: result.public_id,
            };
        }

        next();
    } catch (error) {
        logger.error("Learning media upload error:", error);
        const isTimeout = error.message?.toLowerCase().includes("timeout") ||
            error.http_code === 499;
        return res.status(isTimeout ? 408 : 500).json({
            success: false,
            message: isTimeout
                ? "Media upload timed out. Please try with a smaller file."
                : "Failed to upload media files",
            error: error.message,
        });
    }
};

// Delete media from Cloudinary
const deleteFromCloudinary = async (publicId, resourceType = "image") => {
    try {
        if (!publicId) return;
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
        logger.error(`Failed to delete ${resourceType} from Cloudinary:`, error);
    }
};

module.exports = {
    uploadLearningFields: upload.fields([
        { name: "video", maxCount: 1 },
        { name: "thumbnail", maxCount: 1 },
    ]),
    processLearningMedia,
    deleteFromCloudinary,
};
