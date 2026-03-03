// __tests__/observability.test.js
const request = require('supertest');
const app = require('../index');

describe('Observability & Security Headers', () => {

    it('should inject X-Request-Id into response headers', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toBe(200);
        expect(res.headers['x-request-id']).toBeDefined();

        // Ensure UUID structure roughly
        expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should disable x-powered-by header (Helmet)', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });

    describe('Strict Auth Rate Limiter', () => {
        it('should trigger 429 after limit is exceeded on login endpoint', async () => {
            // max in test environment is 5 requests per 1000ms

            for (let i = 0; i < 5; i++) {
                const res = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password' });
                expect(res.statusCode).not.toBe(429); // Usually 400 validation or 401 invalid credentials depending on test db
            }

            // Exceed the limit immediately
            const resThrottled = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password' });
            expect(resThrottled.statusCode).toBe(429);
            expect(resThrottled.body.success).toBe(false);
            expect(resThrottled.body.error.message).toContain('Too many attempts');
        });
    });
});
