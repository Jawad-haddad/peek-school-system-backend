// src/controllers/nfcController.js
const prisma = require('../prismaClient');
const logger = require('../config/logger');
const { ok, fail } = require('../utils/response');
const { getTenant, tenantWhere } = require('../utils/tenant');
const { getPaginationParams } = require('../utils/pagination');
const crypto = require('crypto');

const SCAN_COOLDOWN_MS = 15_000; // 15 seconds

// ── POST /api/nfc/cards/assign ───────────────────────────
const assignCard = async (req, res) => {
    const { uid, studentId, label } = req.body;
    const { schoolId } = getTenant(req);

    try {
        // 1. Verify student belongs to the caller's school
        const student = await prisma.student.findFirst({
            where: { id: studentId, schoolId },
        });
        if (!student) {
            return fail(res, 404, 'Student not found in your school.', 'NOT_FOUND');
        }

        // 2. Check for duplicate UID within the school
        const existing = await prisma.nfcCard.findUnique({
            where: { schoolId_uid: { schoolId, uid: uid.toUpperCase() } },
        });
        if (existing) {
            return fail(res, 409, 'This UID is already assigned in your school.', 'NFC_DUPLICATE_UID');
        }

        // 3. Create the card
        const card = await prisma.nfcCard.create({
            data: {
                uid: uid.toUpperCase(),
                label: label || null,
                studentId,
                schoolId,
            },
        });

        logger.info({ cardId: card.id, uid: card.uid, studentId, schoolId, audit: true, action: 'NFC_CARD_ASSIGN' },
            'NFC card assigned');

        ok(res, card, undefined, 201);
    } catch (error) {
        logger.error({ error, uid, studentId }, 'Error assigning NFC card');
        fail(res, 500, 'Failed to assign NFC card.', 'SERVER_ERROR');
    }
};

