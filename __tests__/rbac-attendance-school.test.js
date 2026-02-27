// __tests__/rbac-attendance-school.test.js
const request = require('supertest');
const express = require('express');

// 1. Mock the controllers to avoid DB connections
jest.mock('../src/controllers/attendanceController', () => ({
    submitClassAttendance: (req, res) => res.status(200).json({ success: true, data: { fake: 'attendance-submitted' } }),
    getClassAttendance: (req, res) => res.status(200).json({ success: true, data: [] })
}));

jest.mock('../src/controllers/schoolController', () => ({
    createSchool: jest.fn(),
    createStudent: (req, res) => res.status(200).json({ success: true, data: { fake: 'student-created' } }),
    createTeacher: (req, res) => res.status(200).json({ success: true, data: { fake: 'teacher-created' } }),
    deleteStudent: (req, res) => res.status(200).json({ success: true, data: { fake: 'student-deleted' } }),
    // Mock the rest to prevent router setup errors
    createAcademicYear: jest.fn(),
    createSubject: jest.fn(),
    createClass: jest.fn(),
    enrollStudentInClass: jest.fn(),
    exportStudentsToCsv: jest.fn(),
    getAllTeachers: jest.fn(),
    getAllClasses: jest.fn(),
    getStudents: jest.fn(),
    updateStudent: jest.fn(),
    updateTeacher: jest.fn(),
    deleteTeacher: jest.fn(),
    deleteClass: jest.fn(),
    updateClass: jest.fn()
}));

jest.mock('../src/controllers/studentController', () => ({
    toggleStudentNfc: jest.fn()
}));
jest.mock('../src/controllers/examController', () => ({
    getAllExams: jest.fn()
}));
jest.mock('../src/controllers/statsController', () => ({
    getFeeStats: jest.fn()
}));
jest.mock('../src/controllers/academicController', () => ({
    getClassTimetable: jest.fn()
}));
jest.mock('../src/validators/userValidator', () => ({
    validate: () => (req, res, next) => next()
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
const attendanceRoutes = require('../src/routes/attendanceRoutes');
const schoolRoutes = require('../src/routes/schoolRoutes');

// 3. Setup minimal Express app
const app = express();
app.use(express.json());
app.use('/api/attendance', attendanceRoutes);
app.use('/api/school', schoolRoutes);


// ── TEST SUITE ──────────────────────────────────────────

describe('Attendance and School Routes RBAC (MVP Strict)', () => {

    describe('POST /api/attendance/bulk', () => {
        it('Parent token POST /attendance/bulk → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .post('/api/attendance/bulk')
                .set('x-test-role', 'parent')
                .send({ classId: 'cls-1', date: '2026-02-24', records: [] });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('Teacher token POST /attendance/bulk → Allowed (200)', async () => {
            const res = await request(app)
                .post('/api/attendance/bulk')
                .set('x-test-role', 'teacher')
                .send({ classId: 'cls-1', date: '2026-02-24', records: [] });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('school_admin token POST /attendance/bulk → Allowed (200)', async () => {
            const res = await request(app)
                .post('/api/attendance/bulk')
                .set('x-test-role', 'school_admin')
                .send({ classId: 'cls-1', date: '2026-02-24', records: [] });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('POST /api/school/students (Create Student)', () => {
        it('Parent token POST /school/students → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .post('/api/school/students')
                .set('x-test-role', 'parent')
                .send({ fullName: 'New Student' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('Teacher token POST /school/students → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .post('/api/school/students')
                .set('x-test-role', 'teacher')
                .send({ fullName: 'New Student' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('school_admin token POST /school/students → Allowed (200)', async () => {
            const res = await request(app)
                .post('/api/school/students')
                .set('x-test-role', 'school_admin')
                .send({ fullName: 'New Student' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('DELETE /api/school/students/:studentId', () => {
        it('Teacher token DELETE student → 403 FORBIDDEN_ROLE', async () => {
            const res = await request(app)
                .delete('/api/school/students/123')
                .set('x-test-role', 'teacher');

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
        });

        it('school_admin token DELETE student → Allowed (200)', async () => {
            const res = await request(app)
                .delete('/api/school/students/123')
                .set('x-test-role', 'school_admin');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

});
