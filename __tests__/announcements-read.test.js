const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');
const bcrypt = require('bcryptjs');

let adminToken, parentToken, otherParentToken, teacherToken;
let school1, school2;
let announcementSchool1;

beforeAll(async () => {
    school1 = await prisma.school.create({
        data: { name: `School 1 ${Date.now()}` }
    });
    school2 = await prisma.school.create({
        data: { name: `School 2 ${Date.now()}` }
    });

    const passwordHash = await bcrypt.hash('password123', 10);

    const adminUser = await prisma.user.create({
        data: {
            fullName: 'Admin S1',
            email: `admin-s1-${Date.now()}@test.com`,
            password_hash: passwordHash,
            role: 'school_admin',
            schoolId: school1.id,
            isActive: true,
            emailVerified: true
        }
    });

    const parentUser = await prisma.user.create({
        data: {
            fullName: 'Parent S1',
            email: `parent-s1-${Date.now()}@test.com`,
            password_hash: passwordHash,
            role: 'parent',
            schoolId: school1.id,
            isActive: true,
            emailVerified: true
        }
    });

    const teacherUser = await prisma.user.create({
        data: {
            fullName: 'Teacher S1',
            email: `teacher-s1-${Date.now()}@test.com`,
            password_hash: passwordHash,
            role: 'teacher',
            schoolId: school1.id,
            isActive: true,
            emailVerified: true
        }
    });

    const otherParentUser = await prisma.user.create({
        data: {
            fullName: 'Parent S2',
            email: `parent-s2-${Date.now()}@test.com`,
            password_hash: passwordHash,
            role: 'parent',
            schoolId: school2.id,
            isActive: true,
            emailVerified: true
        }
    });

    const getLoginToken = async (email) => {
        const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
        return res.body.data?.token || res.body.token;
    };

    adminToken = await getLoginToken(adminUser.email);
    parentToken = await getLoginToken(parentUser.email);
    teacherToken = await getLoginToken(teacherUser.email);
    otherParentToken = await getLoginToken(otherParentUser.email);

    announcementSchool1 = await prisma.announcement.create({
        data: {
            title: 'School 1 Announcement',
            content: 'Hello School 1',
            scope: 'SCHOOL',
            schoolId: school1.id
        }
    });
});

afterAll(async () => {
    await prisma.announcement.deleteMany({ where: { schoolId: { in: [school1.id, school2.id] } } });
    await prisma.user.deleteMany({ where: { schoolId: { in: [school1.id, school2.id] } } });
    await prisma.school.deleteMany({ where: { id: { in: [school1.id, school2.id] } } });
    await prisma.$disconnect();
});

describe('GET /api/communication/announcements', () => {
    it('Parent in school 1 can see the announcement', async () => {
        const res = await request(app)
            .get('/api/communication/announcements')
            .set('Authorization', `Bearer ${parentToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.some(a => a.id === announcementSchool1.id)).toBe(true);
    });

    it('Teacher in school 1 can see the announcement', async () => {
        const res = await request(app)
            .get('/api/communication/announcements')
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.some(a => a.id === announcementSchool1.id)).toBe(true);
    });

    it('Parent in school 2 CANNOT see school 1 announcement (Cross-Tenant block)', async () => {
        const res = await request(app)
            .get('/api/communication/announcements')
            .set('Authorization', `Bearer ${otherParentToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.some(a => a.id === announcementSchool1.id)).toBe(false);
    });

    it('Respects limit query parameter', async () => {
        await prisma.announcement.create({
            data: { title: 'A2', content: 'A2', scope: 'SCHOOL', schoolId: school1.id }
        });
        await prisma.announcement.create({
            data: { title: 'A3', content: 'A3', scope: 'SCHOOL', schoolId: school1.id }
        });

        const res = await request(app)
            .get('/api/communication/announcements?limit=2')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.length).toBe(2);
    });

    describe('Audience-aware filtering on read', () => {
        let annAll, annParents, annTeachers;

        beforeAll(async () => {
            // Clean existing announcements to isolate these tests
            await prisma.announcement.deleteMany({ where: { schoolId: school1.id } });

            annAll = await prisma.announcement.create({
                data: { title: 'For All', content: 'Everyone', scope: 'SCHOOL', audience: 'ALL', schoolId: school1.id }
            });
            annParents = await prisma.announcement.create({
                data: { title: 'For Parents', content: 'Parents only', scope: 'SCHOOL', audience: 'PARENTS_ONLY', schoolId: school1.id }
            });
            annTeachers = await prisma.announcement.create({
                data: { title: 'For Teachers', content: 'Teachers only', scope: 'SCHOOL', audience: 'TEACHERS_ONLY', schoolId: school1.id }
            });
        });

        it('Parent sees ALL + PARENTS_ONLY, not TEACHERS_ONLY', async () => {
            const res = await request(app)
                .get('/api/communication/announcements')
                .set('Authorization', `Bearer ${parentToken}`);

            expect(res.status).toBe(200);
            const ids = res.body.data.map(a => a.id);
            expect(ids).toContain(annAll.id);
            expect(ids).toContain(annParents.id);
            expect(ids).not.toContain(annTeachers.id);
        });

        it('Teacher sees ALL + TEACHERS_ONLY, not PARENTS_ONLY', async () => {
            const res = await request(app)
                .get('/api/communication/announcements')
                .set('Authorization', `Bearer ${teacherToken}`);

            expect(res.status).toBe(200);
            const ids = res.body.data.map(a => a.id);
            expect(ids).toContain(annAll.id);
            expect(ids).toContain(annTeachers.id);
            expect(ids).not.toContain(annParents.id);
        });

        it('Admin sees all broadcasts regardless of audience', async () => {
            const res = await request(app)
                .get('/api/communication/announcements')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            const ids = res.body.data.map(a => a.id);
            expect(ids).toContain(annAll.id);
            expect(ids).toContain(annParents.id);
            expect(ids).toContain(annTeachers.id);
        });
    });
});
