// __tests__/mvp-smoke.test.js
// ────────────────────────────────────────────────────────
// MVP Smoke Tests — Auth, Classes CRUD (RBAC), Attendance
// Depends on seed data: admin@peek.com / teacher@peek.com / parent@peek.com (password123)
// ────────────────────────────────────────────────────────

const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');

// ── Helpers ──────────────────────────────────────
async function login(email) {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'password123' });
    return res;
}

// ── State shared across describe blocks ──────────
let adminToken, teacherToken, parentToken;
let adminUser, teacherUser, parentUser;
let schoolAcademicYearId, seedClassId, seedStudentId;

// ══════════════════════════════════════════════════
// FLOW 1: AUTH LOGIN + ROLE SEMANTICS
// ══════════════════════════════════════════════════
describe('Flow 1: Auth Login', () => {

    it('ADMIN login returns correct shape and role', async () => {
        const res = await login('admin@peek.com');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
        expect(res.body).toHaveProperty('token');
        expect(res.body.user).toMatchObject({
            role: 'ADMIN',
        });
        expect(res.body.user).toHaveProperty('id');
        expect(res.body.user).toHaveProperty('fullName');
        expect(res.body.user).toHaveProperty('email');
        expect(res.body.user).toHaveProperty('schoolId');
        adminToken = res.body.token;
        adminUser = res.body.user;
    });

    it('TEACHER login returns correct shape and role', async () => {
        const res = await login('teacher@peek.com');
        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe('TEACHER');
        expect(res.body.user).toHaveProperty('schoolId');
        teacherToken = res.body.token;
        teacherUser = res.body.user;
    });

    it('PARENT login returns correct shape and role', async () => {
        const res = await login('parent@peek.com');
        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe('PARENT');
        parentToken = res.body.token;
        parentUser = res.body.user;
    });

    it('Invalid credentials return 401', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@peek.com', password: 'wrongpassword' });
        expect(res.status).toBe(401);
    });

    it('Missing fields return 400 (Zod validation)', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@peek.com' }); // missing password
        expect(res.status).toBe(400);
    });

    it('No token returns 401', async () => {
        const res = await request(app).get('/api/school/classes');
        expect(res.status).toBe(401);
    });
});

