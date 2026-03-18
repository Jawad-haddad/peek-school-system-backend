// __tests__/broadcast-audience.test.js
const request = require('supertest');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

let app, prisma, postgresContainer;
let superAdminToken, schoolAdminToken;
let schoolId;
const ts = Date.now();

jest.setTimeout(60000);

beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
        .withDatabase('school_system').withUsername('user').withPassword('password').start();
    process.env.DATABASE_URL = postgresContainer.getConnectionUri();
    process.env.PORT = '0';
    execSync('npx prisma db push --skip-generate', { env: process.env, stdio: 'inherit' });

    app = require('../index');
    prisma = require('../src/prismaClient');

    // Seed super_admin
    const hash = await bcrypt.hash('Pass123!', 10);
    await prisma.user.create({
        data: { fullName: 'SA', email: `sa.bc.${ts}@test.com`, role: 'super_admin', password_hash: hash, isActive: true, emailVerified: true }
    });

    // Login super admin
    const saRes = await request(app).post('/api/auth/login').send({ email: `sa.bc.${ts}@test.com`, password: 'Pass123!' });
    superAdminToken = saRes.body.data.token;

    // Onboard a school with an admin
    const onRes = await request(app).post('/api/platform/onboard-school')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
            school: { name: `BC School ${ts}`, city: 'City' },
            admin: { fullName: 'BC Admin', email: `bcadmin.${ts}@test.com`, password: 'Pass123!' },
            academicYear: { name: '2030-2031', startDate: '2030-09-01', endDate: '2031-06-30', isCurrent: true },
            classes: [{ name: 'Class 1A', defaultFee: 100 }]
        });
    schoolId = onRes.body.data.schoolId;

    // Login school admin
    const adRes = await request(app).post('/api/auth/login').send({ email: `bcadmin.${ts}@test.com`, password: 'Pass123!' });
    schoolAdminToken = adRes.body.data.token;

    // Create teacher user
    await request(app).post('/api/academics/teachers')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .send({ fullName: 'BC Teacher', email: `bcteacher.${ts}@test.com`, password: 'Pass123!' });

    // Create a student (auto-creates parent)
    await request(app).post('/api/school/students')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .send({ fullName: 'BC Student', classId: onRes.body.data.classIds[0] });
});

afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (postgresContainer) await postgresContainer.stop();
});

describe('Broadcast Audience Targeting', () => {

    it('invalid audience returns 400 VALIDATION_ERROR', async () => {
        const res = await request(app).post('/api/communication/broadcast')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({ title: 'Test', content: 'Body', audience: 'INVALID' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('PARENTS_ONLY → only parent recipients', async () => {
        const res = await request(app).post('/api/communication/broadcast')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({ title: 'Parent Notice', content: 'For parents only', audience: 'PARENTS_ONLY' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.audience).toBe('PARENTS_ONLY');
        expect(res.body.data.recipientCount).toBeGreaterThan(0);

        // Verify only parents exist in recipient scope
        const parents = await prisma.user.findMany({ where: { schoolId, role: 'parent', isActive: true } });
        expect(res.body.data.recipientCount).toBe(parents.length);
    });

    it('TEACHERS_ONLY → only teacher recipients', async () => {
        const res = await request(app).post('/api/communication/broadcast')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({ title: 'Teacher Notice', content: 'For teachers only', audience: 'TEACHERS_ONLY' });
        expect(res.status).toBe(201);
        expect(res.body.data.audience).toBe('TEACHERS_ONLY');

        const teachers = await prisma.user.findMany({ where: { schoolId, role: 'teacher', isActive: true } });
        expect(res.body.data.recipientCount).toBe(teachers.length);
    });

    it('ALL → all active school users', async () => {
        const res = await request(app).post('/api/communication/broadcast')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({ title: 'All Notice', content: 'For everyone', audience: 'ALL' });
        expect(res.status).toBe(201);
        expect(res.body.data.audience).toBe('ALL');

        const allUsers = await prisma.user.findMany({ where: { schoolId, isActive: true } });
        expect(res.body.data.recipientCount).toBe(allUsers.length);
    });

    it('recipients are scoped to the correct school', async () => {
        // Create a second school's user directly
        const hash = await bcrypt.hash('Pass123!', 10);
        const otherSchool = await prisma.school.create({ data: { name: `Other School ${ts}` } });
        await prisma.user.create({
            data: { fullName: 'Other Parent', email: `other.${ts}@test.com`, role: 'parent', password_hash: hash, isActive: true, emailVerified: true, schoolId: otherSchool.id }
        });

        const res = await request(app).post('/api/communication/broadcast')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({ title: 'Scoped', content: 'School-only', audience: 'PARENTS_ONLY' });

        // recipientCount must only include parents in our school, not the other school
        const ourParents = await prisma.user.findMany({ where: { schoolId, role: 'parent', isActive: true } });
        expect(res.body.data.recipientCount).toBe(ourParents.length);
    });

    describe('Legacy Payload Support ({ message, scope })', () => {
        it('maps scope: SCHOOL -> ALL and uses message as content', async () => {
             const res = await request(app).post('/api/communication/broadcast')
                .set('Authorization', `Bearer ${schoolAdminToken}`)
                .send({ title: 'Legacy All', message: 'Old way', scope: 'SCHOOL' });
            expect(res.status).toBe(201);
            expect(res.body.data.audience).toBe('ALL');
            expect(res.body.data.announcement.content).toBe('Old way');
            const allUsers = await prisma.user.findMany({ where: { schoolId, isActive: true } });
            expect(res.body.data.recipientCount).toBe(allUsers.length);
        });

        it('maps scope: PARENTS_ONLY and TEACHERS_ONLY correctly', async () => {
            let res = await request(app).post('/api/communication/broadcast')
               .set('Authorization', `Bearer ${schoolAdminToken}`)
               .send({ title: 'Legacy Parents', message: 'Old way parents', scope: 'PARENTS_ONLY' });
           expect(res.status).toBe(201);
           expect(res.body.data.audience).toBe('PARENTS_ONLY');

            res = await request(app).post('/api/communication/broadcast')
               .set('Authorization', `Bearer ${schoolAdminToken}`)
               .send({ title: 'Legacy Teachers', message: 'Old way teachers', scope: 'TEACHERS_ONLY' });
           expect(res.status).toBe(201);
           expect(res.body.data.audience).toBe('TEACHERS_ONLY');
       });
    });
});
