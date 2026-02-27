// __tests__/tenant.test.js

const { getTenant, tenantWhere, assertTenantEntity, SUPER_ADMIN_ROLE } = require('../src/utils/tenant');

// ── helpers ──────────────────────────────────────────────

/** Build a fake req with the given user fields */
const fakeReq = (overrides = {}) => ({
    user: {
        id: 'user-1',
        role: 'school_admin',
        schoolId: 'school-A',
        ...overrides,
    },
});

/** Capture what fail() sends without an actual Express response */
const fakeRes = () => {
    const res = { _status: null, _body: null };
    res.status = (code) => { res._status = code; return res; };
    res.json = (body) => { res._body = body; return res; };
    return res;
};

// ── getTenant ────────────────────────────────────────────

describe('getTenant', () => {
    it('extracts tenant context for a normal user', () => {
        const req = fakeReq();
        const t = getTenant(req);
        expect(t).toEqual({
            schoolId: 'school-A',
            role: 'school_admin',
            userId: 'user-1',
            isSuperAdmin: false,
        });
    });

    it('identifies super_admin correctly', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE });
        const t = getTenant(req);
        expect(t.isSuperAdmin).toBe(true);
    });
});

// ── tenantWhere ──────────────────────────────────────────

describe('tenantWhere', () => {
    it('adds schoolId for non-super-admin', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, { id: 'student-1' });
        expect(where).toEqual({ schoolId: 'school-A', id: 'student-1' });
    });

    it('omits schoolId for super_admin', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const where = tenantWhere(req, { id: 'student-1' });
        expect(where).toEqual({ id: 'student-1' });
        expect(where).not.toHaveProperty('schoolId');
    });

    it('returns only extraWhere when super_admin has a schoolId set', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: 'school-X' });
        const where = tenantWhere(req, { id: 'student-1' });
        expect(where).toEqual({ id: 'student-1' });
    });
});

// ── assertTenantEntity ───────────────────────────────────

describe('assertTenantEntity', () => {
    it('returns false (allowed) when entity school matches user school', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-A');
        expect(blocked).toBe(false);
        expect(res._status).toBeNull(); // no response sent
    });

    it('returns true (blocked) with 403 TENANT_FORBIDDEN for cross-school access', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-B');
        expect(blocked).toBe(true);
        expect(res._status).toBe(403);
        expect(res._body).toEqual({
            success: false,
            error: {
                message: 'Access denied: resource belongs to another school.',
                code: 'TENANT_FORBIDDEN',
            },
        });
    });

    it('allows super_admin to access any school', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: 'school-A' });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-B');
        expect(blocked).toBe(false);
        expect(res._status).toBeNull();
    });

    it('allows super_admin even with null schoolId', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-Z');
        expect(blocked).toBe(false);
    });
});