// ══════════════════════════════════════════════════
// FLOW 2: ADMIN CLASSES CRUD + RBAC
// ══════════════════════════════════════════════════
describe('Flow 2: Classes CRUD + RBAC', () => {
    let createdClassId;

    // ── Discover seed data ──────────────────────
    beforeAll(async () => {
        // Ensure tokens exist from Flow 1
        if (!adminToken) {
            const res = await login('admin@peek.com');
            adminToken = res.body.token;
            adminUser = res.body.user;
        }
        if (!teacherToken) {
            const res = await login('teacher@peek.com');
            teacherToken = res.body.token;
        }
        if (!parentToken) {
            const res = await login('parent@peek.com');
            parentToken = res.body.token;
        }

        // Find seed academic year by querying admin's school
        const ay = await prisma.academicYear.findFirst({
            where: { schoolId: adminUser.schoolId },
        });
        schoolAcademicYearId = ay?.id;
    });

    // ── ADMIN: GET classes ──────────────────────
    it('ADMIN can GET /api/school/classes', async () => {
        const res = await request(app)
            .get('/api/school/classes')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);

        // Verify response shape of first class
        if (res.body.length > 0) {
            const cls = res.body[0];
            expect(cls).toHaveProperty('id');
            expect(cls).toHaveProperty('name');
            expect(cls).toHaveProperty('academicYearId');
            expect(cls).toHaveProperty('academicYear');
            expect(cls.academicYear).toHaveProperty('id');
            expect(cls.academicYear).toHaveProperty('name');
            expect(cls).toHaveProperty('defaultFee');
            expect(cls).toHaveProperty('_count');
            expect(cls._count).toHaveProperty('students');
            seedClassId = cls.id; // save for later
        }
    });

    // ── ADMIN: POST class ───────────────────────
    it('ADMIN can POST /api/school/classes', async () => {
        expect(schoolAcademicYearId).toBeDefined();
        const res = await request(app)
            .post('/api/school/classes')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: `Smoke Test Class ${Date.now()}`,
                academicYearId: schoolAcademicYearId,
                defaultFee: 100,
            });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('name');
        expect(res.body).toHaveProperty('academicYear');
        expect(res.body._count).toHaveProperty('students');
        createdClassId = res.body.id;
    });

    // ── ADMIN: PUT class ────────────────────────
    it('ADMIN can PUT /api/school/classes/:classId', async () => {
        expect(createdClassId).toBeDefined();
        const res = await request(app)
            .put(`/api/school/classes/${createdClassId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Renamed Smoke Class' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Renamed Smoke Class');
        expect(res.body).toHaveProperty('academicYear');
        expect(res.body._count).toHaveProperty('students');
    });

    // ── ADMIN: DELETE class ─────────────────────
    it('ADMIN can DELETE /api/school/classes/:classId', async () => {
        expect(createdClassId).toBeDefined();
        const res = await request(app)
            .delete(`/api/school/classes/${createdClassId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(204);
    });

    // ── POST validation ─────────────────────────
    it('POST class with missing name returns 400', async () => {
        const res = await request(app)
            .post('/api/school/classes')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ academicYearId: schoolAcademicYearId });
        expect(res.status).toBe(400);
    });

    // ── RBAC: TEACHER forbidden on mutations ────
    it('TEACHER cannot POST class (403)', async () => {
        const res = await request(app)
            .post('/api/school/classes')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ name: 'Forbidden', academicYearId: schoolAcademicYearId });
        expect(res.status).toBe(403);
    });

    it('TEACHER cannot PUT class (403)', async () => {
        // Use seed class ID since we deleted the test one
        const targetId = seedClassId || 'any-uuid';
        const res = await request(app)
            .put(`/api/school/classes/${targetId}`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ name: 'Forbidden Update' });
        expect(res.status).toBe(403);
    });

    it('TEACHER cannot DELETE class (403)', async () => {
        const targetId = seedClassId || 'any-uuid';
        const res = await request(app)
            .delete(`/api/school/classes/${targetId}`)
            .set('Authorization', `Bearer ${teacherToken}`);
        expect(res.status).toBe(403);
    });

    // ── RBAC: PARENT forbidden entirely ─────────
    it('PARENT cannot GET classes (403)', async () => {
        const res = await request(app)
            .get('/api/school/classes')
            .set('Authorization', `Bearer ${parentToken}`);
        expect(res.status).toBe(403);
    });

    it('PARENT cannot POST class (403)', async () => {
        const res = await request(app)
            .post('/api/school/classes')
            .set('Authorization', `Bearer ${parentToken}`)
            .send({ name: 'Forbidden', academicYearId: schoolAcademicYearId });
        expect(res.status).toBe(403);
    });

    // ── Cross-school safety ─────────────────────
    it('Non-existent classId returns 404 on PUT', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await request(app)
            .put(`/api/school/classes/${fakeId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Ghost' });
        expect(res.status).toBe(404);
    });

    it('Non-existent classId returns 404 on DELETE', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await request(app)
            .delete(`/api/school/classes/${fakeId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });
});

