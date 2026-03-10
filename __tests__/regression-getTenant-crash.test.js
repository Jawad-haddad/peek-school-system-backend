// __tests__/regression-getTenant-crash.test.js
// Regression: GET /api/school/classes crashed with ReferenceError: getTenant is not defined

const request = require('supertest');
const app = require('../index');

async function login(email) {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'password123' });
    return res;
}

let adminToken;

beforeAll(async () => {
    const res = await login('admin@peek.com');
    adminToken = res.body.data?.token ?? res.body.token;
});

describe('Regression: getTenant crash on classes fetch', () => {
    it('GET /api/school/classes returns 200 (not crash)', async () => {
        const res = await request(app)
            .get('/api/school/classes')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
