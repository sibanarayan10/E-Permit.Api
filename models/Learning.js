/**
 * Learning Topic Model
 * Stores e-PTW learning/training content
 */

const mongoose = require("mongoose");

const learningSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            maxlength: [200, "Title cannot exceed 200 characters"],
        },
        shortDescription: {
            type: String,
            required: [true, "Short description is required"],
            trim: true,
            maxlength: [400, "Short description cannot exceed 300 characters"],
        },
        detailedDescription: {
            type: String,
            required: [true, "Detailed description is required"],
        },
        video: {
            url: { type: String, default: "" },
            publicId: { type: String, default: "" },
        },
        thumbnail: {
            url: { type: String, default: "" },
            publicId: { type: String, default: "" },
        },
        instructor: {
            type: String,
            trim: true,
            default: "",
        },
        duration: {
            type: String,
            trim: true,
            default: "",
        },
        category: {
            type: String,
            trim: true,
            default: "General",
        },
        isPublished: {
            type: Boolean,
            default: true,
        },
        order: {
            type: Number,
            default: 0,
        },
        viewCount: {
            type: Number,
            default: 0,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
    }
);

// Index for sorting and filtering
learningSchema.index({ isPublished: 1, order: 1, createdAt: -1 });

module.exports = mongoose.model("Learning", learningSchema);