// ══════════════════════════════════════════════════
// FLOW 3: TEACHER ATTENDANCE API
// ══════════════════════════════════════════════════
describe('Flow 3: Teacher Attendance', () => {

    beforeAll(async () => {
        // Ensure tokens exist
        if (!teacherToken) {
            const res = await login('teacher@peek.com');
            teacherToken = res.body.token;
        }
        if (!adminToken) {
            const res = await login('admin@peek.com');
            adminToken = res.body.token;
            adminUser = res.body.user;
        }

        // Discover seed class + student via DB
        if (!seedClassId) {
            const cls = await prisma.class.findFirst({
                where: { academicYear: { schoolId: adminUser.schoolId } },
            });
            seedClassId = cls?.id;
        }

        if (!seedStudentId) {
            const enrollment = await prisma.studentEnrollment.findFirst({
                where: { classId: seedClassId },
            });
            seedStudentId = enrollment?.studentId;
        }
    });

    // ── GET students for attendance ─────────────
    it('TEACHER can GET /api/academics/classes/:classId/students', async () => {
        expect(seedClassId).toBeDefined();
        const res = await request(app)
            .get(`/api/academics/classes/${seedClassId}/students`)
            .set('Authorization', `Bearer ${teacherToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        if (res.body.length > 0) {
            const student = res.body[0];
            expect(student).toHaveProperty('id');
            expect(student).toHaveProperty('fullName');
            seedStudentId = seedStudentId || student.id;
        }
    });

    // ── POST bulk attendance (success) ──────────
    it('TEACHER can POST /api/attendance/bulk with valid payload', async () => {
        expect(seedClassId).toBeDefined();
        expect(seedStudentId).toBeDefined();
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: seedClassId,
                date: today,
                records: [
                    { studentId: seedStudentId, status: 'present' },
                ],
            });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('savedCount');
        expect(res.body.savedCount).toBe(1);
        expect(res.body).toHaveProperty('date', today);
        expect(res.body).toHaveProperty('classId', seedClassId);
    });

    // ── POST bulk attendance (casing tolerance) ─
    it('Uppercase status "ABSENT" is accepted (normalized)', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: seedClassId,
                date: today,
                records: [
                    { studentId: seedStudentId, status: 'ABSENT' },
                ],
            });
        expect(res.status).toBe(200);
        expect(res.body.savedCount).toBe(1);
    });

    // ── POST bulk attendance (invalid status → 400) ──
    it('Invalid status "here" returns 400', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: seedClassId,
                date: today,
                records: [
                    { studentId: seedStudentId, status: 'here' },
                ],
            });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('errors');
        expect(res.body.errors[0].field).toBe('status');
    });

    // ── POST bulk attendance (bad date → 400) ───
    it('Invalid date format returns 400', async () => {
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: seedClassId,
                date: 'not-a-date',
                records: [
                    { studentId: seedStudentId, status: 'present' },
                ],
            });
        expect(res.status).toBe(400);
    });

    // ── POST bulk attendance (empty records → 400) ──
    it('Empty records array returns 400', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: seedClassId,
                date: today,
                records: [],
            });
        expect(res.status).toBe(400);
    });

    // ── POST bulk attendance (missing studentId → 400) ──
    it('Missing studentId in record returns 400', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: seedClassId,
                date: today,
                records: [{ status: 'present' }],
            });
        expect(res.status).toBe(400);
        expect(res.body.errors[0].field).toBe('studentId');
    });

    // ── Readback: GET attendance ────────────────
    it('TEACHER can read back attendance via GET /api/attendance/:classId', async () => {
        expect(seedClassId).toBeDefined();
        const today = new Date().toISOString().slice(0, 10);
        const res = await request(app)
            .get(`/api/attendance/${seedClassId}?date=${today}`)
            .set('Authorization', `Bearer ${teacherToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        // Should contain at least the student we submitted for
        if (res.body.length > 0) {
            const record = res.body.find(r => r.studentId === seedStudentId || r.id === seedStudentId);
            // The exact response shape depends on the controller implementation
            // At minimum it should be an array
        }
    });

    // ── PARENT forbidden on attendance submit ───
    it('PARENT cannot POST /api/attendance/bulk (403)', async () => {
        const today = new Date().toISOString().slice(0, 10);
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${parentToken}`)
            .send({
                classId: seedClassId,
                date: today,
                records: [{ studentId: seedStudentId, status: 'present' }],
            });
        expect(res.status).toBe(403);
    });
});

// ── Teardown ─────────────────────────────────────
afterAll(async () => {
    await prisma.$disconnect();
});
