// __tests__/auth.test.js
const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');
const admin = require('firebase-admin');

describe('Authentication Endpoints', () => {
    let createdUserId;

    afterAll(async () => {
        if (createdUserId) {
            await prisma.user.delete({ where: { id: createdUserId } }).catch(e => { });
        }
    });

    describe('POST /api/users/login', () => {
        it('should fail to log in with incorrect credentials', async () => {
            const response = await request(app)
                .post('/api/users/login')
                .send({ email: 'jawad.parent@email.com', password: 'wrongpassword' });
            expect(response.statusCode).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toHaveProperty('message');
        });

        it('should log in successfully with correct credentials', async () => {
            const response = await request(app)
                .post('/api/users/login')
                .send({ email: 'jawad.parent@email.com', password: 'parentpassword' });
            expect(response.statusCode).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('token');
        });
    });

    describe('POST /api/users/register', () => {
        it('should successfully register a new user', async () => {
            const uniqueEmail = `testuser-${Date.now()}@example.com`;
            const response = await request(app)
                .post('/api/users/register')
                .send({ fullName: "Test User", email: uniqueEmail, password: "password123", role: "parent" });
            expect(response.statusCode).toBe(201);
            expect(response.body.success).toBe(true);
            createdUserId = response.body.data.user.id;
        });

        it('should fail to register a user with an existing email', async () => {
            const response = await request(app)
                .post('/api/users/register')
                .send({ fullName: "Another User", email: 'jawad.parent@email.com', password: "password123", role: "parent" });
            expect(response.statusCode).toBe(409);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toHaveProperty('message');
        });
    });
});

afterAll(async () => {
    await prisma.$disconnect();
    if (admin.apps.length) {
        await Promise.all(admin.apps.map(app => app.delete()));
    }
});