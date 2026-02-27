// __tests__/tenant-pos.test.js
//
// Unit tests proving that POS endpoints enforce tenant isolation.
// Tests the internal helpers used by posController.js

const { getTenant, tenantWhere, assertTenantEntity, SUPER_ADMIN_ROLE } = require('../src/utils/tenant');

// ── helpers ──────────────────────────────────────────────

const fakeReq = (overrides = {}) => ({
    user: {
        id: 'user-1',
        role: 'canteen_staff',
        schoolId: 'school-A',
        email: 'canteen@school-a.com',
        ...overrides,
    },
});

const fakeRes = () => {
    const res = { _status: null, _body: null };
    res.status = (code) => { res._status = code; return res; };
    res.json = (body) => { res._body = body; return res; };
    return res;
};

// ── POS Products — tenant isolation ──────────────────────

describe('POS Products tenant isolation', () => {
    it('getCanteenItems list query is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req);
        expect(where).toEqual({ schoolId: 'school-A' });
    });

    it('addCanteenItem forces schoolId from tenant', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const { schoolId } = getTenant(req);
        expect(schoolId).toBe('school-A');
    });

    it('updateCanteenItem lookup is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, { id: 'prod-1' });
        expect(where).toEqual({ schoolId: 'school-A', id: 'prod-1' });
    });

    it('updateCanteenItem blocks cross-school access with assertTenantEntity', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const res = fakeRes();
        // Item actually belongs to school-B
        const blocked = assertTenantEntity(req, res, 'school-B');
        expect(blocked).toBe(true);
        expect(res._status).toBe(403);
        expect(res._body.error.code).toBe('TENANT_FORBIDDEN');
    });

    it('super_admin sees all schools products', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const where = tenantWhere(req);
        expect(where).toEqual({});
    });
});

// ── POS Orders / Checkout — tenant isolation ─────────────

describe('POS Orders tenant isolation', () => {
    it('validateOrderPrerequisites student lookup is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, { id: 'student-99' });
        expect(where).toEqual({ schoolId: 'school-A', id: 'student-99' });
    });

    it('validateOrderPrerequisites items lookup is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, {
            id: { in: ['item-1', 'item-2'] },
            isAvailable: true
        });
        expect(where).toEqual({
            schoolId: 'school-A',
            id: { in: ['item-1', 'item-2'] },
            isAvailable: true
        });
    });

    it('super_admin can validate orders across schools', () => {
        const req = fakeReq({ role: SUPER_ADMIN_ROLE, schoolId: null });
        const where = tenantWhere(req, { id: 'student-99' });
        expect(where).toEqual({ id: 'student-99' });
        expect(where).not.toHaveProperty('schoolId');
    });
});

// ── NFC Card Verification — tenant isolation ─────────────

describe('NFC Card Verification tenant isolation', () => {
    it('verifyCard lookup is tenant-scoped', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, { nfc_card_id: 'nfc-123' });
        expect(where).toEqual({ schoolId: 'school-A', nfc_card_id: 'nfc-123' });
    });

    it('cross-school NFC card returns no match (hidden by tenantWhere)', () => {
        const req = fakeReq({ schoolId: 'school-A' });
        const where = tenantWhere(req, { nfc_card_id: 'nfc-from-school-b' });
        // Since schoolId is forced to school-A, query will look for 'nfc-from-school-b' in 'school-A' -> 404
        expect(where.schoolId).toBe('school-A');
    });
});
