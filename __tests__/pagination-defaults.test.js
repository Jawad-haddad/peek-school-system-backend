const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient'); // Assuming this exists

describe('Pagination Defaults', () => {
    let adminToken;

    beforeAll(async () => {
        // We need a valid token. Since we re-seeded the dev DB in previous tasks,
        // we'll try the new default admin credential, or fallback to super admin if necessary.
        // For testing we will just hit the login endpoint directly.

        let loginRes = await request(app)
            .post('/api/users/login')
            .send({ email: 'admin@peek.com', password: 'password123' });

        if (loginRes.statusCode !== 200) {
            // Fallback in case old seed is true
            loginRes = await request(app)
                .post('/api/users/login')
                .send({ email: 'principal@almustaqbal.com', password: 'principalpassword' });
        }

        // The response format from login depending if it uses ok() or not
        adminToken = loginRes.body?.data?.token || loginRes.body?.token;
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should apply safe pagination defaults (limit 50) when no params are given', async () => {
        const response = await request(app)
            .get('/api/school/classes')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        // Validates that response is an object with data array and meta object
        expect(response.body).toHaveProperty('success', true);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body).toHaveProperty('meta');
        expect(response.body.meta).toHaveProperty('limit', 50);
        expect(response.body.meta).toHaveProperty('page', 1);

        // Ensure that the array does not exceed standard limit
        expect(response.body.data.length).toBeLessThanOrEqual(50);
    });

    it('should clamp the max limit to 200 when limit=999 is passed', async () => {
        const response = await request(app)
            .get('/api/school/classes?limit=999')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.meta).toHaveProperty('limit', 200);
    });

    it('should reject non-integer or invalid pagination limits via validateQuery', async () => {
        const response = await request(app)
            .get('/api/school/classes?limit=abc')
            .set('Authorization', `Bearer ${adminToken}`);

        // Zod will fail coerce.number() because "abc" converts to NaN, failing the .int() check.
        // It should return 400 VALIDATION_ERROR
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
});
