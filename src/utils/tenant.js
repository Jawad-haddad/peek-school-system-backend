// src/utils/tenant.js

const { fail } = require('./response');

const SUPER_ADMIN_ROLE = 'super_admin';

/**
 * Extract tenant context from the authenticated request.
 * @param {import('express').Request} req
 * @returns {{ schoolId: string|null, role: string, userId: string, isSuperAdmin: boolean }}
 */
const getTenant = (req) => {
    const { id: userId, role, schoolId } = req.user;
    return {
        schoolId: schoolId || null,
        role,
        userId,
        isSuperAdmin: role === SUPER_ADMIN_ROLE,
    };
};

/**
 * Build a Prisma `where` clause that enforces school-level isolation.
 * Super admins bypass the school filter.
 *
 * @param {import('express').Request} req
 * @param {object} [extraWhere={}] — additional conditions to merge
 * @returns {object} Prisma-compatible where clause
 */
const tenantWhere = (req, extraWhere = {}) => {
    const { isSuperAdmin, schoolId } = getTenant(req);
    if (isSuperAdmin) return { ...extraWhere };
    return { schoolId, ...extraWhere };
};

/**
 * Assert that the given entity belongs to the caller's school.
 * Super admins are always allowed. Non-super-admin users whose schoolId
 * does not match the entity's schoolId receive a 403.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} entitySchoolId — the schoolId on the entity being accessed
 * @returns {boolean} true if access is forbidden (response already sent), false if allowed
 */
const assertTenantEntity = (req, res, entitySchoolId) => {
    const { isSuperAdmin, schoolId } = getTenant(req);
    if (isSuperAdmin) return false; // allowed
    if (entitySchoolId !== schoolId) {
        fail(res, 403, 'Access denied: resource belongs to another school.', 'TENANT_FORBIDDEN');
        return true; // blocked — caller should return early
    }
    return false; // allowed
};

module.exports = { getTenant, tenantWhere, assertTenantEntity, SUPER_ADMIN_ROLE };
