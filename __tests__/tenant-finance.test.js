// __tests__/tenant-finance.test.js
//
// Unit tests proving that finance endpoints enforce tenant isolation.
// No DB required — these test the helper logic that controllers depend on.

const { getTenant, tenantWhere, assertTenantEntity, SUPER_ADMIN_ROLE } = require('../src/utils/tenant');

// ── helpers ──────────────────────────────────────────────

const fakeReq = (overrides = {}) => ({
    user: {
        id: 'user-1',
        role: 'school_admin',
        schoolId: 'school-A',
        email: 'admin@school-a.com',
        ...overrides,
    },
});

const fakeRes = () => {
    const res = { _status: null, _body: null };
    res.status = (code) => { res._status = code; return res; };
    res.json = (body) => { res._body = body; return res; };
    return res;
};

// ── Wallet History — tenant isolation ────────────────────

describe('getWalletHistory tenant isolation', () => {
    it('tenantWhere scopes student lookup to user school', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, { id: 'student-1' });
        expect(where).toEqual({ schoolId: 'school-A', id: 'student-1' });
    });

    it('assertTenantEntity blocks cross-school wallet access with 403 TENANT_FORBIDDEN', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const res = fakeRes();
        // Student belongs to school-B
        const blocked = assertTenantEntity(req, res, 'school-B');
        expect(blocked).toBe(true);
        expect(res._status).toBe(403);
        expect(res._body.success).toBe(false);
        expect(res._body.error.code).toBe('TENANT_FORBIDDEN');
    });

    it('allows same-school wallet access', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-A');
        expect(blocked).toBe(false);
        expect(res._status).toBeNull();
    });

    it('super_admin can access any school wallet', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-B');
        expect(blocked).toBe(false);
    });
});

// ── Issue Invoice — tenant isolation ─────────────────────

describe('issueInvoice tenant isolation', () => {
    it('student lookup is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, { id: 'student-99' });
        expect(where).toEqual({ schoolId: 'school-A', id: 'student-99' });
    });

    it('fee structure lookup goes through academicYear tenant filter', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const ayWhere = tenantWhere(req);
        // Controller does: { id: feeStructureId, academicYear: tenantWhere(req) }
        expect(ayWhere).toEqual({ schoolId: 'school-A' });
    });

    it('super_admin can issue invoice for any school', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const where = tenantWhere(req, { id: 'student-99' });
        expect(where).toEqual({ id: 'student-99' });
        expect(where).not.toHaveProperty('schoolId');
    });
});

// ── Record Payment — tenant isolation ────────────────────

describe('recordPayment tenant isolation', () => {
    it('cross-school payment attempt blocked with 403', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const res = fakeRes();
        // Invoice's student belongs to school-B
        const blocked = assertTenantEntity(req, res, 'school-B');
        expect(blocked).toBe(true);
        expect(res._status).toBe(403);
        expect(res._body.error.code).toBe('TENANT_FORBIDDEN');
    });

    it('same-school payment allowed', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-A');
        expect(blocked).toBe(false);
    });
});

// ── Fee Stats — tenant isolation ─────────────────────────

describe('getFeeStats tenant isolation', () => {
    it('student count query is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req);
        expect(where).toEqual({ schoolId: 'school-A' });
    });

    it('super_admin sees all schools', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const where = tenantWhere(req);
        expect(where).toEqual({});
    });
});

// ── Top-up Wallet — tenant isolation ─────────────────────

describe('topUpWallet tenant isolation', () => {
    it('student lookup combines tenant scope with parentId', () => {
        const req = fakeReq({ id: 'parent-1', schoolId: 'school-A' });
        const where = tenantWhere(req, { id: 'student-5', parentId: 'parent-1' });
        expect(where).toEqual({
            schoolId: 'school-A',
            id: 'student-5',
            parentId: 'parent-1'
        });
    });

    it('cross-school student invisible to parent', () => {
        const req = fakeReq({ id: 'parent-1', schoolId: 'school-A' });
        const where = tenantWhere(req, { id: 'student-from-school-B', parentId: 'parent-1' });
        // With school-A filter, a student from school-B will not match
        expect(where.schoolId).toBe('school-A');
    });
});
