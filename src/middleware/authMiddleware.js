// src/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');
const logger = require('../config/logger'); // Import the professional logger

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

            // RBAC debug removed for production safety

            if (!req.user || !req.user.isActive) {
                logger.warn({ userId: decoded.userId }, "Auth Middleware: User not found or is inactive.");
                return res.status(401).json({ message: 'User not found or disabled.' });
            }

            // If everything is fine, proceed to the next middleware/controller
            next();

        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                logger.warn("Auth Middleware: Expired token received.");
                return res.status(401).json({ message: 'Not authorized, token expired.' });
            }
            logger.error({ error: error.message }, "Auth Middleware: Token verification failed.");
            return res.status(401).json({ message: 'Not authorized, token failed.' });
        }
    }

    if (!token) {
        logger.warn({ path: req.originalUrl }, "Auth Middleware: No token provided in request.");
        return res.status(401).json({ message: 'Not authorized, no token.' });
    }
};

const hasRole = (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        logger.warn({ userId: req.user?.id, requiredRoles: roles, userRole: req.user?.role }, "Forbidden: Insufficient role permissions.");
        return res.status(403).json({ message: `Forbidden: Access is restricted to the following roles: ${roles.join(', ')}` });
    }
    next();
};

const belongsToSchool = (req, res, next) => {
    if (req.user.role !== 'super_admin' && !req.user.schoolId) {
        logger.warn({ userId: req.user.id }, "Forbidden: User is not assigned to a school.");
        return res.status(403).json({
            message: 'Forbidden: You are not assigned to a school.',
            schoolId: null
        });
    }
    next();
}

module.exports = {
    authMiddleware,
    hasRole,
    belongsToSchool
};