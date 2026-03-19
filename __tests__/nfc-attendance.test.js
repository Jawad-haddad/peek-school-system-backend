// __tests__/nfc-attendance.test.js
const request = require('supertest');
const express = require('express');

// ──────────────────────────────────────────────────────────
// Module mocks (must come BEFORE require of routes)
// ──────────────────────────────────────────────────────────

// Mock prismaClient — we'll override return values per test
const mockPrisma = {
    student: { findFirst: jest.fn() },
    nfcCard: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
    },
    nfcDevice: { 
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    attendance: { upsert: jest.fn() },
};
jest.mock('../src/prismaClient', () => mockPrisma);
jest.mock('../src/config/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));
jest.mock('../src/services/notificationService', () => ({
    sendNotification: jest.fn(),
}));

// Mock authMiddleware — inject user via x-test-role header
jest.mock('../src/middleware/authMiddleware', () => {
    const original = jest.requireActual('../src/middleware/authMiddleware');
    return {
        ...original,
        authMiddleware: (req, res, next) => {
            if (!req.headers['x-test-role']) {
                return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No token' } });
            }
            req.user = {
                id: 'test-user',
                role: req.headers['x-test-role'],
                schoolId: req.headers['x-test-school'] || 'school-A',
            };
            next();
        },
        belongsToSchool: (req, res, next) => next(),
    };
});

// Set NFC_DEVICE_KEY for scan tests
process.env.NFC_DEVICE_KEY = 'test-device-secret';

// Now require routes (after mocks)
const nfcRoutes = require('../src/routes/nfcRoutes');

// Build minimal Express app
const app = express();
app.use(express.json());
app.use('/api/nfc', nfcRoutes);

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
const adminHeaders = {
    'x-test-role': 'school_admin',
    'x-test-school': 'school-A',
};
const deviceHeaders = { 
    'x-device-id': 'gate-1',
    'x-device-key': 'test-device-secret' 
};

const SAMPLE_UID = 'A1:B2:C3:D4';
const STUDENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const CARD_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

beforeEach(() => {
    jest.clearAllMocks();
});

// ──────────────────────────────────────────────────────────
// TEST SUITE
// ──────────────────────────────────────────────────────────

describe('NFC Card Management & Attendance', () => {

    // ── 1. Assign card (happy path) ──────────────────────
    describe('POST /api/nfc/cards/assign', () => {
        it('assigns a card to a student → 201', async () => {
            mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID, schoolId: 'school-A' });
            mockPrisma.nfcCard.findUnique.mockResolvedValue(null); // no duplicate
            const createdCard = { id: CARD_ID, uid: SAMPLE_UID, studentId: STUDENT_ID, schoolId: 'school-A', status: 'ACTIVE' };
            mockPrisma.nfcCard.create.mockResolvedValue(createdCard);

            const res = await request(app)
                .post('/api/nfc/cards/assign')
                .set(adminHeaders)
                .send({ uid: SAMPLE_UID, studentId: STUDENT_ID, label: 'Primary card' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.uid).toBe(SAMPLE_UID);
        });

        // ── 2. Duplicate UID rejection ───────────────────
        it('rejects duplicate UID in the same school → 409 NFC_DUPLICATE_UID', async () => {
            mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID, schoolId: 'school-A' });
            mockPrisma.nfcCard.findUnique.mockResolvedValue({ id: CARD_ID }); // UID exists

            const res = await request(app)
                .post('/api/nfc/cards/assign')
                .set(adminHeaders)
                .send({ uid: SAMPLE_UID, studentId: STUDENT_ID });

            expect(res.status).toBe(409);
            expect(res.body.error.code).toBe('NFC_DUPLICATE_UID');
        });

        // ── 9. Parent role → 403 ────────────────────────
        it('rejects parent role → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .post('/api/nfc/cards/assign')
                .set({ 'x-test-role': 'parent', 'x-test-school': 'school-A' })
                .send({ uid: SAMPLE_UID, studentId: STUDENT_ID });

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });
    });

    // ── 3. Block card ────────────────────────────────────
    describe('PATCH /api/nfc/cards/:id/block', () => {
        it('blocks an active card → 200', async () => {
            mockPrisma.nfcCard.findUnique.mockResolvedValue({ id: CARD_ID, schoolId: 'school-A', status: 'ACTIVE' });
            mockPrisma.nfcCard.update.mockResolvedValue({ id: CARD_ID, status: 'BLOCKED' });

            const res = await request(app)
                .patch(`/api/nfc/cards/${CARD_ID}/block`)
                .set(adminHeaders);

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('BLOCKED');
        });

        // ── 8. Cross-school access → 403 ────────────────
        it('rejects cross-school block → 403 TENANT_FORBIDDEN', async () => {
            mockPrisma.nfcCard.findUnique.mockResolvedValue({ id: CARD_ID, schoolId: 'school-B', status: 'ACTIVE' });

            const res = await request(app)
                .patch(`/api/nfc/cards/${CARD_ID}/block`)
                .set(adminHeaders); // school-A user trying to block school-B card

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('TENANT_FORBIDDEN');
        });
    });

    // ── Scan endpoint ────────────────────────────────────
    describe('POST /api/nfc/scan', () => {

        const makeCardResult = (overrides = {}) => ({
            id: CARD_ID,
            uid: SAMPLE_UID,
            status: 'ACTIVE',
            schoolId: 'school-A',
            lastScannedAt: null,
            student: {
                id: STUDENT_ID,
                fullName: 'Test Student',
                schoolId: 'school-A',
                enrollments: [{ class: { name: 'Grade 5A' } }],
            },
            ...overrides,
        });

        const activeDevice = {
            id: 'dev-1',
            deviceId: 'gate-1',
            schoolId: 'school-A',
            apiKey: 'test-device-secret',
            status: 'ACTIVE'
        };

        beforeEach(() => {
            mockPrisma.nfcDevice.findFirst.mockResolvedValue(activeDevice);
        });

        // ── 5. Unknown card → 404 ───────────────────────
        it('rejects unknown card → 404 NFC_UNKNOWN_CARD', async () => {
            mockPrisma.nfcCard.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/nfc/scan')
                .set(deviceHeaders)
                .send({ uid: 'FF:FF:FF:FF' });

            expect(res.status).toBe(404);
            expect(res.body.error.code).toBe('NFC_UNKNOWN_CARD');
        });

        // ── 4. Blocked card scan → 403 ──────────────────
        it('rejects blocked card → 403 NFC_CARD_BLOCKED', async () => {
            mockPrisma.nfcCard.findFirst.mockResolvedValue(makeCardResult({ status: 'BLOCKED' }));

            const res = await request(app)
                .post('/api/nfc/scan')
                .set(deviceHeaders)
                .send({ uid: SAMPLE_UID });

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('NFC_CARD_BLOCKED');
        });

        // ── 6. Successful attendance scan ────────────────
        it('records attendance on valid scan → 200 CHECK_IN', async () => {
            mockPrisma.nfcCard.findFirst.mockResolvedValue(makeCardResult());
            mockPrisma.attendance.upsert.mockResolvedValue({ id: 'att-1' });
            mockPrisma.nfcCard.update.mockResolvedValue({});

            const res = await request(app)
                .post('/api/nfc/scan')
                .set(deviceHeaders)
                .send({ uid: SAMPLE_UID, deviceId: 'gate-1' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.action).toBe('CHECK_IN');
            expect(res.body.data.student.name).toBe('Test Student');
            expect(res.body.data.student.className).toBe('Grade 5A');

            // Verify attendance upsert was called
            expect(mockPrisma.attendance.upsert).toHaveBeenCalledTimes(1);
            // Verify lastScannedAt was updated
            expect(mockPrisma.nfcCard.update).toHaveBeenCalledTimes(1);
        });

        // ── 7. Cooldown (rapid duplicate scan) → 429 ────
        it('rejects rapid duplicate scan → 429 NFC_COOLDOWN', async () => {
            const recentScan = new Date(Date.now() - 5000); // 5 seconds ago
            mockPrisma.nfcCard.findFirst.mockResolvedValue(makeCardResult({ lastScannedAt: recentScan }));

            const res = await request(app)
                .post('/api/nfc/scan')
                .set(deviceHeaders)
                .send({ uid: SAMPLE_UID });

            expect(res.status).toBe(429);
            expect(res.body.error.code).toBe('NFC_COOLDOWN');
        });

        // ── Scan without device key → 401 ───────────────
        it('rejects scan without device key → 401', async () => {
            const res = await request(app)
                .post('/api/nfc/scan')
                .send({ uid: SAMPLE_UID });

            expect(res.status).toBe(401);
        });

        // ── Scan with wrong device key → 401 ────────────
        it('rejects scan with wrong device key → 401', async () => {
            const res = await request(app)
                .post('/api/nfc/scan')
                .set({ 'x-device-key': 'wrong-key' })
                .send({ uid: SAMPLE_UID });

            expect(res.status).toBe(401);
        });
    });

    // ── Unassign card ────────────────────────────────────
    describe('DELETE /api/nfc/cards/:id/unassign', () => {
        it('deletes the card → 200', async () => {
            mockPrisma.nfcCard.findUnique.mockResolvedValue({ id: CARD_ID, schoolId: 'school-A' });
            mockPrisma.nfcCard.delete.mockResolvedValue({});

            const res = await request(app)
                .delete(`/api/nfc/cards/${CARD_ID}/unassign`)
                .set(adminHeaders);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // ── Create Device ────────────────────────────────────
    describe('POST /api/nfc/devices', () => {
        it('creates a new device auto-generating deviceId and apiKey → 201', async () => {
            mockPrisma.nfcDevice.findUnique.mockResolvedValue(null);
            
            // Mock prisma create to echo back the generated fields
            mockPrisma.nfcDevice.create.mockImplementation(({ data }) => Promise.resolve({
                id: 'new-dev',
                ...data
            }));

            const res = await request(app)
                .post('/api/nfc/devices')
                .set(adminHeaders)
                .send({ name: 'Library Reader' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.name).toBe('Library Reader');
            expect(res.body.data.deviceId).toMatch(/^dev-[0-9a-f]{8}$/);
            expect(res.body.data.apiKey).toMatch(/^key-[0-9a-f]{32}$/);
        });
    });
});
