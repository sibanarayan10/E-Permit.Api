const DataRequest = require("../models/DataRequest");
const GeneralWorkPermit = require("../models/GeneralWorkPermit");
const HeightPermit = require("../models/HeightPermit");
const User = require("../models/User");
const Settings = require("../models/Settings");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const logger = require("../utils/logger");
const { validatePhoneNumber, formatPhoneNumber, isSmsEnabled } = require("../services/smsService");

/**
 * Send custom email (not using templates)
 * Returns { success: false, message } if email cannot be sent (disabled or not configured)
 * Returns { success: true } if email is sent successfully
 */
const sendEmail = async ({ to, subject, html }) => {
    // Check if email is enabled in settings
    const settings = await Settings.findOne();
    if (settings && settings.emailNotificationsEnabled === false) {
        logger.info('Email notifications are disabled in settings');
        return { success: false, message: 'Email disabled by settings' };
    }

    // Check if SMTP credentials are configured (use SMTP_PASSWORD like emailService.js)
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
        logger.warn('SMTP not configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASSWORD) - email sending skipped');
        return { success: false, message: 'SMTP not configured' };
    }

    try {
        // Create transporter using env vars (matching emailService.js configuration)
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,  // Use SMTP_PASSWORD like emailService.js
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
        });

        // Send email
        await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'E-Permit System'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
            to,
            subject,
            html,
        });

        logger.info(`Email sent to ${to}: ${subject}`);
        return { success: true };
    } catch (error) {
        logger.error('Failed to send email:', error);
        // Log error but don't throw - allow operation to continue
        return { success: false, message: `Email sending failed: ${error.message}` };
    }
};

/**
 * Generate a unique Data Request ID
 */
const generateDataRequestId = async () => {
    const count = await DataRequest.countDocuments();
    const nextNum = count + 1;
    const paddedNum = String(nextNum).padStart(6, '0');
    return `DR-${paddedNum}`;
};

/**
 * Generate secure token for email links
 */
const generateSecureToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate 6-digit OTP
 */
const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * @desc    Create a new data request linked to a permit
 * @route   POST /api/v1/data-requests
 * @access  Private
 */
exports.createDataRequest = async (req, res) => {
    try {
        const { permitId, permitType } = req.body;
        const userId = req.user._id;

        // Validate permit type
        if (!['general', 'height'].includes(permitType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid permit type. Must be 'general' or 'height'",
            });
        }

        // Get the permit
        let permit;
        let permitModel;
        if (permitType === 'general') {
            permit = await GeneralWorkPermit.findById(permitId);
            permitModel = 'GeneralWorkPermit';
        } else {
            permit = await HeightPermit.findById(permitId);
            permitModel = 'HeightPermit';
        }

        if (!permit) {
            return res.status(404).json({
                success: false,
                message: "Permit not found",
            });
        }

        // Generate unique ID
        const dataRequestId = await generateDataRequestId();

        // Create data request
        const dataRequest = await DataRequest.create({
            dataRequestId,
            permitId: permit._id,
            permitNumber: permit.permitNumber,
            permitType,
            permitModel,
            status: 'draft',
            createdBy: userId,
        });

        // Populate creator info
        await dataRequest.populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            message: "Data request created successfully",
            data: dataRequest,
        });
    } catch (error) {
        logger.error("Error creating data request:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create data request",
            error: error.message,
        });
    }
};

/**
 * @desc    Get all data requests
 * @route   GET /api/v1/data-requests
 * @access  Private
 */
