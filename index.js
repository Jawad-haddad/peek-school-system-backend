require('dotenv').config({ path: __dirname + '/.env' });

console.log("✅ Loaded DATABASE_URL:", process.env.DATABASE_URL);
console.log("✅ Loaded JWT_SECRET:", process.env.JWT_SECRET);const express = require('express');
const mainRoutes = require('./src/routes/mainRoutes');
const userRoutes = require('./src/routes/userRoutes');
const schoolRoutes = require('./src/routes/schoolRoutes');
const academicRoutes = require('./src/routes/academicRoutes');
const financeRoutes = require('./src/routes/financeRoutes');
const posRoutes = require('./src/routes/posRoutes');
const busRoutes = require('./src/routes/busRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

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