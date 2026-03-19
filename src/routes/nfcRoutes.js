// src/routes/nfcRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { validate, validateParams } = require('../validators/userValidator');
const { assignCardSchema, scanCardSchema, cardIdParamSchema } = require('../validators/nfc.validator');
const { fail } = require('../utils/response');
const {
    assignCard,
    listCards,
    blockCard,
    unblockCard,
    unassignCard,
    scanCard,
    listDevices,
    createDevice,
    disableDevice,
    enableDevice,
    deleteDevice,
} = require('../controllers/nfcController');
const { createDeviceSchema, deviceIdParamSchema } = require('../validators/nfc.validator');

const { UserRole } = require('@prisma/client');

// ── Middleware ────────────────────────────────────────────
const adminOnly = [
    authMiddleware,
    hasRole([UserRole.super_admin, UserRole.school_admin]),
    belongsToSchool,
];

const prisma = require('../prismaClient');
const logger = require('../config/logger');

/**
 * Device authentication for ESP32 headless devices.
 * Requires `x-device-id` and `x-device-key` headers.
 */
const deviceAuthMiddleware = async (req, res, next) => {
    const deviceId = req.headers['x-device-id'];
    const deviceKey = req.headers['x-device-key'];

    if (!deviceId || !deviceKey) {
        return fail(res, 401, 'Missing x-device-id or x-device-key header.', 'UNAUTHORIZED');
    }

    try {
        const device = await prisma.nfcDevice.findFirst({
            where: { deviceId }
        });

        if (!device) {
            return fail(res, 401, 'Unknown device.', 'UNAUTHORIZED');
        }

        if (device.status !== 'ACTIVE') {
            return fail(res, 403, 'Device is disabled.', 'DEVICE_DISABLED');
        }

        if (device.apiKey !== deviceKey) {
            return fail(res, 401, 'Invalid device key.', 'UNAUTHORIZED');
        }

        req.device = device;
        next();
    } catch (error) {
        logger.error({ error, deviceId }, 'Device auth error');
        return fail(res, 500, 'Device authentication failed.', 'SERVER_ERROR');
    }
};

// ── Card management (admin-only, JWT-authenticated) ──────

/**
 * @swagger
 * tags:
 *   - name: NFC
 *     description: NFC card management and ESP32 scan
 */

/**
 * @swagger
 * /api/nfc/cards/assign:
 *   post:
 *     summary: Assign an NFC card to a student
 *     tags: [NFC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [uid, studentId]
 *             properties:
 *               uid: { type: string, example: "A1:B2:C3:D4" }
 *               studentId: { type: string, format: uuid }
 *               label: { type: string, example: "Student primary card" }
 *     responses:
 *       "201": { description: Card assigned }
 *       "409": { description: Duplicate UID }
 *       "404": { description: Student not found }
 */
router.post('/cards/assign', adminOnly, validate(assignCardSchema), assignCard);

/**
 * @swagger
 * /api/nfc/cards:
 *   get:
 *     summary: List NFC cards for a school
 *     tags: [NFC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       "200": { description: Array of NFC cards }
 */
router.get('/cards', adminOnly, listCards);

/**
 * @swagger
 * /api/nfc/cards/{id}/block:
 *   patch:
 *     summary: Block an NFC card
 *     tags: [NFC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       "200": { description: Card blocked }
 *       "404": { description: Card not found }
 */
router.patch('/cards/:id/block', adminOnly, validateParams(cardIdParamSchema), blockCard);

/**
 * @swagger
 * /api/nfc/cards/{id}/unblock:
 *   patch:
 *     summary: Unblock an NFC card
 *     tags: [NFC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       "200": { description: Card unblocked }
 *       "404": { description: Card not found }
 */
router.patch('/cards/:id/unblock', adminOnly, validateParams(cardIdParamSchema), unblockCard);

/**
 * @swagger
 * /api/nfc/cards/{id}/unassign:
 *   delete:
 *     summary: Unassign (delete) an NFC card
 *     tags: [NFC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       "200": { description: Card unassigned }
 *       "404": { description: Card not found }
 */
router.delete('/cards/:id/unassign', adminOnly, validateParams(cardIdParamSchema), unassignCard);

// ── Device Management (admin-only, JWT-authenticated) ────
router.post('/devices', adminOnly, validate(createDeviceSchema), createDevice);
router.get('/devices', adminOnly, listDevices);
router.patch('/devices/:id/disable', adminOnly, validateParams(deviceIdParamSchema), disableDevice);
router.patch('/devices/:id/enable', adminOnly, validateParams(deviceIdParamSchema), enableDevice);
router.delete('/devices/:id', adminOnly, validateParams(deviceIdParamSchema), deleteDevice);

// ── ESP32 scan endpoint (device-key authenticated) ───────

/**
 * @swagger
 * /api/nfc/scan:
 *   post:
 *     summary: Process an NFC card scan from an ESP32 device
 *     tags: [NFC]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [uid]
 *             properties:
 *               uid: { type: string, example: "A1:B2:C3:D4" }
 *               timestamp: { type: string, format: date-time }
 *     responses:
 *       "200": { description: Attendance recorded }
 *       "403": { description: Card is blocked or Device is disabled }
 *       "404": { description: Unknown card }
 *       "429": { description: Cooldown active }
 */
router.post('/scan', deviceAuthMiddleware, validate(scanCardSchema), scanCard);

module.exports = router;