exports.getAllDataRequests = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const userId = req.user._id;
        const userRole = req.user.role;

        // Build query
        const query = {};

        // If not admin, only show relevant data requests
        if (userRole !== 'ADMIN' && userRole !== 'SUBADMIN') {
            query.$or = [
                { createdBy: userId },
                { assignedExecutor: userId },
                { assignedIssuer: userId },
            ];
        }

        if (status) {
            query.status = status;
        }

        const total = await DataRequest.countDocuments(query);
        const dataRequests = await DataRequest.find(query)
            .populate('createdBy', 'name email')
            .populate('assignedExecutor', 'name email')
            .populate('assignedIssuer', 'name email')
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            message: "Data requests fetched successfully",
            data: {
                dataRequests,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / parseInt(limit)),
                    limit: parseInt(limit),
                },
            },
        });
    } catch (error) {
        logger.error("Error fetching data requests:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch data requests",
            error: error.message,
        });
    }
};

/**
 * @desc    Get data request by ID
 * @route   GET /api/v1/data-requests/:id
 * @access  Private
 */
exports.getDataRequestById = async (req, res) => {
    try {
        const dataRequest = await DataRequest.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('assignedExecutor', 'name email phone')
            .populate('assignedIssuer', 'name email phone');

        if (!dataRequest) {
            return res.status(404).json({
                success: false,
                message: "Data request not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Data request fetched successfully",
            data: dataRequest,
        });
    } catch (error) {
        logger.error("Error fetching data request:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch data request",
            error: error.message,
        });
    }
};

/**
 * @desc    Send email to executor with secure link
 * @route   POST /api/v1/data-requests/:id/send-to-executor
 * @access  Private
 */
exports.sendToExecutor = async (req, res) => {
    try {
        const { executorId } = req.body;
        const dataRequestId = req.params.id;

        const dataRequest = await DataRequest.findById(dataRequestId);
        if (!dataRequest) {
            return res.status(404).json({
                success: false,
                message: "Data request not found",
            });
        }

        const executor = await User.findById(executorId);
        if (!executor) {
            return res.status(404).json({
                success: false,
                message: "Executor not found",
            });
        }

        // Generate secure token
        const secureToken = generateSecureToken();
        const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Update data request
        dataRequest.assignedExecutor = executorId;
        dataRequest.executorSecureToken = secureToken;
        dataRequest.executorTokenExpiresAt = tokenExpiresAt;
        dataRequest.executorEmailSentAt = new Date();
        dataRequest.status = 'pending_executor';
        await dataRequest.save();

        // Also update the linked permit with executor assignment
        let permit;
        if (dataRequest.permitType === 'general') {
            permit = await GeneralWorkPermit.findById(dataRequest.permitId);
        } else {
            permit = await HeightPermit.findById(dataRequest.permitId);
        }

        if (permit) {
            // Assign executor to the permit and update workflow stage
            permit.assignedExecutor = executorId;
            permit.assignedExecutorAt = new Date();
            permit.assignedExecutorBy = req.user._id;
            permit.currentStage = 'Execution';
            permit.permitStatus = 'Pending_Execution';
            await permit.save();
            logger.info(`Permit ${permit.permitNumber} forwarded to executor ${executor.name}`);
        }

        // Build secure link
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const secureLink = `${frontendUrl}/data-request/verify/${secureToken}`;

        // Send email
        const emailHtml = `
      <h2>Data Request Approval Required</h2>
      <p>Dear ${executor.name},</p>
      <p>You have been assigned to review and approve a Data Request (${dataRequest.dataRequestId}).</p>
      <p>Please click the link below to verify your identity and proceed with approval:</p>
      <a href="${secureLink}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #1e3a5f, #2d4a6f); color: white; text-decoration: none; border-radius: 8px;">Review Data Request</a>
      <p>This link will expire in 7 days.</p>
      <p>Best regards,<br/>E-Permit System</p>
    `;

        const emailResult = await sendEmail({
            to: executor.email,
            subject: `Data Request ${dataRequest.dataRequestId} - Approval Required`,
            html: emailHtml,
        });

        await dataRequest.populate('assignedExecutor', 'name email');

        // Check if email was disabled
        const emailMessage = emailResult && !emailResult.success
            ? "Executor assigned successfully (email notifications disabled)"
            : "Email sent to executor successfully";

        res.status(200).json({
            success: true,
            message: emailMessage,
            data: dataRequest,
        });
    } catch (error) {
        logger.error("Error sending to executor:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send to executor",
            error: error.message,
        });
    }
};

