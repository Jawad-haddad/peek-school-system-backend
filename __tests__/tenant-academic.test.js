// __tests__/tenant-academic.test.js
//
// Unit tests proving that tenantWhere() and getTenant() correctly filter
// academic/attendance queries by school and block cross-school access.
// No DB required — these are pure-logic tests.

const { getTenant, tenantWhere, assertTenantEntity, SUPER_ADMIN_ROLE } = require('../src/utils/tenant');

// ── helpers ──────────────────────────────────────────────

const fakeReq = (overrides = {}) => ({
    user: {
        id: 'user-1',
        role: 'school_admin',
        schoolId: 'school-A',
        ...overrides,
    },
});

const fakeRes = () => {
    const res = { _status: null, _body: null };
    res.status = (code) => { res._status = code; return res; };
    res.json = (body) => { res._body = body; return res; };
    return res;
};

// ── Academic Year — tenantWhere ──────────────────────────

describe('Academic Year tenant isolation', () => {
    it('getAcademicYears: scopes query to user school', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req);
        expect(where).toEqual({ schoolId: 'school-A' });
    });

    it('getAcademicYears: super_admin sees all schools', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const where = tenantWhere(req);
        expect(where).toEqual({});
        expect(where).not.toHaveProperty('schoolId');
    });

    it('createAcademicYear: getTenant forces schoolId from user', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const { schoolId } = getTenant(req);
        expect(schoolId).toBe('school-A');
        // Even if client tries to pass schoolId: 'school-B' in body, we use getTenant
    });

    it('createAcademicYear: tenantWhere used for unsetting current year', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, { current: true });
        expect(where).toEqual({ schoolId: 'school-A', current: true });
    });
});

// ── Classes — tenantWhere ────────────────────────────────

describe('Class tenant isolation', () => {
    it('getAllClasses: admin branch scopes to tenant school', () => {
        const req = fakeReq({ schoolId: 'school-B' });
        const academicYearWhere = tenantWhere(req);
        // This is what goes into  where: { academicYear: tenantWhere(req) }
        expect(academicYearWhere).toEqual({ schoolId: 'school-B' });
    });

    it('createClass: academic year lookup is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-B' });
        const where = tenantWhere(req, { id: 'ay-123' });
        expect(where).toEqual({ schoolId: 'school-B', id: 'ay-123' });
    });

    it('createClass: super_admin can create in any school', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const where = tenantWhere(req, { id: 'ay-123' });
        expect(where).toEqual({ id: 'ay-123' });
    });
});

// ── Attendance — tenantWhere ─────────────────────────────

describe('Attendance tenant isolation', () => {
    it('submitClassAttendance: class lookup is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        // The controller does: where: { id: classId, academicYear: tenantWhere(req) }
        const ayWhere = tenantWhere(req);
        expect(ayWhere).toEqual({ schoolId: 'school-A' });
    });

    it('getClassAttendance: student query is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, {
            enrollments: { some: { classId: 'class-1' } }
        });
        expect(where).toEqual({
            schoolId: 'school-A',
            enrollments: { some: { classId: 'class-1' } }
        });
    });

    it('getClassAttendance: super_admin bypasses school filter', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const where = tenantWhere(req, {
            enrollments: { some: { classId: 'class-1' } }
        });
        expect(where).toEqual({
            enrollments: { some: { classId: 'class-1' } }
        });
        expect(where).not.toHaveProperty('schoolId');
    });
});

// ── Cross-school mutation guard ──────────────────────────

describe('Cross-school mutation blocked', () => {
    it('school_admin from school-A trying to touch school-B entity → 403', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-B');
        expect(blocked).toBe(true);
        expect(res._status).toBe(403);
        expect(res._body.success).toBe(false);
        expect(res._body.error.code).toBe('TENANT_FORBIDDEN');
    });

    it('school_admin accessing own school → allowed', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-A');
        expect(blocked).toBe(false);
        expect(res._status).toBeNull();
    });

    it('super_admin accessing school-B → allowed', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const res = fakeRes();
        const blocked = assertTenantEntity(req, res, 'school-B');
        expect(blocked).toBe(false);
    });
});
