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
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized successfully.");

} catch (error) {
    console.error("Firebase Admin SDK initialization failed:", error);
}

/**
 * Sends a real push notification and handles cleanup of invalid tokens.
 */
const sendNotification = async ({ userId, title, body, data }) => {
    // This function's logic remains the same.
    try {
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