/**
 * @desc    Verify secure token and request OTP
 * @route   POST /api/v1/data-requests/verify-token
 * @access  Public
 */
exports.verifyToken = async (req, res) => {
    try {
        const { token, type } = req.body; // type: 'executor' or 'issuer'

        if (!['executor', 'issuer'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification type",
            });
        }

        // Find data request by token
        let dataRequest;
        if (type === 'executor') {
            dataRequest = await DataRequest.findOne({
                executorSecureToken: token,
                executorTokenExpiresAt: { $gt: new Date() },
            }).populate('assignedExecutor', 'name email phone');
        } else {
            dataRequest = await DataRequest.findOne({
                issuerSecureToken: token,
                issuerTokenExpiresAt: { $gt: new Date() },
            }).populate('assignedIssuer', 'name email phone');
        }

        if (!dataRequest) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired token",
            });
        }

        const user = type === 'executor' ? dataRequest.assignedExecutor : dataRequest.assignedIssuer;

        res.status(200).json({
            success: true,
            message: "Token verified successfully",
            data: {
                dataRequestId: dataRequest.dataRequestId,
                permitNumber: dataRequest.permitNumber,
                permitType: dataRequest.permitType,
                type,
                user: {
                    name: user.name,
                    email: user.email,
                    hasPhone: !!user.phone,
                },
            },
        });
    } catch (error) {
        logger.error("Error verifying token:", error);
        res.status(500).json({
            success: false,
            message: "Failed to verify token",
            error: error.message,
        });
    }
};

/**
 * @desc    Request OTP via email or SMS
 * @route   POST /api/v1/data-requests/request-otp
 * @access  Public
 */
