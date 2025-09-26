// index.js

require('dotenv').config();
const express = require('express');
const helmet = require('helmet'); // Import helmet
const cors = require('cors');     // Import cors

const mainRoutes = require('./src/routes/mainRoutes');
const userRoutes = require('./src/routes/userRoutes');
const schoolRoutes = require('./src/routes/schoolRoutes');
const academicRoutes = require('./src/routes/academicRoutes');
const financeRoutes = require('./src/routes/financeRoutes');
const posRoutes = require('./src/routes/posRoutes');
const busRoutes = require('./src/routes/busRoutes');

const app = express();

// --- NEW: Security Middleware ---

// 1. Use Helmet to set various security headers
app.use(helmet());

// 2. Configure CORS to allow specific origins
const whitelist = [
    // Add the URLs of your future frontends here
    'http://localhost:3001', // For local Next.js frontend development
    // 'https://dashboard.peek-app.com', // Example for production
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};
app.use(cors(corsOptions));

// -----------------------------

app.use(express.json());

// Registering all routes
app.use('/', mainRoutes);
app.use('/api/users', userRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/academics', academicRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/buses', busRoutes);

module.exports = app;