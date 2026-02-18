const request = require('supertest');
const app = require('../../index'); // Adjust path as needed based on folder structure
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test Data
let schoolId;
let supervisorToken;
let parentToken;
let studentId;
let tripId;
let supervisorId;
let parentId;

describe('Bus Logistics Integration Test', () => {

    beforeAll(async () => {
        // --- 1. CLEANUP (Optional/Careful in Prod) ---
        // For local dev, maybe clean up recent test data or just create new unique data

        // --- 2. SETUP SCHOOL ---
        const school = await prisma.school.create({
            data: {
                name: `Test School ${Date.now()}`,
                subscription_status: 'active'
            }
        });
        schoolId = school.id;

        // --- 3. SETUP SUPERVISOR ---
        const supervisor = await prisma.user.create({
            data: {
                fullName: 'Bus Supervisor',
                email: `supervisor${Date.now()}@test.com`,
                password_hash: '$2b$10$hashedpassword', // Mock hash
                role: 'bus_supervisor',
                schoolId: schoolId
            }
        });
        supervisorId = supervisor.id;
        // Mock Token (assuming authMiddleware verifies JWT)
        // In a real integration test, we might hit /login or generate a valid JWT here.
        // For simplicity, we'll need a way to mock auth or generate a real token.
        // Since we don't have the JWT_SECRET handy in this script context easily without env, 
        // we'll assume we can use a helper or hit the login endpoint if it exists.
        // Let's try hitting the login endpoint if possible, or just mock the middleware behavior if we can't.
        // BUT, full integration usually implies hitting endpoints.
        // So I'll try to generate a token using jsonwebtoken if I can import it, or login.

        // Let's assume we can use the login endpoint if we created the user with a known password.
        // But we inserted a hashed password directly. 
        // So let's generate a token directly using the same library the app uses.
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET || 'supersecret'; // Fallback to what might be in env

        supervisorToken = jwt.sign({ id: supervisor.id, role: supervisor.role, schoolId: schoolId }, secret);

        // --- 4. SETUP PARENT & STUDENT ---
        const parent = await prisma.user.create({
            data: {
                fullName: 'Bus Parent',
                email: `parent${Date.now()}@test.com`,
                password_hash: '$2b$10$hashedpassword',
                role: 'parent',
                schoolId: schoolId
            }
        });
        parentId = parent.id;
        parentToken = jwt.sign({ id: parent.id, role: parent.role, schoolId: schoolId }, secret);

        const student = await prisma.student.create({
            data: {
                fullName: 'Bus Student',
                schoolId: schoolId,
                parentId: parentId,
                wallet_balance: 0
            }
        });
        studentId = student.id;
    });

    afterAll(async () => {
        // Cleanup
        if (schoolId) {
            await prisma.school.delete({ where: { id: schoolId } });
        }
        await prisma.$disconnect();
    });

    // --- TASK 2: FULL TRIP SIMULATION ---

    test('Full Morning Run Simulation', async () => {
        // 1. Start Trip
        const startRes = await request(app)
            .post('/api/buses/trip/start') // Note: Route path verified in busRoutes.js
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({
                date: new Date().toISOString(),
                direction: 'pickup',
                routeName: 'Route A - Morning'
            });

        expect(startRes.statusCode).toBe(201);
        expect(startRes.body).toHaveProperty('id');
        expect(startRes.body.status).toBe('active');
        tripId = startRes.body.id;

        // 2. Board Student
        const boardRes = await request(app)
            .patch(`/api/buses/entry/${studentId}`)
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({
                tripId: tripId,
                status: 'boarded_on',
                location: '31.95,35.91'
            });

        expect(boardRes.statusCode).toBe(200);
        expect(boardRes.body.status).toBe('boarded_on');

        // 3. Verify Parent View
        const parentViewRes = await request(app)
            .get(`/api/buses/live/${studentId}`)
            .set('Authorization', `Bearer ${parentToken}`);

        expect(parentViewRes.statusCode).toBe(200);
        expect(parentViewRes.body.status).toContain('On Bus');
        expect(parentViewRes.body.busLocation).toBeDefined();

        // 4. Drop Student
        const dropRes = await request(app)
            .patch(`/api/buses/entry/${studentId}`)
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({
                tripId: tripId,
                status: 'dropped_off',
                location: '31.96,35.92'
            });

        expect(dropRes.statusCode).toBe(200);
        expect(dropRes.body.status).toBe('dropped_off');

        // 5. End Trip
        const endRes = await request(app)
            .post('/api/buses/trip/end')
            .set('Authorization', `Bearer ${supervisorToken}`)
            .send({
                tripId: tripId
            });

        expect(endRes.statusCode).toBe(200);

        // Verify trip status via DB or another fetch if needed
        const tripCheck = await prisma.busTrip.findUnique({ where: { id: tripId } });
        expect(tripCheck.status).toBe('completed');
    });

    // --- TASK 3: SECURITY NEGATIVE TESTS ---

    test('Security Checks: Unauthorized Access', async () => {
        // 1. Parent tries to start trip
        const unauthorizedStart = await request(app)
            .post('/api/buses/trip/start')
            .set('Authorization', `Bearer ${parentToken}`) // Correct token, wrong role
            .send({
                date: new Date().toISOString(),
                direction: 'pickup',
                routeName: 'Hacker Route'
            });

        expect(unauthorizedStart.statusCode).toBe(403);

        // 2. Stranger tries to view student status
        // Create a stranger parent
        const stranger = await prisma.user.create({
            data: {
                fullName: 'Stranger',
                email: `stranger${Date.now()}@test.com`,
                password_hash: 'hash',
                role: 'parent',
                schoolId: schoolId
            }
        });
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET || 'supersecret';
        const strangerToken = jwt.sign({ id: stranger.id, role: stranger.role, schoolId: schoolId }, secret);

        const strangerView = await request(app)
            .get(`/api/buses/live/${studentId}`)
            .set('Authorization', `Bearer ${strangerToken}`);

        expect(strangerView.statusCode).toBe(403);
    });

});
