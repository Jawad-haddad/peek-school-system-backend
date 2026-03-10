const request = require('supertest');
const app = require('./index');
const prisma = require('./src/prismaClient');
const fs = require('fs');

async function run() {
    const admin = await prisma.user.findFirst({ where: { role: 'school_admin' } });
    if (!admin) { fs.writeFileSync('debug_404.txt', 'no admin'); return; }

    const loginRes = await request(app).post('/api/auth/login').send({ email: admin.email, password: 'password123' });
    const token = loginRes.body.data ? loginRes.body.data.token : loginRes.body.token;

    const res = await request(app).post('/api/school/students').set('Authorization', 'Bearer ' + token).send({
        fullName: 'New Student',
        classId: 'dummy-uuid-1234-abcd',
        parentEmail: 'parent@test.com'
    });

    fs.writeFileSync('debug_404.txt', `STATUS: ${res.status}\nBODY: ${JSON.stringify(res.body)}`);
    process.exit(0);
}
run();