// ── GET /api/nfc/cards ──────────────────────────────────
const listCards = async (req, res) => {
    const { schoolId } = getTenant(req);
    const { search } = req.query;
    const { take, skip, meta } = getPaginationParams(req);

    try {
        const where = { schoolId };
        if (search) {
            where.OR = [
                { uid: { contains: search, mode: 'insensitive' } },
                { label: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [cards, total] = await Promise.all([
            prisma.nfcCard.findMany({
                where,
                take,
                skip,
                include: {
                    student: { select: { id: true, fullName: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.nfcCard.count({ where }),
        ]);

        ok(res, cards, { ...meta, total });
    } catch (error) {
        logger.error({ error }, 'Error listing NFC cards');
        fail(res, 500, 'Failed to list NFC cards.', 'SERVER_ERROR');
    }
};

// ── PATCH /api/nfc/cards/:id/block ──────────────────────
const blockCard = async (req, res) => {
    const { id } = req.params;
    const { schoolId, isSuperAdmin } = getTenant(req);

    try {
        const card = await prisma.nfcCard.findUnique({ where: { id } });
        if (!card) return fail(res, 404, 'Card not found.', 'NOT_FOUND');
        if (!isSuperAdmin && card.schoolId !== schoolId) {
            return fail(res, 403, 'Access denied: resource belongs to another school.', 'TENANT_FORBIDDEN');
        }

        const updated = await prisma.nfcCard.update({
            where: { id },
            data: { status: 'BLOCKED' },
        });

        logger.info({ cardId: id, audit: true, action: 'NFC_CARD_BLOCK' }, 'NFC card blocked');
        ok(res, updated);
    } catch (error) {
        logger.error({ error, cardId: id }, 'Error blocking NFC card');
        fail(res, 500, 'Failed to block NFC card.', 'SERVER_ERROR');
    }
};

// ── PATCH /api/nfc/cards/:id/unblock ────────────────────
const unblockCard = async (req, res) => {
    const { id } = req.params;
    const { schoolId, isSuperAdmin } = getTenant(req);

    try {
        const card = await prisma.nfcCard.findUnique({ where: { id } });
        if (!card) return fail(res, 404, 'Card not found.', 'NOT_FOUND');
        if (!isSuperAdmin && card.schoolId !== schoolId) {
            return fail(res, 403, 'Access denied: resource belongs to another school.', 'TENANT_FORBIDDEN');
        }

        const updated = await prisma.nfcCard.update({
            where: { id },
            data: { status: 'ACTIVE' },
        });

        logger.info({ cardId: id, audit: true, action: 'NFC_CARD_UNBLOCK' }, 'NFC card unblocked');
        ok(res, updated);
    } catch (error) {
        logger.error({ error, cardId: id }, 'Error unblocking NFC card');
        fail(res, 500, 'Failed to unblock NFC card.', 'SERVER_ERROR');
    }
};

// ── DELETE /api/nfc/cards/:id/unassign ──────────────────
const unassignCard = async (req, res) => {
    const { id } = req.params;
    const { schoolId, isSuperAdmin } = getTenant(req);

    try {
        const card = await prisma.nfcCard.findUnique({ where: { id } });
        if (!card) return fail(res, 404, 'Card not found.', 'NOT_FOUND');
        if (!isSuperAdmin && card.schoolId !== schoolId) {
            return fail(res, 403, 'Access denied: resource belongs to another school.', 'TENANT_FORBIDDEN');
        }

        await prisma.nfcCard.delete({ where: { id } });

        logger.info({ cardId: id, audit: true, action: 'NFC_CARD_UNASSIGN' }, 'NFC card unassigned');
        ok(res, { message: 'Card unassigned successfully.' });
    } catch (error) {
        logger.error({ error, cardId: id }, 'Error unassigning NFC card');
        fail(res, 500, 'Failed to unassign NFC card.', 'SERVER_ERROR');
    }
};

// ── POST /api/nfc/scan ──────────────────────────────────
const scanCard = async (req, res) => {
    const { uid, timestamp } = req.body;
    const normalizedUid = uid.toUpperCase();
    const device = req.device;

    try {
        // 1. Find card by UID scoped to the device's schoolId
        const card = await prisma.nfcCard.findFirst({
            where: { uid: normalizedUid, schoolId: device.schoolId },
            include: {
                student: {
                    select: {
                        id: true,
                        fullName: true,
                        schoolId: true,
                        enrollments: {
                            take: 1,
                            orderBy: { academicYear: { startDate: 'desc' } },
                            include: {
                                class: { select: { name: true } },
                            },
                        },
                    },
                },
            },
        });

        // 2. Unknown card
        if (!card) {
            logger.warn({ uid: normalizedUid, deviceId: device?.deviceId }, 'NFC scan: unknown card');
            return fail(res, 404, 'Unknown card', 'NFC_UNKNOWN_CARD');
        }

        // 3. Blocked card
        if (card.status === 'BLOCKED') {
            logger.warn({ uid: normalizedUid, cardId: card.id, deviceId: device?.deviceId }, 'NFC scan: card is blocked');
            return fail(res, 403, 'Card is blocked', 'NFC_CARD_BLOCKED');
        }

        // 4. Cooldown check (15 seconds)
        if (card.lastScannedAt) {
            const elapsed = Date.now() - new Date(card.lastScannedAt).getTime();
            if (elapsed < SCAN_COOLDOWN_MS) {
                return fail(res, 429, 'Duplicate scan – please wait', 'NFC_COOLDOWN');
            }
        }

        // 5. Resolve student info
        const student = card.student;
        const enrollment = student.enrollments[0];
        const className = enrollment ? enrollment.class.name : null;

        // 6. Record attendance — upsert for today (UTC date)
        const now = timestamp ? new Date(timestamp) : new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const attendanceDate = new Date(`${todayStr}T00:00:00.000Z`);

        await prisma.attendance.upsert({
            where: {
                studentId_date: {
                    studentId: student.id,
                    date: attendanceDate,
                },
            },
            update: { status: 'present' }, // If already marked, keep / update to present
            create: {
                studentId: student.id,
                date: attendanceDate,
                status: 'present',
            },
        });

        // 7. Update lastScannedAt
        await prisma.nfcCard.update({
            where: { id: card.id },
            data: { lastScannedAt: new Date() },
        });

        logger.info({
            cardId: card.id, uid: normalizedUid, studentId: student.id,
            schoolId: card.schoolId, deviceId: device?.deviceId, audit: true, action: 'NFC_SCAN_CHECKIN',
        }, 'NFC attendance recorded');

        ok(res, {
            message: 'Attendance recorded',
            action: 'CHECK_IN',
            student: {
                id: student.id,
                name: student.fullName,
                className,
            },
        });
    } catch (error) {
        logger.error({ error, uid: normalizedUid, deviceId: device?.deviceId }, 'Error processing NFC scan');
        fail(res, 500, 'Failed to process scan.', 'SERVER_ERROR');
    }
};

// ── Device Management ──────────────────────────────────────────────────────────

// ── GET /api/nfc/devices ──────────────────────────────────
const listDevices = async (req, res) => {
    const tenant = getTenant(req);
    try {
        const devices = await prisma.nfcDevice.findMany({
            where: tenantWhere(tenant),
            orderBy: { createdAt: 'desc' },
        });
        ok(res, { devices });
    } catch (error) {
        logger.error({ error, ...tenant }, 'Error fetching NFC devices');
        fail(res, 500, 'Failed to fetch NFC devices.', 'SERVER_ERROR');
    }
};

// ── POST /api/nfc/devices ─────────────────────────────────
const createDevice = async (req, res) => {
    const tenant = getTenant(req);
    const { name } = req.body;

    const deviceId = `dev-${crypto.randomBytes(4).toString('hex')}`;
    const apiKey = `key-${crypto.randomBytes(16).toString('hex')}`;

    try {
        const existing = await prisma.nfcDevice.findUnique({
            where: { schoolId_deviceId: { schoolId: tenant.schoolId, deviceId } }
        });

        if (existing) {
            return fail(res, 409, 'Generated Device ID collided. Please try again.', 'NFC_DUPLICATE_DEVICE');
        }

        const device = await prisma.nfcDevice.create({
            data: {
                deviceId,
                name,
                apiKey,
                schoolId: tenant.schoolId,
            }
        });

        ok(res, device, undefined, 201);
    } catch (error) {
        logger.error({ error, ...tenant }, 'Error creating NFC device');
        fail(res, 500, 'Failed to create NFC device.', 'SERVER_ERROR');
    }
};

// ── PATCH /api/nfc/devices/:id/disable ────────────────────
const disableDevice = async (req, res) => {
    const tenant = getTenant(req);
    const { id } = req.params;

    try {
        await assertTenantEntity(
            prisma.nfcDevice,
            id,
            tenant,
            'NfcDevice not found or does not belong to your school.'
        );

        const updated = await prisma.nfcDevice.update({
            where: { id },
            data: { status: 'DISABLED' },
        });

        ok(res, updated);
    } catch (error) {
        logger.error({ error, deviceId: id, ...tenant }, 'Error disabling NFC device');
        if (error.code === 'TENANT_FORBIDDEN') {
            return fail(res, 403, error.message, error.code);
        }
        fail(res, 500, 'Failed to disable NFC device.', 'SERVER_ERROR');
    }
};

// ── PATCH /api/nfc/devices/:id/enable ─────────────────────
const enableDevice = async (req, res) => {
    const tenant = getTenant(req);
    const { id } = req.params;

    try {
        await assertTenantEntity(
            prisma.nfcDevice,
            id,
            tenant,
            'NfcDevice not found or does not belong to your school.'
        );

        const updated = await prisma.nfcDevice.update({
            where: { id },
            data: { status: 'ACTIVE' },
        });

        ok(res, updated);
    } catch (error) {
        logger.error({ error, deviceId: id, ...tenant }, 'Error enabling NFC device');
        if (error.code === 'TENANT_FORBIDDEN') {
            return fail(res, 403, error.message, error.code);
        }
        fail(res, 500, 'Failed to enable NFC device.', 'SERVER_ERROR');
    }
};

// ── DELETE /api/nfc/devices/:id ───────────────────────────
const deleteDevice = async (req, res) => {
    const tenant = getTenant(req);
    const { id } = req.params;

    try {
        await assertTenantEntity(
            prisma.nfcDevice,
            id,
            tenant,
            'NfcDevice not found or does not belong to your school.'
        );

        await prisma.nfcDevice.delete({ where: { id } });

        ok(res, { message: 'Device deleted successfully.' });
    } catch (error) {
        logger.error({ error, deviceId: id, ...tenant }, 'Error deleting NFC device');
        if (error.code === 'TENANT_FORBIDDEN') {
            return fail(res, 403, error.message, error.code);
        }
        fail(res, 500, 'Failed to delete NFC device.', 'SERVER_ERROR');
    }
};

module.exports = {
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
};
