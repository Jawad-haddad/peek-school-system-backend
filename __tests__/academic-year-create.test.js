const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');
const bcrypt = require('bcryptjs');

let adminToken;
let school;
const ts = Date.now();

beforeAll(async () => {
    const hash = await bcrypt.hash('Pass123!', 10);
    school = await prisma.school.create({ data: { name: `AY School ${ts}` } });

    const admin = await prisma.user.create({
        data: { 
            fullName: 'Admin AY', 
            email: `admin-ay-${ts}@test.com`, 
            password_hash: hash, 
            role: 'school_admin', 
            schoolId: school.id, 
            isActive: true, 
            emailVerified: true 
        }
    });

    const res = await request(app).post('/api/auth/login').send({ email: admin.email, password: 'Pass123!' });
    adminToken = res.body.data?.token || res.body.token;
});

afterAll(async () => {
    await prisma.academicYear.deleteMany({ where: { schoolId: school.id } });
    await prisma.user.deleteMany({ where: { schoolId: school.id } });
    await prisma.school.deleteMany({ where: { id: school.id } });
    await prisma.$disconnect();
});

describe('Academic Year Creation', () => {
    it('should create a valid academic year', async () => {
        const payload = {
            name: '2029-2030',
            startDate: '2029-09-01',
            endDate: '2030-06-30'
        };

        const res = await request(app)
            .post('/api/school/academic-years')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload);

        expect(res.status).toBe(201);
        expect(res.body.data.name).toBe('2029-2030');
    });

    it('should allow extra benign fields (passthrough)', async () => {
        const payload = {
            name: '2030-2031',
            startDate: '2030-09-01',
            endDate: '2031-06-30',
            someExtraFrontendField: 'hello'
        };

        const res = await request(app)
            .post('/api/school/academic-years')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload);

        expect(res.status).toBe(201);
    });

    it('should return 409 for duplicate academic year name in same school', async () => {
        const payload = {
            name: '2029-2030',
            startDate: '2029-09-01',
            endDate: '2030-06-30'
        };

        const res = await request(app)
            .post('/api/school/academic-years')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload);

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('DUPLICATE_ACADEMIC_YEAR');
    });
});
