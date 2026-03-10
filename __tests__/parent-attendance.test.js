// __tests__/parent-attendance.test.js
// ────────────────────────────────────────────────────────
// Parent Attendance API tests
// Depends on seed data: parent@peek.com (owns "Leo Messi"), teacher@peek.com
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

let parentToken, teacherToken;
let parentUser;
let seedClassId, seedStudentId;

beforeAll(async () => {
    // Login parent — ok() envelope: { success, data: { token, user } }
    const pRes = await login('parent@peek.com');
    parentToken = pRes.body.data?.token ?? pRes.body.token;
    parentUser = pRes.body.data?.user ?? pRes.body.user;

    // Login teacher (needed to submit attendance)
    const tRes = await login('teacher@peek.com');
    teacherToken = tRes.body.data?.token ?? tRes.body.token;

    // Login admin to discover school data
    const aRes = await login('admin@peek.com');
    const adminUser = aRes.body.data?.user ?? aRes.body.user;

    // Discover seed class + student
    const cls = await prisma.class.findFirst({
        where: { academicYear: { schoolId: adminUser.schoolId } },
    });
    seedClassId = cls?.id;

    const enrollment = await prisma.studentEnrollment.findFirst({
        where: { classId: seedClassId },
    });
    seedStudentId = enrollment?.studentId;

    // Submit attendance records so there's data to read back
    const today = new Date().toISOString().slice(0, 10);
    await request(app)
        .post('/api/attendance/bulk')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
            classId: seedClassId,
            date: today,
            records: [
                { studentId: seedStudentId, status: 'present' },
            ],
        });
});

afterAll(async () => {
    await prisma.$disconnect();
});

// ══════════════════════════════════════════════════
// Parent Attendance API
// ══════════════════════════════════════════════════
describe('Parent Attendance API', () => {

    it('Parent can fetch own child attendance (200)', async () => {
        expect(seedStudentId).toBeDefined();

        const res = await request(app)
            .get(`/api/parent/attendance/${seedStudentId}`)
            .set('Authorization', `Bearer ${parentToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const { records, summary } = res.body.data;
        expect(Array.isArray(records)).toBe(true);
        expect(records.length).toBeGreaterThan(0);

        // Verify record shape
        const rec = records[0];
        expect(rec).toHaveProperty('id');
        expect(rec).toHaveProperty('date');
        expect(rec).toHaveProperty('status');

        // Verify summary shape
        expect(summary).toHaveProperty('present');
        expect(summary).toHaveProperty('absent');
        expect(summary).toHaveProperty('late');
        expect(summary).toHaveProperty('excused');
        expect(summary).toHaveProperty('totalDays');
        expect(summary.totalDays).toBe(records.length);
    });

    it('Parent cannot fetch another parent\'s child (403)', async () => {
        // Create a second parent + child that does NOT belong to our seed parent
        const bcrypt = require('bcryptjs');
        const passwordHash = await bcrypt.hash('password123', 10);

        // Find the school
        const school = await prisma.school.findFirst();

        const otherParent = await prisma.user.create({
            data: {
                fullName: 'Other Parent',
                email: `other-parent-${Date.now()}@test.com`,
                password_hash: passwordHash,
                role: 'parent',
                schoolId: school.id,
                emailVerified: true,
                isActive: true,
            },
        });

        const otherStudent = await prisma.student.create({
            data: {
                fullName: 'Other Child',
                schoolId: school.id,
                parentId: otherParent.id,
            },
        });

        // Our seed parent tries to access the other child → 403
        const res = await request(app)
            .get(`/api/parent/attendance/${otherStudent.id}`)
            .set('Authorization', `Bearer ${parentToken}`);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN_PARENT');

        // Cleanup
        await prisma.student.delete({ where: { id: otherStudent.id } });
        await prisma.user.delete({ where: { id: otherParent.id } });
    });

    it('Invalid studentId returns 404', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await request(app)
            .get(`/api/parent/attendance/${fakeId}`)
            .set('Authorization', `Bearer ${parentToken}`);

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });
});
