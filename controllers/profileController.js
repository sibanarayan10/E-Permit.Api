const User = require("../models/User");
const cloudinary = require('cloudinary').v2;
const { RESPONSE_MESSAGES } = require("../config/constants");
const logger = require("../utils/logger");

// ==================== PROFILE PICTURE FUNCTIONS ====================
exports.uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user._id;
    const uploadResult = req.uploadResult;

    if (!uploadResult) {
      return res.status(400).json({
        success: false,
        message: "No upload result found"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.USER_NOT_FOUND
      });
    }

    // Delete old profile picture from Cloudinary if exists
    if (user.profilePicture && user.profilePicture.publicId) {
      try {
        await cloudinary.uploader.destroy(user.profilePicture.publicId);
        logger.info(`Deleted old profile picture for user: ${user.email}`);
      } catch (deleteError) {
        logger.warn(`Failed to delete old profile picture: ${deleteError.message}`);
      }
    }

    // Update user with new profile picture
    user.profilePicture = {
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      uploadedAt: new Date()
    };

    await user.save();

    logger.info(`Profile picture uploaded for user: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "Profile picture uploaded successfully",
      data: {
        profilePicture: user.profilePicture
      }
    });

  } catch (error) {
    logger.error("Profile picture upload error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.deleteProfilePicture = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.USER_NOT_FOUND
      });
    }

    if (!user.profilePicture || !user.profilePicture.publicId) {
      return res.status(400).json({
        success: false,
        message: "No profile picture found to delete"
      });
    }

    // Delete profile picture from Cloudinary
    try {
      await cloudinary.uploader.destroy(user.profilePicture.publicId);
    } catch (deleteError) {
      logger.warn(`Failed to delete profile picture from Cloudinary: ${deleteError.message}`);
    }

    // Remove profile picture from user document
    user.profilePicture = {
      url: null,
      publicId: null,
      uploadedAt: null
    };

    await user.save();

    logger.info(`Profile picture deleted for user: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "Profile picture deleted successfully"
    });

  } catch (error) {
    logger.error("Profile picture deletion error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.getProfilePicture = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("profilePicture name email");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.USER_NOT_FOUND
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile picture fetched successfully",
      data: {
        profilePicture: user.profilePicture,
        user: {
          name: user.name,
          email: user.email
        }
      }
    });

  } catch (error) {
    logger.error("Get profile picture error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

// ==================== SIGNATURE FUNCTIONS ====================
exports.uploadSignature = async (req, res) => {
  try {
    const userId = req.user._id;
    const uploadResult = req.uploadResult;

    if (!uploadResult) {
      return res.status(400).json({
        success: false,
        message: "No upload result found"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.USER_NOT_FOUND
      });
    }

    // Delete old signature from Cloudinary if exists
    if (user.signature && user.signature.publicId) {
      try {
        await cloudinary.uploader.destroy(user.signature.publicId);
        logger.info(`Deleted old signature for user: ${user.email}`);
      } catch (deleteError) {
        logger.warn(`Failed to delete old signature: ${deleteError.message}`);
      }
    }

    // Update user with new signature
    user.signature = {
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      uploadedAt: new Date()
    };

    await user.save();

    logger.info(`Signature uploaded for user: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "Signature uploaded successfully",
      data: {
        signature: user.signature
      }
    });

  } catch (error) {
    logger.error("Signature upload error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.deleteSignature = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.USER_NOT_FOUND
      });
    }

    if (!user.signature || !user.signature.publicId) {
      return res.status(400).json({
        success: false,
        message: "No signature found to delete"
      });
    }

    // Delete signature from Cloudinary
    try {
      await cloudinary.uploader.destroy(user.signature.publicId);
    } catch (deleteError) {
      logger.warn(`Failed to delete signature from Cloudinary: ${deleteError.message}`);
    }

    // Remove signature from user document
    user.signature = {
      url: null,
      publicId: null,
      uploadedAt: null
    };

    await user.save();

    logger.info(`Signature deleted for user: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "Signature deleted successfully"
    });

  } catch (error) {
    logger.error("Signature deletion error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.getSignature = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("signature name email");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.USER_NOT_FOUND
      });
    }

    return res.status(200).json({
      success: true,
      message: "Signature fetched successfully",
      data: {
        signature: user.signature,
        user: {
          name: user.name,
          email: user.email
        }
      }
    });

  } catch (error) {
    logger.error("Get signature error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

// ==================== COMBINED FUNCTIONS ====================
exports.getProfileAndSignature = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("profilePicture signature name email");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.USER_NOT_FOUND
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile data fetched successfully",
      data: {
        profilePicture: user.profilePicture,
        signature: user.signature,
        user: {
          name: user.name,
          email: user.email
        }
      }
    });

  } catch (error) {
    logger.error("Get profile data error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

// Admin: Get user's profile and signature
exports.getUserProfileData = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select("name email profilePicture signature");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.USER_NOT_FOUND
      });
    }

    return res.status(200).json({
      success: true,
      message: "User profile data fetched successfully",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        },
        profilePicture: user.profilePicture,
        signature: user.signature
      }
    });

  } catch (error) {
    logger.error("Get user profile data error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};