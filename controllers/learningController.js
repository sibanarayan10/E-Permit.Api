/**
 * Learning Controller
 * CRUD operations for e-PTW learning/training content
 */

const Learning = require("../models/Learning");
const { deleteFromCloudinary } = require("../middleware/uploadLearningMedia");
const logger = require("../utils/logger");

/**
 * GET /api/v1/learning
 * Get all published learning topics (for all users)
 */
const getAllLearning = async (req, res) => {
    try {
        const { category, search, page = 1, limit = 50 } = req.query;

        const filter = { isPublished: true };
        if (category && category !== "All") filter.category = { $regex: category, $options: "i" };
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: "i" } },
                { shortDescription: { $regex: search, $options: "i" } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [topics, total] = await Promise.all([
            Learning.find(filter)
                .sort({ order: 1, createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate("createdBy", "name email"),
            Learning.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            data: topics,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        logger.error("Get all learning error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch learning topics",
            error: error.message,
        });
    }
};

/**
 * GET /api/v1/learning/admin
 * Get all learning topics including unpublished (admin only)
 */
const getAllLearningAdmin = async (req, res) => {
    try {
        const topics = await Learning.find()
            .sort({ order: 1, createdAt: -1 })
            .populate("createdBy", "name email");

        res.status(200).json({
            success: true,
            data: topics,
        });
    } catch (error) {
        logger.error("Get all learning (admin) error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch learning topics",
            error: error.message,
        });
    }
};

/**
 * GET /api/v1/learning/:id
 * Get single learning topic by ID
 */
const getLearningById = async (req, res) => {
    try {
        const topic = await Learning.findById(req.params.id).populate(
            "createdBy",
            "name email"
        );

        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Learning topic not found",
            });
        }

        res.status(200).json({
            success: true,
            data: topic,
        });
    } catch (error) {
        logger.error("Get learning by ID error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch learning topic",
            error: error.message,
        });
    }
};

/**
 * POST /api/v1/learning
 * Create a new learning topic (admin only)
 */
const createLearning = async (req, res) => {
    try {
        const {
            title,
            shortDescription,
            detailedDescription,
            video,
            thumbnail,
            instructor,
            duration,
            category,
            isPublished,
            order,
        } = req.body;

        const topic = await Learning.create({
            title,
            shortDescription,
            detailedDescription,
            video: video || { url: "", publicId: "" },
            thumbnail: thumbnail || { url: "", publicId: "" },
            instructor: instructor || "",
            duration: duration || "",
            category: category || "General",
            isPublished: isPublished !== undefined ? isPublished : true,
            order: order || 0,
            createdBy: req.user._id,
        });

        const populated = await Learning.findById(topic._id).populate(
            "createdBy",
            "name email"
        );

        res.status(201).json({
            success: true,
            message: "Learning topic created successfully",
            data: populated,
        });
    } catch (error) {
        logger.error("Create learning error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create learning topic",
            error: error.message,
        });
    }
};

/**
 * PUT /api/v1/learning/:id
 * Update a learning topic (admin only)
 */
const updateLearning = async (req, res) => {
    try {
        const existing = await Learning.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Learning topic not found",
            });
        }

        const {
            title,
            shortDescription,
            detailedDescription,
            video,
            thumbnail,
            instructor,
            duration,
            category,
            isPublished,
            order,
        } = req.body;

        // If new thumbnail uploaded, delete old one
        if (thumbnail && thumbnail.publicId && existing.thumbnail.publicId) {
            await deleteFromCloudinary(existing.thumbnail.publicId, "image");
        }

        // If new video uploaded, delete old one
        if (video && video.publicId && existing.video.publicId) {
            await deleteFromCloudinary(existing.video.publicId, "video");
        }

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (shortDescription !== undefined) updateData.shortDescription = shortDescription;
        if (detailedDescription !== undefined) updateData.detailedDescription = detailedDescription;
        if (video) updateData.video = video;
        if (thumbnail) updateData.thumbnail = thumbnail;
        if (instructor !== undefined) updateData.instructor = instructor;
        if (duration !== undefined) updateData.duration = duration;
        if (category !== undefined) updateData.category = category;
        if (isPublished !== undefined) updateData.isPublished = isPublished;
        if (order !== undefined) updateData.order = order;

        const topic = await Learning.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).populate("createdBy", "name email");

        res.status(200).json({
            success: true,
            message: "Learning topic updated successfully",
            data: topic,
        });
    } catch (error) {
        logger.error("Update learning error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update learning topic",
            error: error.message,
        });
    }
};

/**
 * DELETE /api/v1/learning/:id
 * Delete a learning topic (admin only)
 */
const deleteLearning = async (req, res) => {
    try {
        const topic = await Learning.findById(req.params.id);
        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Learning topic not found",
            });
        }

        // Delete media from Cloudinary
        if (topic.thumbnail.publicId) {
            await deleteFromCloudinary(topic.thumbnail.publicId, "image");
        }
        if (topic.video.publicId) {
            await deleteFromCloudinary(topic.video.publicId, "video");
        }

        await Learning.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: "Learning topic deleted successfully",
        });
    } catch (error) {
        logger.error("Delete learning error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete learning topic",
            error: error.message,
        });
    }
};

/**
 * PATCH /api/v1/learning/:id/view
 * Increment view count for a learning topic
 */
const incrementViewCount = async (req, res) => {
    try {
        const topic = await Learning.findByIdAndUpdate(
            req.params.id,
            { $inc: { viewCount: 1 } },
            { new: true }
        );

        if (!topic) {
            return res.status(404).json({
                success: false,
                message: "Learning topic not found",
            });
        }

        res.status(200).json({
            success: true,
            data: { viewCount: topic.viewCount },
        });
    } catch (error) {
        logger.error("Increment view count error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update view count",
            error: error.message,
        });
    }
};

module.exports = {
    getAllLearning,
    getAllLearningAdmin,
    getLearningById,
    createLearning,
    updateLearning,
    deleteLearning,
    incrementViewCount,
};
