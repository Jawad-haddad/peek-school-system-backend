// src/utils/auditLogger.js
const prisma = require('../prismaClient');
const logger = require('../config/logger');

/**
 * Creates an audit log entry for critical actions.
 * 
 * @param {object} txOrNull - Prisma transaction client, or null to use the default client
 * @param {object} params
 * @param {string} params.userId - ID of the user performing the action
 * @param {string} params.userEmail - Email of the user performing the action
 * @param {string} params.actionType - e.g. 'CREATE_STUDENT', 'DELETE_TEACHER', 'RECORD_PAYMENT'
 * @param {object} [params.details] - JSON-serializable details about the action
 * @param {string} [params.schoolId] - School context
 */
async function logAudit(txOrNull, { userId, userEmail, actionType, details, schoolId }) {
    try {
        const client = txOrNull || prisma;
        await client.auditLog.create({
            data: {
                userId,
                userEmail: userEmail || 'unknown',
                actionType,
                details: details || undefined,
                schoolId: schoolId || undefined
            }
        });
    } catch (err) {
        // Audit failures must never crash the primary operation
        logger.error({ error: err.message, actionType }, 'Failed to write audit log');
    }
}

module.exports = { logAudit };