exports.requestOtp = async (req, res) => {
    try {
        const { token, type, method } = req.body; // method: 'email' or 'sms'

        if (!['executor', 'issuer'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification type",
            });
        }

        if (!['email', 'sms'].includes(method)) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP method. Must be 'email' or 'sms'",
            });
        }

        // Find data request
        let dataRequest;
        if (type === 'executor') {
            dataRequest = await DataRequest.findOne({
                executorSecureToken: token,
                executorTokenExpiresAt: { $gt: new Date() },
            }).populate('assignedExecutor', 'name email phone');
        } else {
            dataRequest = await DataRequest.findOne({
                issuerSecureToken: token,
                issuerTokenExpiresAt: { $gt: new Date() },
            }).populate('assignedIssuer', 'name email phone');
        }

        if (!dataRequest) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired token",
            });
        }

        const user = type === 'executor' ? dataRequest.assignedExecutor : dataRequest.assignedIssuer;

        // Generate OTP
        const otp = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store OTP
        if (type === 'executor') {
            dataRequest.executorOtp = otp;
            dataRequest.executorOtpExpiresAt = otpExpiresAt;
            dataRequest.executorOtpMethod = method;
        } else {
            dataRequest.issuerOtp = otp;
            dataRequest.issuerOtpExpiresAt = otpExpiresAt;
            dataRequest.issuerOtpMethod = method;
        }
        await dataRequest.save();

        // Send OTP
        if (method === 'email') {
            const emailHtml = `
        <h2>OTP Verification</h2>
        <p>Dear ${user.name},</p>
        <p>Your OTP for Data Request verification is:</p>
        <h1 style="font-size: 32px; letter-spacing: 8px; color: #1e3a5f; text-align: center;">${otp}</h1>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      `;
            await sendEmail({
                to: user.email,
                subject: `OTP for Data Request ${dataRequest.dataRequestId}`,
                html: emailHtml,
            });
        } else {
            // SMS - Check if SMS is enabled and user has phone number
            if (!user.phone) {
                return res.status(400).json({
                    success: false,
                    message: "User does not have a phone number configured",
                });
            }

            // Check if SMS is enabled in settings
            const smsEnabled = await isSmsEnabled();
            if (!smsEnabled) {
                return res.status(400).json({
                    success: false,
                    message: "SMS notifications are disabled in settings",
                });
            }

            // Validate phone number
            if (!validatePhoneNumber(user.phone)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid phone number format",
                });
            }

            // Check if Twilio is configured
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            const fromNumber = process.env.TWILIO_PHONE_NUMBER;
            const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

            if (!accountSid || !authToken) {
                logger.warn('Twilio not configured - SMS OTP sending skipped');
                return res.status(400).json({
                    success: false,
                    message: "SMS service not configured",
                });
            }

            try {
                const twilio = require("twilio");
                const client = twilio(accountSid, authToken);

                const formattedPhone = formatPhoneNumber(user.phone);
                const smsMessage = `Dear ${user.name}, Your OTP for Data Request ${dataRequest.dataRequestId} verification is: ${otp}. This OTP is valid for 10 minutes. - E-Permit System`;

                const messageOptions = {
                    body: smsMessage,
                    to: formattedPhone,
                };

                // Use Messaging Service SID if available, otherwise use phone number
                if (messagingServiceSid) {
                    messageOptions.messagingServiceSid = messagingServiceSid;
                } else if (fromNumber) {
                    messageOptions.from = fromNumber;
                } else {
                    return res.status(400).json({
                        success: false,
                        message: "Twilio phone number not configured",
                    });
                }

                await client.messages.create(messageOptions);
                logger.info(`OTP SMS sent to ${user.name} (${user.phone.slice(-4)}): message sent successfully`);
            } catch (smsError) {
                logger.error('Failed to send OTP SMS:', smsError);
                return res.status(500).json({
                    success: false,
                    message: `Failed to send SMS: ${smsError.message}`,
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `OTP sent via ${method} successfully`,
            data: {
                method,
                expiresAt: otpExpiresAt,
            },
        });
    } catch (error) {
        logger.error("Error requesting OTP:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send OTP",
            error: error.message,
        });
    }
};

/**
 * @desc    Verify OTP
 * @route   POST /api/v1/data-requests/verify-otp
 * @access  Public
 */
exports.verifyOtp = async (req, res) => {
    try {
        const { token, type, otp } = req.body;

        if (!['executor', 'issuer'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Invalid verification type",
            });
        }

        // Find data request
        let dataRequest;
        if (type === 'executor') {
            dataRequest = await DataRequest.findOne({
                executorSecureToken: token,
                executorTokenExpiresAt: { $gt: new Date() },
            }).populate('assignedExecutor', 'name email signature');
        } else {
            dataRequest = await DataRequest.findOne({
                issuerSecureToken: token,
                issuerTokenExpiresAt: { $gt: new Date() },
            }).populate('assignedIssuer', 'name email signature');
        }

        if (!dataRequest) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired token",
            });
        }

        // Verify OTP
        let storedOtp, otpExpiresAt;
        if (type === 'executor') {
            storedOtp = dataRequest.executorOtp;
            otpExpiresAt = dataRequest.executorOtpExpiresAt;
        } else {
            storedOtp = dataRequest.issuerOtp;
            otpExpiresAt = dataRequest.issuerOtpExpiresAt;
        }

        if (!storedOtp || storedOtp !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP",
            });
        }

        if (new Date() > otpExpiresAt) {
            return res.status(400).json({
                success: false,
                message: "OTP has expired",
            });
        }

        // Mark as verified
        if (type === 'executor') {
            dataRequest.executorVerifiedAt = new Date();
            dataRequest.executorOtp = null; // Clear OTP after use
        } else {
            dataRequest.issuerVerifiedAt = new Date();
            dataRequest.issuerOtp = null;
        }
        await dataRequest.save();

        const user = type === 'executor' ? dataRequest.assignedExecutor : dataRequest.assignedIssuer;

        res.status(200).json({
            success: true,
            message: "OTP verified successfully",
            data: {
                dataRequestId: dataRequest._id,
                dataRequestNumber: dataRequest.dataRequestId,
                permitNumber: dataRequest.permitNumber,
                permitType: dataRequest.permitType,
                type,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    signature: user.signature?.url || null, // Return signature URL, not the object
                },
                token, // Keep token for approval submission
            },
        });
    } catch (error) {
        logger.error("Error verifying OTP:", error);
        res.status(500).json({
            success: false,
            message: "Failed to verify OTP",
            error: error.message,
        });
    }
};

