// __tests__/error-codes-contract.test.js
// ────────────────────────────────────────────────────────
// Verifies the API returns canonical error codes defined in
// docs/API_ERROR_CODES.md so they never drift silently.
// ────────────────────────────────────────────────────────

const request = require('supertest');
const app = require('../index');

// ── Helpers ──────────────────────────────────────
async function login(email) {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'password123' });
    return res;
}

let parentToken;

beforeAll(async () => {
    const pRes = await login('parent@peek.com');
    parentToken = pRes.body.data?.token ?? pRes.body.token;
});

// ══════════════════════════════════════════════════
// Error Code Contract Tests
// ══════════════════════════════════════════════════
describe('Error Code Contract', () => {

    it('Parent accessing admin-only route returns 403 FORBIDDEN_ROLE', async () => {
        const res = await request(app)
            .post('/api/school/students')
            .set('Authorization', `Bearer ${parentToken}`)
            .send({ fullName: 'Test', classId: '00000000-0000-0000-0000-000000000000' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('Bad payload returns 400 VALIDATION_ERROR', async () => {
        // Login endpoint expects { email, password }; send empty body
        const res = await request(app)
            .post('/api/auth/login')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Invalid token returns 401 UNAUTHORIZED', async () => {
        const res = await request(app)
            .get('/api/school/reports/overview')
            .set('Authorization', 'Bearer totally.invalid.token');

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
});
