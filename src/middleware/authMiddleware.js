const prisma = require('../prismaClient');
const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  console.log("--- Auth Middleware: STARTED ---");
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      console.log("Auth Middleware: Token found, verifying...");
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log(`Auth Middleware: Token verified for email: ${decoded.email}. Now finding user...`);

      req.user = await prisma.user.findUnique({
        where: { email: decoded.email },
        select: { id: true, email: true, fullName: true, role: true, schoolId: true, isActive: true }
      });
      
      console.log("Auth Middleware: Prisma query finished. User found:", req.user ? req.user.email : 'null');

      if (!req.user || !req.user.isActive) {
        console.log("Auth Middleware: User not found or disabled. Sending 401.");
        // ملاحظة: لن نصل إلى هنا لأن المشكلة هي التجمد، وليس هذا الخطأ
        return res.status(401).json({ message: 'User not found or disabled.' });
      }

      console.log("--- Auth Middleware: PASSED, calling next() ---");
      next();
    } catch (error) {
      console.error("--- Auth Middleware: FAILED with error ---", error);
      return res.status(401).json({ message: 'Not authorized, token failed.' });
    }
  }

  if (!token) {
    console.log("--- Auth Middleware: No token provided. Sending 401. ---");
    return res.status(401).json({ message: 'Not authorized, no token.' });
  }
};



const hasRole = (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: `Forbidden: Access is restricted to the following roles: ${roles.join(', ')}` });
    }
    next();
};

const belongsToSchool = (req, res, next) => {
    if (req.user.role !== 'super_admin' && !req.user.schoolId) {
        return res.status(403).json({ message: 'Forbidden: You are not assigned to a school.' });
    }
    next();
}


module.exports = { 
    authMiddleware, 
    hasRole,
    belongsToSchool
};