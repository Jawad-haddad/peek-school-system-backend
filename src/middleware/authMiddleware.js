// src/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');
const logger = require('../config/logger');
const { fail } = require('../utils/response');

const authMiddleware = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, email: true, fullName: true, role: true, schoolId: true, isActive: true }
            });

            // Note: RBAC/authorization natively relies on `req.user.role` hydrated securely 
            // directly from the live DB record using standard `select`, ignoring the JWT role payload. 
            // Passwords, 2FA tokens, etc., are explicitly excluded from this payload format.
            if (!req.user || !req.user.isActive) {
                logger.warn({ userId: decoded.userId }, "Auth Middleware: User not found or is inactive.");
                return fail(res, 401, 'User not found or disabled.', 'UNAUTHORIZED');
            }

            // If everything is fine, proceed to the next middleware/controller
            next();

        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                logger.warn("Auth Middleware: Expired token received.");
                return fail(res, 401, 'Not authorized, token expired.', 'UNAUTHORIZED');
            }
            logger.error({ error: error.message }, "Auth Middleware: Token verification failed.");
            return fail(res, 401, 'Not authorized, token failed.', 'UNAUTHORIZED');
        }
    }

    if (!token) {
        logger.warn({ path: req.originalUrl }, "Auth Middleware: No token provided in request.");
        return fail(res, 401, 'Not authorized, no token.', 'UNAUTHORIZED');
    }
};

const hasRole = (roles) => (req, res, next) => {
    // Permission validation explicitly checking the database hydrated role object `req.user.role`.
    if (!req.user || !roles.includes(req.user.role)) {
        logger.warn({ userId: req.user?.id, requiredRoles: roles, userRole: req.user?.role }, "Forbidden: Insufficient role permissions.");
        return fail(res, 403, `Forbidden: Access is restricted to permitted roles.`, 'FORBIDDEN_ROLE');
    }
    next();
};

const belongsToSchool = (req, res, next) => {
    if (req.user.role !== 'super_admin' && !req.user.schoolId) {
        logger.warn({ userId: req.user.id }, "Forbidden: User is not assigned to a school.");
        return fail(res, 403, 'Forbidden: You are not assigned to a school.', 'FORBIDDEN');
    }
    next();
}

module.exports = {
    authMiddleware,
    hasRole,
    belongsToSchool
};