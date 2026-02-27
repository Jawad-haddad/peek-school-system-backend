// __tests__/validation-4a.test.js
const request = require('supertest');
const express = require('express');

// 1. Mock the controllers so we only test validation logic
jest.mock('../src/controllers/userController', () => ({
    loginUser: (req, res) => res.status(200).json({ success: true, data: { fake: 'login-success' } }),
    verifyTwoFactorCode: (req, res) => res.status(200).json({ success: true, data: { fake: 'verified-2fa' } }),
    registerUser: jest.fn(),
    getUserProfile: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    registerDevice: jest.fn()
}));

jest.mock('../src/controllers/schoolController', () => ({
    createStudent: (req, res) => res.status(200).json({ success: true, data: { fake: 'student-created' } }),
    createTeacher: (req, res) => res.status(200).json({ success: true, data: { fake: 'teacher-created' } }),
    createSchool: jest.fn(),
    createAcademicYear: jest.fn(),
    createSubject: jest.fn(),
    createClass: jest.fn(),
    enrollStudentInClass: jest.fn(),
    exportStudentsToCsv: jest.fn(),
    getAllTeachers: jest.fn(),
    getAllClasses: jest.fn(),
    getStudents: jest.fn(),
    updateStudent: jest.fn(),
    deleteStudent: jest.fn(),
    updateTeacher: jest.fn(),
    deleteTeacher: jest.fn(),
    deleteClass: jest.fn(),
    updateClass: jest.fn()
}));

jest.mock('../src/controllers/attendanceController', () => ({
    submitClassAttendance: (req, res) => res.status(200).json({ success: true, data: { fake: 'attendance-recorded' } }),
    getClassAttendance: jest.fn()
}));

// Ignore non-target controller setups
jest.mock('../src/controllers/studentController', () => ({ toggleStudentNfc: jest.fn() }));
jest.mock('../src/controllers/examController', () => ({ getAllExams: jest.fn() }));
jest.mock('../src/controllers/statsController', () => ({ getFeeStats: jest.fn() }));
jest.mock('../src/controllers/academicController', () => ({ getClassTimetable: jest.fn() }));

// 2. Mock authMiddleware to purely pass-through and set a fake admin role so we bypass RBAC
jest.mock('../src/middleware/authMiddleware', () => ({
    authMiddleware: (req, res, next) => {
        req.user = { id: 'test', role: 'school_admin', schoolId: 'school-A' };
        next();
    },
    hasRole: () => (req, res, next) => next(),
    belongsToSchool: (req, res, next) => next()
}));

// Mock rate limiter
jest.mock('../src/middleware/rateLimiter', () => ({
    loginLimiter: (req, res, next) => next()
}));


// Require routes
const userRoutes = require('../src/routes/userRoutes');
const schoolRoutes = require('../src/routes/schoolRoutes');
const attendanceRoutes = require('../src/routes/attendanceRoutes');

// 3. Setup Express app
const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/attendance', attendanceRoutes);


// ── TEST SUITE ──────────────────────────────────────────

describe('Input Validation 4A (Zod Envelopes)', () => {

    describe('POST /api/users/login', () => {
        it('login invalid email → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/users/login')
                .send({ email: 'not-an-email', password: 'password123' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'email', message: 'Invalid email address' })
                ])
            );
        });

        it('login valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/users/login')
                .send({ email: 'test@peek.com', password: 'password123' });
            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/users/login/verify', () => {
        it('verify missing otp → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/users/login/verify')
                .send({ email: 'test@peek.com' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'code' })
                ])
            );
        });
    });

    describe('POST /api/school/students', () => {
        it('create student missing fullName → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/school/students')
                .send({ classId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'fullName' })
                ])
            );
        });

        it('create student valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/school/students')
                .send({ fullName: 'John Doe', classId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57' });
            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/attendance/bulk', () => {
        it('attendance bulk empty records → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/attendance/bulk')
                .send({ classId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57', date: '2026-02-24', records: [] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'records', message: 'At least one attendance record is required' })
                ])
            );
        });

        it('attendance bulk invalid status → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/attendance/bulk')
                .send({
                    classId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57',
                    date: '2026-02-24',
                    records: [{ studentId: 'e207ed4f-2d93-455a-bd55-a01c45582f3c', status: 'sleeping' }]
                });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('attendance bulk valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/attendance/bulk')
                .send({
                    classId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57',
                    date: '2026-02-24',
                    records: [{ studentId: 'e207ed4f-2d93-455a-bd55-a01c45582f3c', status: 'present' }]
                });
            expect(res.status).toBe(200);
        });
    });

});
