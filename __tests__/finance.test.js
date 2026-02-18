// __tests__/finance.test.js
const request = require('supertest');
const app = require('../index');
const { getAuthToken } = require('./helpers');
const prisma = require('../src/prismaClient');
const admin = require('firebase-admin');

describe('Finance & POS Modules', () => {
    let parentToken;
    let adminToken;
    let studentId;
    let sandwichId;

    beforeAll(async () => {
        parentToken = await getAuthToken('jawad.parent@email.com', 'parentpassword');
        adminToken = await getAuthToken('principal@almustaqbal.com', 'principalpassword');
        const student = await prisma.student.findFirst({ where: { fullName: "Omar Haddad" } });
        studentId = student.id;
        const sandwich = await prisma.canteenItem.findFirst({ where: { name: "Chicken Sandwich" } });
        sandwichId = sandwich.id;
    });

    it('should allow a parent to top up their child wallet', async () => {
        const response = await request(app)
            .post('/api/finance/wallet/topup')
            .set('Authorization', `Bearer ${parentToken}`)
            .send({ studentId: studentId, amount: 50 });

        expect(response.statusCode).toBe(200);
    });

    it('should allow an admin to create a POS order for a student', async () => {
        await request(app)
            .post('/api/finance/wallet/topup')
            .set('Authorization', `Bearer ${parentToken}`)
            .send({ studentId: studentId, amount: 10 });

        const response = await request(app)
            .post('/api/pos/orders')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                studentId: studentId,
                itemIds: [{ id: sandwichId, quantity: 1 }]
            });

        expect(response.statusCode).toBe(201);
    });
});

afterAll(async () => {
    await prisma.$disconnect();
    if (admin.apps.length) {
        await Promise.all(admin.apps.map(app => app.delete()));
    }
});