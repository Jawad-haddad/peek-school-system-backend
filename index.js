// index.js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const httpLogger = require('./src/middleware/loggingMiddleware');
const reportRoutes = require('./src/routes/reportRoutes');
// Import all the route handlers
const mainRoutes = require('./src/routes/mainRoutes');
const healthRoutes = require('./src/routes/healthRoutes');
const userRoutes = require('./src/routes/userRoutes');
const schoolRoutes = require('./src/routes/schoolRoutes');
const academicRoutes = require('./src/routes/academicRoutes');
const communicationRoutes = require('./src/routes/communicationRoutes'); // New Route
const chatRoutes = require('./src/routes/chatRoutes'); // New Route
const attendanceRoutes = require('./src/routes/attendanceRoutes'); // New Route
const examRoutes = require('./src/routes/examRoutes'); // New Route
const financeRoutes = require('./src/routes/financeRoutes');
const posRoutes = require('./src/routes/posRoutes');
const busRoutes = require('./src/routes/busRoutes');
const studentRoutes = require('./src/routes/studentRoutes'); // New Route
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swaggerConfig');
const app = express();

// Middlewares
app.use(httpLogger);
app.use(helmet());
const whitelist = ['http://localhost:3001'];
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('This origin is not allowed by CORS'));
        }
    }
};
// --- API Documentation Route ---

app.use(cors(corsOptions));
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Registering all routes
app.use('/', mainRoutes);
app.use('/health', healthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', userRoutes); // Alias for auth routes (e.g. /api/auth/login)
app.use('/api/schools', schoolRoutes);
app.use('/api/school', schoolRoutes); // Alias as requested
app.use('/api/academics', academicRoutes);
app.use('/api/academic-years', academicRoutes); // Mounted explicitly as requested
app.use('/api/communication', communicationRoutes); // New Endpoint
app.use('/api/chat', chatRoutes); // New Endpoint
app.use('/api/attendance', attendanceRoutes); // New Endpoint. Note: This overlaps with academicRoutes 'recordAttendance' which was at /api/academics/attendance. 
// Ideally we'd deprecate the old one or move it here. For now, this is additive.
app.use('/api/exams', examRoutes); // New Endpoint
app.use('/api/finance', financeRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/students', studentRoutes); // New Endpoint
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
module.exports = app;