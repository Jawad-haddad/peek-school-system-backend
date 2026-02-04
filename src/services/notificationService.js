// src/services/notificationService.js

const admin = require('firebase-admin');
const prisma = require('../prismaClient');

try {
    let serviceAccount;

    // Check if the secret is provided as an environment variable (for production/CI)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        console.log("Loading Firebase credentials from environment variable...");
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // Otherwise, load from the local file (for local development)
        console.log("Loading Firebase credentials from local file...");
        serviceAccount = require('../../firebase-service-account.json');
    }

    // Initialize the Firebase Admin SDK
    if (serviceAccount.private_key) {
        // Ensure proper formatting for PEM key
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n').trim();
    }

    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin SDK initialized successfully.");
    } catch (certError) {
        console.warn("WARNING: Firebase Admin SDK initialization failed. Push notifications will be disabled.");
        console.warn("Reason:", certError.message);
        // Do not throw, allow server to start
    }

} catch (error) {
    console.warn("WARNING: Error loading Firebase credentials. Push notifications will be disabled.");
    console.warn("Reason:", error.message);
}

/**
 * Sends a real push notification and handles cleanup of invalid tokens.
 * Checks user preferences before sending.
 */
const sendNotification = async ({ userId, title, body, data, preferenceType }) => {
    try {
        // --- NEW: Preference Check ---
        if (preferenceType) {
            const preferences = await prisma.notificationPreference.findUnique({
                where: { userId }
            });

            if (preferences) {
                // Map generic types to specific database columns
                let shouldSend = true;
                switch (preferenceType) {
                    case 'wallet': // Covers purchases and low balance
                        shouldSend = preferences.lowBalanceWarning;
                        break;
                    case 'bus':
                        shouldSend = preferences.busUpdates;
                        break;
                    case 'academic':
                        shouldSend = preferences.newGrade || preferences.newHomework;
                        break;
                    default:
                        // No specific mapping found, default to sending or check generic fields if any
                        break;
                }

                if (!shouldSend) {
                    console.log(`Notification skipped by user preference: User ${userId} has disabled ${preferenceType} notifications.`);
                    return;
                }
            }
        }
        // -----------------------------

        const userDevices = await prisma.deviceToken.findMany({ where: { userId } });
        if (userDevices.length === 0) {
            console.log(`Notification Service: No device tokens for user ${userId}. Skipping.`);
            return;
        }
        const tokens = userDevices.map(device => device.token);
        const message = { notification: { title, body }, data: data || {}, tokens };
        const response = await admin.messaging().sendMulticast(message);
        console.log(`Successfully sent notification to ${response.successCount} of ${tokens.length} devices.`);

        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error.code === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(tokens[idx]);
                }
            });
            if (invalidTokens.length > 0) {
                console.log(`Deleting ${invalidTokens.length} invalid tokens.`);
                await prisma.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
            }
        }
    } catch (error) {
        console.error("Error sending push notification via Firebase:", error);
    }
};

module.exports = { sendNotification };