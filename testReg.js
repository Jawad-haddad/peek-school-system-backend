const request = require('supertest');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');
const fs = require('fs');

async function run() {
    const postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
        .withDatabase('school_system')
        .withUsername('user')
        .withPassword('password')
        .start();

    process.env.DATABASE_URL = postgresContainer.getConnectionUri();
    process.env.PORT = '0';

    execSync('npx prisma db push --skip-generate', { env: process.env, stdio: 'inherit' });

    const app = require('./index');
    const prisma = require('./src/prismaClient');

    const superAdmin = await prisma.user.create({
        data: {
            fullName: 'Super Admin',
            email: `super.${Date.now()}@test.com`,
            role: 'super_admin',
            password_hash: await bcrypt.hash('pass', 10),
            isActive: true,
            emailVerified: true
        }
    });

    const saLogin = await request(app).post('/api/auth/login').send({ email: superAdmin.email, password: 'pass' });
    const saToken = saLogin.body.data.token;

    const onboardRes = await request(app)
        .post('/api/platform/onboard-school')
        .set('Authorization', `Bearer ${saToken}`)
        .send({
            school: { name: 'Test School', city: 'City' },
            admin: { fullName: 'Admin', email: `admin.${Date.now()}@test.com`, password: 'pass' },
            academicYear: { name: '2030-2031', startDate: '2030-01-01', endDate: '2030-12-31', isCurrent: true },
            classes: [{ name: 'Class 1A', defaultFee: 100 }]
        });

    const schoolId = onboardRes.body.data.schoolId;
    const classId = onboardRes.body.data.classIds[0];
    const adminEmail = onboardRes.body.data.adminEmail;

    const adminLogin = await request(app).post('/api/auth/login').send({ email: adminEmail, password: 'pass' });
    const adminToken = adminLogin.body.data.token;

    const payload = {
        fullName: 'Test Student',
        classId: classId,
        parentEmail: `parent.${Date.now()}@test.com`
    };

    const res = await request(app)
        .post('/api/school/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

    fs.writeFileSync('debug_regression.txt', `STATUS: ${res.status}\nBODY: ${JSON.stringify(res.body, null, 2)}`);

    await prisma.$disconnect();
    await postgresContainer.stop();
    process.exit(0);
}
run().catch(console.error);
