const Notification = require("../models/Notification");
const { RESPONSE_MESSAGES, NOTIFICATION_TYPES } = require("../config/constants");
const logger = require("../utils/logger");

exports.getMyNotifications = async (req, res) => {
  try {
    const user = req.user;
    const { read, type } = req.query;
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = { recipient: user._id };

    // Filter by read status
    if (read !== undefined) {
      query.isRead = read === 'true';
    }

    // Filter by type
    if (type) {
      query.type = type;
    }

    const notifications = await Notification.find(query)
      .populate("createdBy", "name email workflowStage")
      .populate("permitId", "permitNumber currentStage permitStatus")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      recipient: user._id,
      isRead: false
    });

    return res.status(200).json({
      success: true,
      message: "Notifications fetched successfully",
      data: {
        notifications,
        unreadCount,
        pagination: {
          current: page,
          total: totalPages,
          count: notifications.length,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error("Error fetching notifications:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const notification = await Notification.findOne({
      _id: id,
      recipient: user._id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification
    });

  } catch (error) {
    logger.error("Error marking notification as read:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const user = req.user;

    const result = await Notification.updateMany(
      { 
        recipient: user._id,
        isRead: false 
      },
      { 
        isRead: true,
        readAt: new Date()
      }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      data: {
        modifiedCount: result.modifiedCount
      }
    });

  } catch (error) {
    logger.error("Error marking all notifications as read:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};

exports.getNotificationStats = async (req, res) => {
  try {
    const user = req.user;

    const stats = await Notification.aggregate([
      { $match: { recipient: user._id } },
      {
        $group: {
          _id: "$isRead",
          count: { $sum: 1 }
        }
      }
    ]);

    const unreadCount = stats.find(stat => stat._id === false)?.count || 0;
    const totalCount = stats.reduce((sum, stat) => sum + stat.count, 0);

    return res.status(200).json({
      success: true,
      message: "Notification statistics fetched successfully",
      data: {
        total: totalCount,
        unread: unreadCount,
        read: totalCount - unreadCount
      }
    });

  } catch (error) {
    logger.error("Error fetching notification stats:", error);
    return res.status(500).json({
      success: false,
      message: RESPONSE_MESSAGES.INTERNAL_SERVER_ERROR
    });
  }
};