// src/controllers/userController.js

const { UserRole } = require('@prisma/client');
const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../config/logger');
const { ok, fail } = require('../utils/response');
// Initialize Twilio Client safely — only if env vars are present
let twilioClient = null;
try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio');
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        logger.info('Twilio client initialized successfully.');
    } else {
        logger.warn('Twilio credentials not configured. SMS features disabled.');
    }
} catch (err) {
    logger.warn({ error: err.message }, 'Failed to initialize Twilio client. SMS features disabled.');
}

const registerUser = async (req, res) => {
    const { fullName, email, password, role, schoolId } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
            data: {
                fullName,
                email,
                password_hash: hashedPassword,
                role,
                schoolId: schoolId || null,
            },
        });

        if (role === UserRole.parent) {
            await prisma.notificationPreference.create({ data: { userId: newUser.id } });
        }

        logger.info({ userId: newUser.id, email: newUser.email, role: newUser.role }, "New user registered successfully");

        ok(res, {
            user: { id: newUser.id, fullName: newUser.fullName, email: newUser.email, role: newUser.role },
        }, null, 201);
    } catch (error) {
        logger.error({ error, email, role }, "Error during user registration");
        if (error.code === 'P2002') {
            return fail(res, 409, 'Email already exists.', 'EMAIL_ALREADY_EXISTS');
        }
        if (error.code === 'P2003') {
            return fail(res, 404, 'The specified school does not exist.', 'SCHOOL_NOT_FOUND');
        }
        fail(res, 500, 'Something went wrong on the server.', 'SERVER_ERROR');
    }
};

const loginUser = async (req, res) => {
    const { email, password } = req.body;
    logger.info({ email }, "Login attempt");

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        logger.debug({ email, found: !!user }, "User lookup result");

        let isMatch = false;
        if (user) {
            isMatch = await bcrypt.compare(password, user.password_hash);
        }
        logger.debug({ email, match: isMatch }, "Password comparison result");

        if (!user || !isMatch) {
            logger.warn({ email, audit: true, action: 'LOGIN_FAILED' }, "Failed login attempt: Invalid credentials");
            return fail(res, 401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
        }
        if (!user.isActive) {
            logger.warn({ email }, "Failed login attempt: User account is disabled");
            return fail(res, 403, 'Your account is disabled.', 'USER_DISABLED');
        }

        // --- START: 2FA Logic (secured) ---
        if (user.role === 'school_admin' && user.phoneNumber) {
            if (twilioClient) {
                const twoFactorCode = crypto.randomInt(100000, 999999).toString();
                const twoFactorCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

                // Hash the 2FA code before storing
                const hashedCode = crypto.createHash('sha256').update(twoFactorCode).digest('hex');

                await prisma.user.update({
                    where: { id: user.id },
                    data: { twoFactorCode: hashedCode, twoFactorCodeExpires },
                });

                try {
                    await twilioClient.messages.create({
                        body: `Your Peek verification code is: ${twoFactorCode}`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: user.phoneNumber
                    });
                    logger.info({ userId: user.id }, "2FA code sent for login verification");
                    return ok(res, { requires2FA: true, message: 'A verification code has been sent to your phone number.' });
                } catch (smsError) {
                    logger.error({ error: smsError.message }, "Failed to send 2FA SMS via Twilio");
                    return fail(res, 500, 'Failed to send verification code. Please try again later.', 'TWO_FACTOR_SEND_FAILED');
                }
            } else {
                logger.warn({ userId: user.id }, "2FA skipped: Twilio client not configured. Proceeding to standard login.");
            }
        }
        // --- END: 2FA Logic ---

        // Helper to map DB role to frontend role
        const mapRole = (dbRole) => {
            if (dbRole === 'school_admin') return 'ADMIN';
            if (dbRole === 'teacher') return 'TEACHER';
            if (dbRole === 'parent') return 'PARENT';
            return dbRole.toUpperCase();
        };

        const frontendRole = mapRole(user.role);

        logger.info({ email, role: user.role, mappedRole: frontendRole }, "Login successful");

        if (!process.env.JWT_SECRET) {
            logger.fatal("JWT_SECRET is not defined in environment variables!");
            throw new Error("JWT_SECRET missing");
        }

        const token = jwt.sign({ userId: user.id, email: user.email, role: frontendRole, schoolId: user.schoolId }, process.env.JWT_SECRET, { expiresIn: '24h' });

        logger.info({ userId: user.id, email, audit: true, action: 'LOGIN_SUCCESS' }, "User login successful");

        ok(res, {
            token,
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: frontendRole,
                schoolId: user.schoolId
            },
        });
    } catch (error) {

        logger.error({ error, email }, "Error during user login");
        fail(res, 500, 'Something went wrong on the server.', 'SERVER_ERROR');
    }
};

