// src/controllers/userController.js

const { UserRole } = require('@prisma/client');
const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../config/logger');
const twilio = require('twilio'); // <-- الإضافة الجديدة

// Initialize Twilio Client
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

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

        res.status(201).json({
            message: 'User registered successfully!',
            user: { id: newUser.id, fullName: newUser.fullName, email: newUser.email, role: newUser.role },
        });
    } catch (error) {
        logger.error({ error, email, role }, "Error during user registration");
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'Email already exists.' });
        }
        if (error.code === 'P2003') {
            return res.status(404).json({ message: 'The specified school does not exist.' });
        }
        res.status(500).json({ message: 'Something went wrong on the server.' });
    }
};

const loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            logger.warn({ email }, "Failed login attempt: Invalid credentials");
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        if (!user.isActive) {
            logger.warn({ email }, "Failed login attempt: User account is disabled");
            return res.status(403).json({ message: 'Your account is disabled.' });
        }

        // --- START: NEW 2FA Logic ---
        if (user.role === 'school_admin' && user.phoneNumber) {
            const twoFactorCode = crypto.randomInt(100000, 999999).toString();
            const twoFactorCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

            await prisma.user.update({
                where: { id: user.id },
                data: { twoFactorCode, twoFactorCodeExpires },
            });

            try {
                await twilioClient.messages.create({
                    body: `Your Peek verification code is: ${twoFactorCode}`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: user.phoneNumber
                });
                logger.info({ userId: user.id }, "2FA code sent for login verification");
                return res.status(200).json({ message: 'A verification code has been sent to your phone number.' });
            } catch (smsError) {
                logger.error({ error: smsError }, "Failed to send 2FA SMS via Twilio");
                return res.status(500).json({ message: "Failed to send verification code. Please try again later." });
            }
        }
        // --- END: NEW 2FA Logic ---

        // If not an admin or no phone number, login directly
        const token = jwt.sign({ userId: user.id, email: user.email, role: user.role, schoolId: user.schoolId }, process.env.JWT_SECRET, { expiresIn: '24h' });

        logger.info({ userId: user.id }, "User login successful");

        res.status(200).json({
            message: 'Logged in successfully!',
            token,
            user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, schoolId: user.schoolId },
        });
    } catch (error) {
        logger.error({ error, email }, "Error during user login");
        res.status(500).json({ message: 'Something went wrong on the server.' });
    }
};

/**
 * Verifies the 2FA code and completes the login process. (NEW FUNCTION)
 */
const verifyTwoFactorCode = async (req, res) => {
    const { email, code } = req.body;
    try {
        const user = await prisma.user.findFirst({
            where: {
                email,
                twoFactorCode: code,
                twoFactorCodeExpires: { gt: new Date() } // Check if code is not expired
            }
        });

        if (!user) {
            logger.warn({ email }, "Invalid or expired 2FA code provided.");
            return res.status(400).json({ message: "Invalid or expired verification code." });
        }

        // Clear the 2FA code after successful verification
        await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorCode: null, twoFactorCodeExpires: null }
        });

        // Generate the final JWT token and complete login
        const token = jwt.sign({ userId: user.id, role: user.role, schoolId: user.schoolId }, process.env.JWT_SECRET, { expiresIn: '24h' });
        logger.info({ userId: user.id }, "2FA verification successful. User logged in.");
        res.status(200).json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } });

    } catch (error) {
        logger.error({ error, email }, "Error during 2FA verification");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            logger.info({ email }, "Password reset requested for non-existent user");
            return res.status(200).json({ message: "If a user with that email exists, a password reset link has been sent." });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await prisma.user.update({
            where: { email },
            data: { passwordResetToken, passwordResetExpires },
        });

        logger.info({ email }, "Password reset token generated. In production, an email would be sent.");

        res.status(200).json({ message: "If a user with that email exists, a password reset link has been sent." });
    } catch (error) {
        logger.error({ email, error }, "Error in forgotPassword controller");
        res.status(500).json({ message: "An error occurred." });
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
            logger.warn({ tokenAttempt: token }, "Invalid or expired password reset token used");
            return res.status(400).json({ message: "Token is invalid or has expired." });
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
        res.status(200).json({ message: "Password has been reset successfully." });
    } catch (error) {
        logger.error({ error }, "Error in resetPassword controller");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const getUserProfile = (req, res) => {
    logger.info({ userId: req.user.id }, "User profile requested");
    res.status(200).json(req.user);
};

const registerDevice = async (req, res) => {
    const { token } = req.body;
    const userId = req.user.id;
    try {
        if (!token) {
            return res.status(400).json({ message: "Device token is required." });
        }
        await prisma.deviceToken.upsert({
            where: { token: token },
            update: { userId: userId },
            create: { token: token, userId: userId },
        });
        logger.info({ userId, deviceToken: token }, "Device registered successfully for notifications");
        res.status(200).json({ message: "Device registered successfully." });
    } catch (error) {
        logger.error({ userId, deviceToken: token, error }, "Error registering device");
        res.status(500).json({ message: "Failed to register device." });
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