/**
 * @desc    Executor submits approval
 * @route   POST /api/v1/data-requests/:id/executor-approve
 * @access  Public (token-based)
 */
exports.executorApprove = async (req, res) => {
    try {
        const { token, executingAgency, preExecutionChecks, comments, issuerId } = req.body;
        const dataRequestId = req.params.id;

        const dataRequest = await DataRequest.findOne({
            _id: dataRequestId,
            executorSecureToken: token,
            executorVerifiedAt: { $ne: null },
        }).populate('assignedExecutor', 'name email');

        if (!dataRequest) {
            return res.status(400).json({
                success: false,
                message: "Invalid request or not verified",
            });
        }

        // Update approval data on data request
        dataRequest.executorApproval = {
            approved: true,
            approvedBy: dataRequest.assignedExecutor._id,
            approvedAt: new Date(),
            comments,
            executingAgency,
            preExecutionChecks,
        };
        dataRequest.status = 'executor_approved';
        await dataRequest.save();

        // Also update the linked permit with execution data
        let permit;
        if (dataRequest.permitType === 'general') {
            permit = await GeneralWorkPermit.findById(dataRequest.permitId);
        } else {
            permit = await HeightPermit.findById(dataRequest.permitId);
        }

        if (permit) {
            // Update permit with executor approval data
            permit.executingAgency = executingAgency;
            permit.preExecutionChecks = preExecutionChecks;
            permit.executionApproval = {
                approved: true,
                approvedBy: dataRequest.assignedExecutor._id,
                approvedAt: new Date(),
                comments,
            };
            // Set the assigned executor and update workflow stage
            permit.assignedExecutor = dataRequest.assignedExecutor._id;
            permit.assignedExecutorAt = new Date();
            permit.currentStage = 'Execution';
            permit.permitStatus = 'Pending_Execution';

            await permit.save();
            logger.info(`Permit ${permit.permitNumber} updated with execution approval from data request`);
        }

        // If issuer is provided, also assign and send to issuer
        let issuerAssigned = false;
        if (issuerId) {
            const issuer = await User.findById(issuerId);
            if (issuer) {
                // Generate secure token for issuer
                const issuerSecureToken = generateSecureToken();
                const issuerTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

                // Update data request with issuer info
                dataRequest.assignedIssuer = issuerId;
                dataRequest.issuerSecureToken = issuerSecureToken;
                dataRequest.issuerTokenExpiresAt = issuerTokenExpiresAt;
                dataRequest.issuerEmailSentAt = new Date();
                dataRequest.status = 'pending_issuer';
                await dataRequest.save();

                // Update permit with issuer assignment
                if (permit) {
                    permit.assignedIssuer = issuerId;
                    permit.assignedIssuerAt = new Date();
                    permit.currentStage = 'Issuer';
                    permit.permitStatus = 'Pending_Issuer';
                    await permit.save();
                    logger.info(`Permit ${permit.permitNumber} forwarded to issuer ${issuer.name}`);
                }

                // Send email to issuer
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                const secureLink = `${frontendUrl}/data-request/verify/${issuerSecureToken}?type=issuer`;

                const emailHtml = `
                    <h2>Data Request Final Approval Required</h2>
                    <p>Dear ${issuer.name},</p>
                    <p>You have been assigned to review and provide final approval for a Data Request (${dataRequest.dataRequestId}).</p>
                    <p>The executor has already approved this request.</p>
                    <p>Please click the link below to verify your identity and proceed with approval:</p>
                    <a href="${secureLink}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #1e3a5f, #2d4a6f); color: white; text-decoration: none; border-radius: 8px;">Review Data Request</a>
                    <p>This link will expire in 7 days.</p>
                    <p>Best regards,<br/>E-Permit System</p>
                `;

                await sendEmail({
                    to: issuer.email,
                    subject: `Data Request ${dataRequest.dataRequestId} - Final Approval Required`,
                    html: emailHtml,
                });

                issuerAssigned = true;
                logger.info(`Issuer ${issuer.name} assigned and notified for data request ${dataRequest.dataRequestId}`);
            }
        }

        await dataRequest.populate('assignedExecutor', 'name email');
        if (issuerId) {
            await dataRequest.populate('assignedIssuer', 'name email');
        }

        res.status(200).json({
            success: true,
            message: issuerAssigned
                ? "Data request approved and forwarded to issuer successfully"
                : "Data request approved by executor successfully",
            data: dataRequest,
            issuerAssigned,
        });
    } catch (error) {
        logger.error("Error in executor approval:", error);
        res.status(500).json({
            success: false,
            message: "Failed to submit executor approval",
            error: error.message,
        });
    }
};