/**
 * Verifies the 2FA code and completes the login process. (NEW FUNCTION)
 */
const verifyTwoFactorCode = async (req, res) => {
    const { email, code } = req.body;
    try {
        if (!email || !code) {
            return fail(res, 400, 'Email and verification code are required.', 'VALIDATION_ERROR');
        }

        // Hash the provided code to compare with stored hash
        const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

        const user = await prisma.user.findFirst({
            where: {
                email,
                twoFactorCode: hashedCode,
                twoFactorCodeExpires: { gt: new Date() }
            }
        });

        if (!user) {
            logger.warn({ email }, "Invalid or expired 2FA code provided.");
            return fail(res, 400, 'Invalid or expired verification code.', 'INVALID_2FA_CODE');
        }

        // Clear the 2FA code after successful verification
        await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorCode: null, twoFactorCodeExpires: null }
        });

        // Helper to map DB role to frontend role
        const mapRole = (dbRole) => {
            if (dbRole === 'school_admin') return 'ADMIN';
            if (dbRole === 'teacher') return 'TEACHER';
            if (dbRole === 'parent') return 'PARENT';
            return dbRole.toUpperCase();
        };
        const frontendRole = mapRole(user.role);

        // Generate the final JWT token — include email for consistency with normal login
        const token = jwt.sign({ userId: user.id, email: user.email, role: frontendRole, schoolId: user.schoolId }, process.env.JWT_SECRET, { expiresIn: '24h' });
        logger.info({ userId: user.id, email, audit: true, action: 'LOGIN_SUCCESS' }, "2FA verification successful. User logged in.");
        ok(res, { token, user: { id: user.id, fullName: user.fullName, email: user.email, role: frontendRole, schoolId: user.schoolId } });

    } catch (error) {
        logger.error({ error, email }, "Error during 2FA verification");
        fail(res, 500, 'Something went wrong.', 'SERVER_ERROR');
    }
};

const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            logger.info({ email }, "Password reset requested for non-existent user");
            return ok(res, { message: "If a user with that email exists, a password reset link has been sent." });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await prisma.user.update({
            where: { email },
            data: { passwordResetToken, passwordResetExpires },
        });

        logger.info({ email }, "Password reset token generated. In production, an email would be sent.");

        ok(res, { message: "If a user with that email exists, a password reset link has been sent." });
    } catch (error) {
        logger.error({ email, error }, "Error in forgotPassword controller");
        fail(res, 500, 'An error occurred.', 'SERVER_ERROR');
    }
};

const resetPassword = async (req, res) => {
    const { token, password } = req.body;
    try {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await prisma.user.findFirst({
            where: {
                passwordResetToken: hashedToken,
                passwordResetExpires: { gt: new Date() },
            }
        });

        if (!user) {
            logger.warn("Invalid or expired password reset token used");
            return fail(res, 400, 'Token is invalid or has expired.', 'INVALID_RESET_TOKEN');
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password_hash: hashedPassword,
                passwordResetToken: null,
                passwordResetExpires: null,
            },
        });

        logger.info({ userId: user.id }, "User password has been reset successfully");
        ok(res, { message: "Password has been reset successfully." });
    } catch (error) {
        logger.error({ error }, "Error in resetPassword controller");
        fail(res, 500, 'Something went wrong.', 'SERVER_ERROR');
    }
};

const getUserProfile = (req, res) => {
    logger.info({ userId: req.user.id }, "User profile requested");
    ok(res, req.user);
};

const registerDevice = async (req, res) => {
    const { token } = req.body;
    const userId = req.user.id;
    try {
        if (!token) {
            return fail(res, 400, 'Device token is required.', 'VALIDATION_ERROR');
        }
        await prisma.deviceToken.upsert({
            where: { token: token },
            update: { userId: userId },
            create: { token: token, userId: userId },
        });
        logger.info({ userId }, "Device registered successfully for notifications");
        ok(res, { message: "Device registered successfully." });
    } catch (error) {
        logger.error({ userId, error: error.message }, "Error registering device");
        fail(res, 500, 'Failed to register device.', 'SERVER_ERROR');
    }
};

module.exports = {
    registerUser,
    loginUser,
    verifyTwoFactorCode,
    getUserProfile,
    forgotPassword,
    resetPassword,
    registerDevice
};