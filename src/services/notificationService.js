// src/services/notificationService.js

const admin = require('firebase-admin');
const prisma = require('../prismaClient');

try {
    const serviceAccount = require('../../firebase-service-account.json');
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
    try {
        const userDevices = await prisma.deviceToken.findMany({
            where: { userId: userId },
            select: { token: true }
        });

        if (userDevices.length === 0) {
            console.log(`Notification Service: No device tokens for user ${userId}. Skipping.`);
            return;
        }

        const tokens = userDevices.map(device => device.token);
        const message = {
            notification: { title, body },
            data: data || {},
            tokens: tokens,
        };

        const response = await admin.messaging().sendMulticast(message);
        console.log(`Successfully sent notification to ${response.successCount} of ${tokens.length} devices for user ${userId}.`);

        // --- NEW: Professional Error Handling & Cleanup ---
        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    // Check for the specific error that means the token is no longer valid
                    if (resp.error.code === 'messaging/registration-token-not-registered') {
                        invalidTokens.push(tokens[idx]);
                    }
                }
            });

            // If we found any invalid tokens, delete them from our database
            if (invalidTokens.length > 0) {
                console.log(`Found ${invalidTokens.length} invalid tokens to delete.`);
                await prisma.deviceToken.deleteMany({
                    where: {
                        token: { in: invalidTokens }
                    }
                });
                console.log("Invalid tokens have been deleted.");
            }
        }
        // ---------------------------------------------------

    } catch (error) {
        console.error("Error sending push notification via Firebase:", error);
    }
};

module.exports = { sendNotification };