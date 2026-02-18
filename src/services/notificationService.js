// src/services/notificationService.js

const admin = require('firebase-admin');
const prisma = require('../prismaClient');
const logger = require('../config/logger');

try {
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        logger.info("Loading Firebase credentials from environment variable...");
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        logger.info("Loading Firebase credentials from local file...");
        serviceAccount = require('../../firebase-service-account.json');
    }

    if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n').trim();
    }

    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        logger.info("Firebase Admin SDK initialized successfully.");
    } catch (certError) {
        logger.warn({ error: certError.message }, "Firebase Admin SDK initialization failed. Push notifications will be disabled.");
    }

} catch (error) {
    logger.warn({ error: error.message }, "Error loading Firebase credentials. Push notifications will be disabled.");
}

/**
 * Sends a real push notification and handles cleanup of invalid tokens.
 * Checks user preferences before sending.
 */
const sendNotification = async ({ userId, title, body, data, preferenceType }) => {
    try {
        // Preference Check
        if (preferenceType) {
            const preferences = await prisma.notificationPreference.findUnique({
                where: { userId }
            });

            if (preferences) {
                let shouldSend = true;
                switch (preferenceType) {
                    case 'wallet':
                        shouldSend = preferences.lowBalanceWarning;
                        break;
                    case 'bus':
                        shouldSend = preferences.busUpdates;
                        break;
                    case 'academic':
                        shouldSend = preferences.newGrade || preferences.newHomework;
                        break;
                    default:
                        break;
                }

                if (!shouldSend) {
                    logger.debug({ userId, preferenceType }, `Notification skipped by user preference.`);
                    return;
                }
            }
        }

        const userDevices = await prisma.deviceToken.findMany({ where: { userId } });
        if (userDevices.length === 0) {
            logger.debug({ userId }, `No device tokens found. Skipping notification.`);
            return;
        }

        const tokens = userDevices.map(device => device.token);

        // H5 FIX: Use sendEachForMulticast instead of deprecated sendMulticast
        const message = { notification: { title, body }, data: data || {}, tokens };
        const response = await admin.messaging().sendEachForMulticast(message);
        logger.info({ successCount: response.successCount, totalDevices: tokens.length }, `Notification sent.`);

        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error.code === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(tokens[idx]);
                }
            });
            if (invalidTokens.length > 0) {
                logger.info({ count: invalidTokens.length }, `Deleting invalid device tokens.`);
                await prisma.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
            }
        }
    } catch (error) {
        logger.error({ error: error.message, userId }, "Error sending push notification via Firebase.");
    }
};

module.exports = { sendNotification };