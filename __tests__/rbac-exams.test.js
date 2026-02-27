// __tests__/rbac-exams.test.js
const request = require('supertest');
const express = require('express');

// 1. Mock the controller to avoid DB connections
jest.mock('../src/controllers/examController', () => ({
    createExam: (req, res) => res.status(200).json({ success: true, data: { fake: 'exam-created' } }),
    createExamSchedule: (req, res) => res.status(200).json({ success: true, data: { fake: 'schedule-created' } }),
    submitBulkMarks: (req, res) => res.status(200).json({ success: true, data: { fake: 'marks-submitted' } }),
    getStudentGrades: (req, res) => res.status(200).json({ success: true, data: [] }),
    getAllExams: (req, res) => res.status(200).json({ success: true, data: [] }),
    getExamSchedules: (req, res) => res.status(200).json({ success: true, data: [] }),
    updateExam: (req, res) => res.status(200).json({ success: true, data: { fake: 'exam-updated' } }),
    deleteExam: (req, res) => res.status(200).json({ success: true, data: { fake: 'exam-deleted' } })
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
const examRoutes = require('../src/routes/examRoutes');

// 3. Setup minimal Express app
const app = express();
app.use(express.json());
app.use('/api/exams', examRoutes);


// ── TEST SUITE ──────────────────────────────────────────

describe('Exam Routes RBAC (MVP Strict)', () => {

    describe('POST /api/exams (Create Exam)', () => {
        it('Parent token calling exam create → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .post('/api/exams')
                .set('x-test-role', 'parent')
                .send({ name: 'Term 1 Exam' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('Teacher token calling exam create → 403 FORBIDDEN_ROLE (MVP strict admin only)', async () => {
            const res = await request(app)
                .post('/api/exams')
                .set('x-test-role', 'teacher')
                .send({ name: 'Term 1 Exam' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('school_admin token calling exam create → Allowed (200)', async () => {
            const res = await request(app)
                .post('/api/exams')
                .set('x-test-role', 'school_admin')
                .send({ name: 'Term 1 Exam' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('POST /api/exams/schedules/:scheduleId/marks (Submit Marks)', () => {
        it('Parent token submitting marks → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .post('/api/exams/schedules/123/marks')
                .set('x-test-role', 'parent')
                .send({ marks: [] });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('Teacher token submitting marks → Allowed (200)', async () => {
            const res = await request(app)
                .post('/api/exams/schedules/123/marks')
                .set('x-test-role', 'teacher')
                .send({ marks: [] });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('school_admin token submitting marks → Allowed (200)', async () => {
            const res = await request(app)
                .post('/api/exams/schedules/123/marks')
                .set('x-test-role', 'school_admin')
                .send({ marks: [] });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

});
