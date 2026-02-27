// __tests__/rbac-bus-comm-stats.test.js
const request = require('supertest');
const express = require('express');

// 1. Mock the controllers to avoid DB connections
jest.mock('../src/controllers/busController', () => ({
    startTrip: (req, res) => res.status(200).json({ success: true, data: { fake: 'trip-started' } }),
    updateBusStatus: (req, res) => res.status(200).json({ success: true, data: { fake: 'status-updated' } }),
    // Mock the rest to prevent router setup errors
    endTrip: jest.fn(),
    getBusTripDetails: jest.fn(),
    getStudentBusStatus: jest.fn(),
    getBusRoutes: jest.fn()
}));

jest.mock('../src/controllers/communicationController', () => ({
    sendBroadcast: (req, res) => res.status(200).json({ success: true, data: { fake: 'broadcast-sent' } }),
    // Mock the rest
    createAnnouncement: jest.fn(),
    getAnnouncements: jest.fn()
}));

jest.mock('../src/controllers/statsController', () => ({
    getFeeStats: (req, res) => res.status(200).json({ success: true, data: { fake: 'stats' } }),
    getStudentFees: jest.fn()
}));

// 2. Mock authMiddleware internals to easily inject users without real JWTs, 
// while KEEPING the real hasRole implementation to test it.
jest.mock('../src/middleware/authMiddleware', () => {
    const original = jest.requireActual('../src/middleware/authMiddleware');
    return {
        ...original,
        // Override authMiddleware to just read from a test header
        authMiddleware: (req, res, next) => {
            if (!req.headers['x-test-role']) {
                return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No token' } });
            }
            req.user = {
                id: 'test-user',
                role: req.headers['x-test-role'],
                schoolId: 'school-A'
            };
            next();
        },
        // Bypass school assignment check for pure RBAC tests
        belongsToSchool: (req, res, next) => next()
    };
});

// Require the routes AFTER mocking
const busRoutes = require('../src/routes/busRoutes');
const communicationRoutes = require('../src/routes/communicationRoutes');
const reportRoutes = require('../src/routes/reportRoutes');

// 3. Setup minimal Express app
const app = express();
app.use(express.json());
app.use('/api/bus', busRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/report', reportRoutes);


// ── TEST SUITE ──────────────────────────────────────────

describe('Bus, Communication, and Stats Routes RBAC (MVP Strict)', () => {

    describe('POST /api/bus/trip/start', () => {
        it('Parent token POST bus trip start → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .post('/api/bus/trip/start')
                .set('x-test-role', 'parent')
                .send({ date: '2026-02-24', direction: 'pickup', routeName: 'A1' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('bus_supervisor token POST bus trip start → Allowed (200)', async () => {
            const res = await request(app)
                .post('/api/bus/trip/start')
                .set('x-test-role', 'bus_supervisor')
                .send({ date: '2026-02-24', direction: 'pickup', routeName: 'A1' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('PATCH /api/bus/entry/:studentId', () => {
        it('Parent token PATCH bus entry → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .patch('/api/bus/entry/123')
                .set('x-test-role', 'parent')
                .send({ tripId: 't1', status: 'boarded_on' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('bus_supervisor token PATCH bus entry → Allowed (200)', async () => {
            const res = await request(app)
                .patch('/api/bus/entry/123')
                .set('x-test-role', 'bus_supervisor')
                .send({ tripId: 't1', status: 'boarded_on' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('POST /api/communication/broadcast', () => {
        it('Teacher token POST /communication/broadcast → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .post('/api/communication/broadcast')
                .set('x-test-role', 'teacher')
                .send({ title: 'Alert', content: 'Info' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('school_admin token POST /communication/broadcast → Allowed (200)', async () => {
            const res = await request(app)
                .post('/api/communication/broadcast')
                .set('x-test-role', 'school_admin')
                .send({ title: 'Alert', content: 'Info' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('GET /api/report/overview', () => {
        it('Teacher token GET fees stats → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .get('/api/report/overview')
                .set('x-test-role', 'teacher');

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('finance token GET fees stats → Allowed (200)', async () => {
            const res = await request(app)
                .get('/api/report/overview')
                .set('x-test-role', 'finance');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('school_admin token GET fees stats → Allowed (200)', async () => {
            const res = await request(app)
                .get('/api/report/overview')
                .set('x-test-role', 'school_admin');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

});