/**
 * @desc    Send email to issuer with secure link
 * @route   POST /api/v1/data-requests/:id/send-to-issuer
 * @access  Private
 */
exports.sendToIssuer = async (req, res) => {
    try {
        const { issuerId } = req.body;
        const dataRequestId = req.params.id;

        const dataRequest = await DataRequest.findById(dataRequestId);
        if (!dataRequest) {
            return res.status(404).json({
                success: false,
                message: "Data request not found",
            });
        }

        if (dataRequest.status !== 'executor_approved') {
            return res.status(400).json({
                success: false,
                message: "Data request must be approved by executor first",
            });
        }

        const issuer = await User.findById(issuerId);
        if (!issuer) {
            return res.status(404).json({
                success: false,
                message: "Issuer not found",
            });
        }

        // Generate secure token
        const secureToken = generateSecureToken();
        const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Update data request
        dataRequest.assignedIssuer = issuerId;
        dataRequest.issuerSecureToken = secureToken;
        dataRequest.issuerTokenExpiresAt = tokenExpiresAt;
        dataRequest.issuerEmailSentAt = new Date();
        dataRequest.status = 'pending_issuer';
        await dataRequest.save();

        // Also update the linked permit with issuer assignment
        let permit;
        if (dataRequest.permitType === 'general') {
            permit = await GeneralWorkPermit.findById(dataRequest.permitId);
        } else {
            permit = await HeightPermit.findById(dataRequest.permitId);
        }

        if (permit) {
            // Assign issuer to the permit and update workflow stage
            permit.assignedIssuer = issuerId;
            permit.assignedIssuerAt = new Date();
            permit.assignedIssuerBy = req.user._id;
            permit.currentStage = 'Issuer';
            permit.permitStatus = 'Pending_Issuer';
            await permit.save();
            logger.info(`Permit ${permit.permitNumber} forwarded to issuer ${issuer.name}`);
        }

        // Build secure link
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const secureLink = `${frontendUrl}/data-request/verify/${secureToken}?type=issuer`;

        // Send email
        const emailHtml = `
      <h2>Data Request Final Approval Required</h2>
      <p>Dear ${issuer.name},</p>
      <p>You have been assigned to review and provide final approval for a Data Request (${dataRequest.dataRequestId}).</p>
      <p>The executor has already approved this request.</p>
      <p>Please click the link below to verify your identity and proceed with approval:</p>
      <a href="${secureLink}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #1e3a5f, #2d4a6f); color: white; text-decoration: none; border-radius: 8px;">Review Data Request</a>
      <p>This link will expire in 7 days.</p>
      <p>Best regards,<br/>E-Permit System</p>
    `;

        const emailResult = await sendEmail({
            to: issuer.email,
            subject: `Data Request ${dataRequest.dataRequestId} - Final Approval Required`,
            html: emailHtml,
        });

        await dataRequest.populate('assignedIssuer', 'name email');

        // Check if email was disabled
        const emailMessage = emailResult && !emailResult.success
            ? "Issuer assigned successfully (email notifications disabled)"
            : "Email sent to issuer successfully";

        res.status(200).json({
            success: true,
            message: emailMessage,
            data: dataRequest,
        });
    } catch (error) {
        logger.error("Error sending to issuer:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send to issuer",
            error: error.message,
        });
    }
};
/**
 * @desc    Issuer submits approval
 * @route   POST /api/v1/data-requests/:id/issuer-approve
 * @access  Public (token-based)
 */
