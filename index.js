// index.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const httpLogger = require('./src/middleware/loggingMiddleware');
const errorHandler = require('./src/middleware/errorHandler');
const { apiLimiter } = require('./src/middleware/rateLimiter');

// Import all the route handlers
const mainRoutes = require('./src/routes/mainRoutes');
// Alias health locally to avoid creating an entirely new router file for one endpoint
const { ok } = require('./src/utils/response');
const healthCheck = (req, res) => {
    ok(res, {
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
};
const userRoutes = require('./src/routes/userRoutes');
const schoolRoutes = require('./src/routes/schoolRoutes');
const academicRoutes = require('./src/routes/academicRoutes');
const communicationRoutes = require('./src/routes/communicationRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const examRoutes = require('./src/routes/examRoutes');
const financeRoutes = require('./src/routes/financeRoutes');
const posRoutes = require('./src/routes/posRoutes');
const busRoutes = require('./src/routes/busRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const statsRoutes = require('./src/routes/statsRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swaggerConfig');

const app = express();

// ── Security & Parsing Middleware ────────────────────────
app.use(httpLogger);
app.use(helmet());
app.use(compression());

const corsOptions = {
    origin: function (origin, callback) {
        // Debug logging for CORS using logger
        if (process.env.NODE_ENV === 'development') {
            const allowed = process.env.FRONTEND_URL || 'http://localhost:3001';
            // logger.debug({ origin, allowed }, "CORS Check"); // Optional: uncomment if needed, but avoid spam
        }

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // In development, allow any localhost origin
        if (process.env.NODE_ENV === 'development' && origin.match(/^http:\/\/localhost:\d+$/)) {
            return callback(null, true);
        }

        // Check allowed origin from env
        const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3001';

        // Fail-fast in production if FRONTEND_URL is not set
        if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
            const msg = 'CORS Error: FRONTEND_URL not set in production environment.';
            console.error(msg); // Keep console.error for critical startup config issues
            return callback(new Error(msg), false);
        }

        if (origin === allowedOrigin) {
            return callback(null, true);
        }

        // logger.warn({ origin }, "CORS Blocked");
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── API-wide rate limiter ────────────────────────────────
app.use('/api', apiLimiter);

// ── API Documentation ────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Routes ───────────────────────────────────────────────
app.use('/', mainRoutes);
app.use('/health', healthCheck);
app.use('/api/health', healthCheck);
app.use('/api/users', userRoutes);
app.use('/api/auth', userRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/school/stats', statsRoutes); // Fix for frontend expecting /api/school/stats/fees
app.use('/api/academics', academicRoutes);
app.use('/api/academic-years', academicRoutes); // Restored for backward compatibility
app.use('/api/communication', communicationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/bus', busRoutes);     // Alias: frontend calls /api/bus/routes
app.use('/api/students', studentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/school/reports', reportRoutes); // Alias: frontend calls /api/school/reports/overview
app.use('/api/stats', statsRoutes);

// ── 404 Catch-All ────────────────────────────────────────
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: { message: `Route ${req.originalUrl} not found` }
    });
});

// ── Global Error Handler (must be last) ──────────────────
app.use(errorHandler);

module.exports = app;