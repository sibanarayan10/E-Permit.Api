const User = require("../models/User");
const crypto = require("crypto");
const { hash, compare } = require("bcrypt");
const { createToken } = require("../utils/tokenManager");
const { COOKIE_CONFIG, ROLES, RESPONSE_MESSAGES, WORKFLOW_STAGES } = require("../config/constants");
const logger = require("../utils/logger");
const { sendTemplateEmail, getTransporter } = require("../services/emailService");
const { recordLoginAttempt, recordLogout } = require("./activityController");

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    // Hash new password
    const hashedNewPassword = await hash(newPassword, 12);

    // Update password
    user.password = hashedNewPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });

  } catch (error) {
    logger.error("Password change error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.getSystemInfo = async (req, res) => {
  try {
    const user = req.user;

    // Only admin can access system info
    if (user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin role required."
      });
    }

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const adminUsers = await User.countDocuments({ role: ROLES.ADMIN });
    const clientUsers = await User.countDocuments({ role: ROLES.CLIENT });

    const workflowStats = await User.aggregate([
      { $match: { role: ROLES.CLIENT, workflowStage: { $ne: null } } },
      {
        $group: {
          _id: "$workflowStage",
          count: { $sum: 1 }
        }
      }
    ]);

    const systemInfo = {
      totalUsers,
      activeUsers,
      adminUsers,
      clientUsers,
      workflowStats: workflowStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      serverTime: new Date().toISOString(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV
    };

    return res.status(200).json({
      success: true,
      message: "System information fetched successfully",
      data: systemInfo
    });

  } catch (error) {
    logger.error("Error fetching system info:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.userLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Record failed attempt (no user found, use email as identifier)
      // We can't link to a user document, so skip tracking for non-existent users
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    // Check if user is active
    if (!user.isActive) {
      // Record failed attempt – account deactivated
      recordLoginAttempt(req, user._id, "failed", "Account deactivated").catch(() => { });
      return res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact administrator."
      });
    }

    // Verify password
    const isPasswordValid = await compare(password, user.password);
    if (!isPasswordValid) {
      // Record failed attempt – wrong password
      recordLoginAttempt(req, user._id, "failed", "Invalid password").catch(() => { });
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    // Generate token
    const token = createToken(
      user._id.toString(),
      user.email,
      user.role,
      user.workflowStage,
    );

    // Set cookie
    res.cookie(COOKIE_CONFIG.NAME, token, COOKIE_CONFIG.OPTIONS);

    // Record successful login attempt & create session (non-blocking)
    recordLoginAttempt(req, user._id, "success").catch(() => { });

    logger.info(`User logged in: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: RESPONSE_MESSAGES.USER_LOGGED_IN,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        workflowStage: user.workflowStage,
        signature: user.signature
      }
    });

  } catch (error) {
    logger.error("User login error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.userLogout = async (req, res) => {
  // Record logout & close session (non-blocking)
  recordLogout(req.user._id).catch(() => { });

  res.clearCookie(COOKIE_CONFIG.NAME, {
    path: "/",
    httpOnly: true,
    signed: true
  });

  logger.info(`User logged out: ${req.user.email}`);

  return res.status(200).json({
    success: true,
    message: RESPONSE_MESSAGES.USER_LOGGED_OUT
  });
};

exports.verifyUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: RESPONSE_MESSAGES.USER_NOT_FOUND
      });
    }

    return res.status(200).json({
      success: true,
      message: "User verified successfully",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        workflowStage: user.workflowStage,
        signature: user.signature
      }
    });

  } catch (error) {
    logger.error("User verification error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully",
      data: user
    });

  } catch (error) {
    logger.error("Get user profile error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const { name } = req.body;
    const updates = {};

    if (name) updates.name = name.trim();

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select("-password");

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: user
    });

  } catch (error) {
    logger.error("Update user profile error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

// Admin only functions
exports.createUser = async (req, res) => {
  try {
    const { name, userId, email, password, role, workflowStage, phone, location, subLocation } = req.body;

    // Prevent SUBADMIN from creating ADMIN or SUBADMIN
    if (req.user.role === 'SUBADMIN' && (role === 'ADMIN' || role === 'SUBADMIN')) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Sub Admins cannot create Admin or Sub Admin users."
      });
    }

    // Check for existing user
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already registered with this email."
      });
    }

    // Validate workflow stage for clients
    if (role === ROLES.CLIENT && !workflowStage) {
      return res.status(400).json({
        success: false,
        message: "Workflow stage is required for client users"
      });
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Create user
    const user = new User({
      name: name.trim(),
      userId: userId ? userId.trim() : undefined,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || ROLES.CLIENT,
      workflowStage: (role === ROLES.ADMIN || role === ROLES.SUBADMIN) ? null : workflowStage,
      phone: phone ? phone.trim() : null,
      location: location || null,
      subLocation: subLocation || null,
      isActive: true
    });

    await user.save();

    logger.info(`New user created by admin: ${user.email}`);

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        workflowStage: user.workflowStage
      }
    });

  } catch (error) {
    logger.error("User creation error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query based on user role
    const query = {};
    if (req.user.role === 'SUBADMIN') {
      if (!req.user.location) {
        // If subadmin has no location, they shouldn't see any location-specific users
        return res.status(200).json({
          success: true,
          message: "Users fetched successfully",
          data: {
            users: [],
            pagination: {
              current: page,
              total: 0,
              count: 0,
              totalRecords: 0
            }
          }
        });
      }
      query.location = req.user.location;
      if (req.user.subLocation) {
        query.subLocation = req.user.subLocation;
      }
    }

    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments(query);

    return res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: {
        users,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          count: users.length,
          totalRecords: total
        }
      }
    });

  } catch (error) {
    logger.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, userId, email, password, role, workflowStage, isActive, phone, location, subLocation } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Prevent SUBADMIN from editing ADMIN
    if (req.user.role === 'SUBADMIN' && user.role === 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Sub Admins cannot edit Administrators."
      });
    }

    // Prevent SUBADMIN from assigning ADMIN or SUBADMIN role
    if (req.user.role === 'SUBADMIN' && (role === 'ADMIN' || role === 'SUBADMIN')) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Sub Admins cannot assign Admin or Sub Admin roles."
      });
    }

    // Update fields directly to ensure proper validation context
    if (name) user.name = name.trim();
    if (userId) user.userId = userId.trim();
    if (email) user.email = email.toLowerCase().trim();
    if (role) user.role = role;

    // If user is ADMIN or SUBADMIN, workflowStage must be null
    if (user.role === 'ADMIN' || user.role === 'SUBADMIN') {
      user.workflowStage = null;
    } else if (workflowStage !== undefined) {
      user.workflowStage = workflowStage;
    }
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (phone !== undefined) user.phone = phone ? phone.trim() : null;
    if (location !== undefined) user.location = location || null;
    if (subLocation !== undefined) user.subLocation = subLocation || null;

    // Hash and update password if provided
    if (password && password.trim()) {
      const hashedPassword = await hash(password, 12);
      user.password = hashedPassword;
    }

    await user.save();

    logger.info(`User updated by admin: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: user
    });

  } catch (error) {
    logger.error("Error updating user:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Prevent SUBADMIN from deleting ADMIN
    if (req.user.role === 'SUBADMIN' && user.role === 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Sub Admins cannot delete Administrators."
      });
    }

    // Prevent self-deletion
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account"
      });
    }

    await User.findByIdAndDelete(id);

    logger.info(`User deleted by admin: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });

  } catch (error) {
    logger.error("Error deleting user:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const matchStage = {};
    if (req.user.role === 'SUBADMIN') {
      if (!req.user.location) {
        return res.status(200).json({
          success: true,
          message: "User statistics fetched successfully",
          data: {
            total: 0,
            active: 0,
            byStage: {}
          }
        });
      }
      matchStage.location = req.user.location;
      if (req.user.subLocation) {
        matchStage.subLocation = req.user.subLocation;
      }
    }

    const stats = await User.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$workflowStage",
          count: { $sum: 1 }
        }
      }
    ]);

    const totalUsers = await User.countDocuments(matchStage);
    const activeUsers = await User.countDocuments({ ...matchStage, isActive: true });

    const formattedStats = {
      total: totalUsers,
      active: activeUsers,
      byStage: {}
    };

    stats.forEach(stat => {
      formattedStats.byStage[stat._id || 'ADMIN'] = stat.count;
    });

    return res.status(200).json({
      success: true,
      message: "User statistics fetched successfully",
      data: formattedStats
    });

  } catch (error) {
    logger.error("Error fetching user stats:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

// Initial setup - create first admin user if no users exist
exports.initialSetup = async (req, res) => {
  try {
    // Check if any users exist
    const userCount = await User.countDocuments();

    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: "System already has users. Please use admin login."
      });
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required for initial setup"
      });
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Create first admin user
    const adminUser = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: ROLES.ADMIN,
      workflowStage: null,
      isActive: true
    });

    await adminUser.save();

    logger.info(`Initial admin user created: ${adminUser.email}`);

    return res.status(201).json({
      success: true,
      message: "Initial admin user created successfully. You can now login.",
      data: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      }
    });

  } catch (error) {
    logger.error("Initial setup error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

// Forgot Password - Send reset email
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user) {
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent."
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent."
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash token for storage
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Set reset token and expiry (1 hour)
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    // Build reset URL
    const frontendUrl = process.env.ALLOWED_ORIGINS?.split(",")[0] || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    // Send email directly using nodemailer
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "E-PTW System"}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to: user.email,
      subject: "Password Reset Request - E-PTW System",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6366f1;">Password Reset Request</h2>
          <p>Hello ${user.name},</p>
          <p>We received a request to reset your password for your E-PTW account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #6366f1;">${resetUrl}</p>
          <p><strong>This link will expire in 1 hour.</strong></p>
          <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">This is an automated message from E-PTW System. Please do not reply to this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent to: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent."
    });

  } catch (error) {
    logger.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

// Reset Password - Set new password using token
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Hash the token from URL to compare with stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Password reset link is invalid or has expired."
      });
    }

    // Hash new password
    const hashedPassword = await hash(password, 12);

    // Update password and clear reset fields
    user.password = hashedPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    logger.info(`Password reset successful for user: ${user.email}`);

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully. You can now login with your new password."
    });

  } catch (error) {
    logger.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};
