// __tests__/platform-onboarding.test.js
const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');

// The underlying environment requires users mapped prior to assigning RBAC contexts internally
// For tests without complex DB seeding, we mock the `authMiddleware` heavily, or mock `jwt.verify`

jest.mock('jsonwebtoken', () => ({
    verify: jest.fn().mockImplementation((token) => {
        if (token === 'super_admin_token') return { userId: '1' };
        if (token === 'teacher_token') return { userId: '2' };
        throw new Error('Invalid token');
    })
}));

// Mock prisma finding user to bypass real DB lookups for the auth middleware step:
const mockUserFindUnique = jest.fn();

beforeAll(() => {
    // Save original reference to restore later if needed, but mock findUnique broadly here
    prisma.user.findUnique = mockUserFindUnique;
});

afterAll(() => {
    jest.restoreAllMocks();
});

describe('POST /api/platform/onboard-school', () => {

    const validPayload = {
        school: { name: "Test Super School", city: "Test City", phone: "123456" },
        admin: { fullName: "Super Admin", email: "newsuperadmin@test.com", password: "StrongPassword1!" },
        academicYear: { name: "2026-2027", startDate: "2026-09-01", endDate: "2027-06-30", isCurrent: true },
        classes: [{ name: "Grade 1 - A", defaultFee: 200 }]
    };

    it('should return 401 if no token provided', async () => {
        const res = await request(app).post('/api/platform/onboard-school').send(validPayload);
        expect(res.statusCode).toBe(401);
    });

    it('should return 403 FORBIDDEN_ROLE if user lacks super_admin privileges', async () => {
        // Mock user being a normal teacher
        mockUserFindUnique.mockResolvedValueOnce({
            id: '2', role: 'teacher', isActive: true
        });

        const res = await request(app)
            .post('/api/platform/onboard-school')
            .set('Authorization', 'Bearer teacher_token')
            .send(validPayload);

        expect(res.statusCode).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('should reject invalid payloads early due to Zod validation', async () => {
        mockUserFindUnique.mockResolvedValueOnce({
            id: '1', role: 'super_admin', isActive: true
        });

        const badPayload = { ...validPayload };
        delete badPayload.admin.email; // break schema

        const res = await request(app)
            .post('/api/platform/onboard-school')
            .set('Authorization', 'Bearer super_admin_token')
            .send(badPayload);

        expect(res.statusCode).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    // End-to-end DB interactions skipped to avoid cross-contamination with prisma client states 
    // directly mutating the development database unintentionally while mocking `findUnique`.
    // Real integration tests will rely on standard execution scripts or isolated db schemas.

});