exports.issuerApprove = async (req, res) => {
    try {
        const { token, issuerDetails, comments, verifiedAndFoundSatisfactory } = req.body;
        const dataRequestId = req.params.id;

        const dataRequest = await DataRequest.findOne({
            _id: dataRequestId,
            issuerSecureToken: token,
            issuerVerifiedAt: { $ne: null },
        }).populate('assignedIssuer', 'name email');

        if (!dataRequest) {
            return res.status(400).json({
                success: false,
                message: "Invalid request or not verified",
            });
        }

        // Update approval data on data request
        dataRequest.issuerApproval = {
            approved: true,
            approvedBy: dataRequest.assignedIssuer._id,
            approvedAt: new Date(),
            comments,
            verifiedAndFoundSatisfactory,
            issuerDetails,
        };
        dataRequest.status = 'approved';
        dataRequest.approvedAt = new Date();
        await dataRequest.save();

        // Also update the linked permit with issuer approval data
        let permit;
        if (dataRequest.permitType === 'general') {
            permit = await GeneralWorkPermit.findById(dataRequest.permitId);
        } else {
            permit = await HeightPermit.findById(dataRequest.permitId);
        }

        if (permit) {
            // Update permit with issuer approval data
            permit.issuerCertification = {
                verifiedAndFoundSatisfactory,
                issuerDetails,
            };
            permit.issuerApproval = {
                approved: true,
                approvedBy: dataRequest.assignedIssuer._id,
                approvedAt: new Date(),
                comments,
            };
            // Set the assigned issuer and update workflow stage/status
            permit.assignedIssuer = dataRequest.assignedIssuer._id;
            permit.assignedIssuerAt = new Date();
            permit.currentStage = 'Issuer';
            permit.permitStatus = 'Approved'; // Permit is now approved

            await permit.save();
            logger.info(`Permit ${permit.permitNumber} approved via data request`);
        }

        res.status(200).json({
            success: true,
            message: "Data request approved successfully",
            data: dataRequest,
        });
    } catch (error) {
        logger.error("Error in issuer approval:", error);
        res.status(500).json({
            success: false,
            message: "Failed to submit issuer approval",
            error: error.message,
        });
    }
};

/**
 * @desc    Delete data request
 * @route   DELETE /api/v1/data-requests/:id
 * @access  Private (Admin or creator)
 */
exports.deleteDataRequest = async (req, res) => {
    try {
        const dataRequest = await DataRequest.findById(req.params.id);

        if (!dataRequest) {
            return res.status(404).json({
                success: false,
                message: "Data request not found",
            });
        }

        // Only allow deletion if draft or by admin
        if (dataRequest.status !== 'draft' && req.user.role !== 'ADMIN' && req.user.role !== 'SUBADMIN') {
            return res.status(403).json({
                success: false,
                message: "Only draft data requests can be deleted",
            });
        }

        await DataRequest.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: "Data request deleted successfully",
        });
    } catch (error) {
        logger.error("Error deleting data request:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete data request",
            error: error.message,
        });
    }
};
