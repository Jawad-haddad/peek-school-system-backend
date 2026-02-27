// __tests__/validation-4b.test.js
const request = require('supertest');
const express = require('express');

// 1. Mock the controllers so we only test validation logic
jest.mock('../src/controllers/schoolController', () => ({
    createSchool: jest.fn(),
    createAcademicYear: (req, res) => res.status(200).json({ success: true, data: { fake: 'academic-year-created' } }),
    createSubject: (req, res) => res.status(200).json({ success: true, data: { fake: 'subject-created-schooladmin' } }),
    createClass: (req, res) => res.status(200).json({ success: true, data: { fake: 'class-created' } }),
    enrollStudentInClass: jest.fn(),
    exportStudentsToCsv: jest.fn(),
    getAllTeachers: jest.fn(),
    getAllClasses: jest.fn(),
    getStudents: jest.fn(),
    createStudent: jest.fn(),
    createTeacher: jest.fn(),
    updateStudent: jest.fn(),
    deleteStudent: jest.fn(),
    updateTeacher: jest.fn(),
    deleteTeacher: jest.fn(),
    deleteClass: jest.fn(),
    updateClass: jest.fn()
}));

jest.mock('../src/controllers/academicController', () => ({
    createHomework: jest.fn(),
    getHomework: jest.fn(),
    getHomeworkForStudent: jest.fn(),
    addGrade: jest.fn(),
    getMySchedule: jest.fn(),
    getTeacherClasses: jest.fn(),
    getAcademicYears: jest.fn(),
    getSubjects: jest.fn(),
    getMyStudents: jest.fn(),
    getClassStudents: jest.fn(),
    createTimeTableEntry: jest.fn(),
    getClassTimetable: jest.fn(),
    createSubject: (req, res) => res.status(200).json({ success: true, data: { fake: 'subject-created-academic' } }),
    createAcademicYear: jest.fn(),
    createTeacher: jest.fn()
}));

// Ignore non-target controller setups
jest.mock('../src/controllers/studentController', () => ({ toggleStudentNfc: jest.fn() }));
jest.mock('../src/controllers/examController', () => ({ getAllExams: jest.fn() }));
jest.mock('../src/controllers/statsController', () => ({ getFeeStats: jest.fn() }));
jest.mock('../src/controllers/attendanceController', () => ({ submitClassAttendance: jest.fn(), getClassAttendance: jest.fn() }));

// 2. Mock authMiddleware to purely pass-through and set a fake admin role so we bypass RBAC
jest.mock('../src/middleware/authMiddleware', () => ({
    authMiddleware: (req, res, next) => {
        req.user = { id: 'test', role: 'school_admin', schoolId: 'school-A' };
        next();
    },
    hasRole: () => (req, res, next) => next(),
    belongsToSchool: (req, res, next) => next()
}));

// Require routes
const schoolRoutes = require('../src/routes/schoolRoutes');
const academicRoutes = require('../src/routes/academicRoutes');

// 3. Setup Express app
const app = express();
app.use(express.json());
app.use('/api/school', schoolRoutes);
app.use('/api/academics', academicRoutes);

// ── TEST SUITE ──────────────────────────────────────────

describe('Input Validation 4B (Academics)', () => {

    describe('POST /api/school/academic-years', () => {
        it('create academic year missing name → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/school/academic-years')
                .send({ startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'name' })
                ])
            );
        });

        it('create academic year invalid date order (endDate < startDate) → 400', async () => {
            const res = await request(app)
                .post('/api/school/academic-years')
                .send({ name: 'Invalid Year', startDate: '2026-12-31T00:00:00.000Z', endDate: '2026-01-01T00:00:00.000Z' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'endDate', message: 'End date must be after start date' })
                ])
            );
        });

        it('create academic year valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/school/academic-years')
                .send({ name: '2025-2026', startDate: '2025-09-01T00:00:00.000Z', endDate: '2026-06-30T00:00:00.000Z' });
            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/school/classes', () => {
        it('create class missing academicYearId → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/school/classes')
                .send({ name: 'Grade 10' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'academicYearId' })
                ])
            );
        });

        it('create class negative defaultFee → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/school/classes')
                .send({ name: 'Grade 10', academicYearId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57', defaultFee: -500 });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'defaultFee', message: 'defaultFee must be a positive number' })
                ])
            );
        });

        it('create class valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/school/classes')
                .send({ name: 'Grade 10', academicYearId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57', defaultFee: 5000 });
            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/academics/subjects', () => {
        it('create subject missing name → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/academics/subjects')
                .send({ classId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'name' })
                ])
            );
        });

        it('create subject strictly rejects unknown keys → 400', async () => {
            const res = await request(app)
                .post('/api/academics/subjects')
                .send({ name: 'Math', classId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57', randomJunkKey: '123' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ message: 'Unrecognized key: "randomJunkKey"' })
                ])
            );
        });

        it('create subject valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/academics/subjects')
                .send({ name: 'Math Advanced', classId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57' });
            expect(res.status).toBe(200);
        });
    });

});
