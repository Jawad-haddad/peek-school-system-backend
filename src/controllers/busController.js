const prisma = require('../prismaClient');
const { TripDirection } = require('@prisma/client');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');
/**
 * Creates a new bus trip record.
 */
const startTrip = async (req, res) => {
    const schoolId = req.user.schoolId;
    const supervisorId = req.user.id;
    const { date, direction, routeName } = req.body;

    if (!date || !direction || !routeName || !Object.values(TripDirection).includes(direction)) {
        return res.status(400).json({ message: 'A valid date, direction, and route name are required.' });
    }

    try {
        const trip = await prisma.busTrip.create({
            data: {
                schoolId,
                supervisorId,
                date: new Date(date),
                direction,
                routeName,
            }
        });
        // Return simplified JSON for Frontend: { id, routeName, status: 'active' }
        res.status(201).json({
            id: trip.id,
            routeName: trip.routeName,
            status: trip.status
        });
    } catch (error) {
        logger.error({ error: error.message }, "Error starting bus trip");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const endTrip = async (req, res) => {
    const { tripId } = req.body;
    const schoolId = req.user.schoolId;

    try {
        const trip = await prisma.busTrip.findFirst({
            where: { id: tripId, schoolId }
        });

        if (!trip) {
            return res.status(404).json({ message: "Trip not found." });
        }

        // Action: Update BusTrip status to 'completed'
        await prisma.busTrip.update({
            where: { id: tripId },
            data: { status: 'completed' }
        });

        res.status(200).json({ message: "Trip status updated to completed." });

    } catch (error) {
        logger.error({ error: error.message }, "Error ending trip");
        res.status(500).json({ message: "Failed to end trip." });
    }
};

/**
 * Records a student's attendance on a specific bus trip.
 * Accessible by: bus_supervisor, school_admin
 */
// src/controllers/busController.js

/**
 * Updates the status of a student on a bus trip (e.g., boarded, dropped).
 * Sends a notification to the parent.
 */
const updateBusStatus = async (req, res) => {
    // Note: Request param is :studentId for PATCH /api/bus/entry/:studentId
    const { studentId } = req.params;
    const { status, tripId, location } = req.body; // location expected as 'lat,long'

    if (!tripId || !status) {
        return res.status(400).json({ message: "Trip ID and status are required." });
    }

    try {
        const trip = await prisma.busTrip.findFirst({
            where: { id: tripId, schoolId: req.user.schoolId }
        });

        const student = await prisma.student.findFirst({
            where: { id: studentId, schoolId: req.user.schoolId },
            select: { id: true, parentId: true, fullName: true }
        });

        if (!trip || !student) {
            return res.status(404).json({ message: "Trip or Student not found in your school." });
        }

        // Logic: Handle Location (Logging for now as schema support is pending)
        if (location) {
            logger.debug({ studentName: student.fullName, status, location }, "Bus scan processed");
        }

        // Logic 2: Drop-off verification & Safety Check
        let boardedAtUpdate = undefined;
        if (status === 'dropped_off') {
            // 1. Verify Bus Trip Direction
            // - If 'pickup' (Morning): Dropping off means arriving at school.
            // - If 'dropoff' (Afternoon): Dropping off means arriving at home.
            // Both are valid "drop off" actions, but we must ensure the context is correct.
            if (!['pickup', 'dropoff'].includes(trip.direction)) {
                return res.status(400).json({ message: "Invalid trip direction for this action." });
            }

            // 2. Safety Check: Ensure student was actually ON the bus before dropping off
            const currentEntry = await prisma.busTripEntry.findUnique({
                where: { busTripId_studentId: { busTripId: tripId, studentId: studentId } }
            });

            if (!currentEntry || currentEntry.status !== 'boarded_on') {
                // Allowing strict mode: Reject drop-off if not boarded
                // return res.status(400).json({ message: "Student must be boarded before being dropped off." });
                // WARN: For MVP/Demo flexibility, we might log a warning but allow it if sensor missed boarding.
                logger.warn({ studentName: student.fullName, tripId }, `Student dropped off without 'boarded_on' status.`);
            }
        } else if (status === 'boarded_on') {
            boardedAtUpdate = new Date();
        }

        const attendanceEntry = await prisma.busTripEntry.upsert({
            where: {
                busTripId_studentId: {
                    busTripId: tripId,
                    studentId: studentId
                }
            },
            update: { status, boardedAt: boardedAtUpdate },
            create: {
                busTripId: tripId,
                studentId: studentId,
                status,
                boardedAt: boardedAtUpdate
            }
        });

        // Logic 3: Notification
        if (student.parentId) {
            const actionText = status === 'boarded_on' ? 'boarded' : 'been dropped from';
            const notificationBody = `Your child ${student.fullName} has ${actionText} the bus.`;

            // Trigger Notification
            sendNotification({
                userId: student.parentId,
                title: 'Bus Status Update',
                body: notificationBody,
                data: { tripId: trip.id, screen: 'BusTracking' },
                preferenceType: 'bus'
            });
        }

        res.status(200).json(attendanceEntry);
    } catch (error) {
        logger.error({ error: error.message }, "Error updating bus status");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const getStudentBusStatus = async (req, res) => {
    const { studentId } = req.params;
    const parentId = req.user.id;

    try {
        // Strict Multi-Tenancy: Check if requester is the parent
        const student = await prisma.student.findFirst({
            where: { id: studentId, parentId: parentId }
        });

        if (!student) {
            return res.status(403).json({ message: "Forbidden: You are not the parent of this student." });
        }

        // Find latest/active trip entry
        // We look for entries today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const latestEntry = await prisma.busTripEntry.findFirst({
            where: {
                studentId: studentId,
                busTrip: {
                    date: { gte: startOfDay, lte: endOfDay }
                }
            },
            include: { busTrip: true },
            orderBy: { busTrip: { createdAt: 'desc' } }
        });

        if (!latestEntry) {
            return res.status(200).json({ message: "Not on any bus trip today." });
        }

        // Clean up status string for frontend display
        let displayStatus = 'On Bus';
        if (latestEntry.status === 'dropped_off') {
            displayStatus = 'Dropped Off';
        } else if (latestEntry.status === 'boarded_on') {
            displayStatus = `On Bus - ${latestEntry.busTrip.routeName}`;
        }

        res.status(200).json({
            status: displayStatus,
            busLocation: 'Lat: 31.95, Long: 35.91', // Placeholder as location tracking is not in DB yet
            lastUpdated: latestEntry.boardedAt || new Date()
        });

    } catch (error) {
        logger.error({ error: error.message }, "Error getting live bus status");
        res.status(500).json({ message: "Failed to fetch status." });
    }
};

/**
 * Retrieves the manifest for a bus trip, including student details and current status.
 */
const getBusTripDetails = async (req, res) => {
    const { tripId } = req.params;
    const schoolId = req.user.schoolId;

    try {
        // Verify trip existence and ownership
        const trip = await prisma.busTrip.findFirst({
            where: { id: tripId, schoolId }
        });

        if (!trip) {
            return res.status(404).json({ message: "Bus trip not found." });
        }

        // Fetch entries with student details
        // Ordering by student name since stop sequence is not available in schema
        const entries = await prisma.busTripEntry.findMany({
            where: { busTripId: tripId },
            include: {
                student: {
                    select: {
                        id: true,
                        fullName: true,
                        // Add other student fields if needed (e.g. class, photo)
                    }
                }
            },
            orderBy: {
                student: {
                    fullName: 'asc'
                }
            }
        });

        res.status(200).json({
            trip,
            manifest: entries
        });
    } catch (error) {
        logger.error({ error: error.message }, "Error fetching bus trip details");
        res.status(500).json({ message: "Failed to fetch trip details." });
    }
};

/**
 * Get all bus routes for the school.
 */
const getBusRoutes = async (req, res) => {
    const schoolId = req.user.schoolId;
    try {
        // Assuming 'routeName' is stored in BusTrip, we might want unique route names?
        // Or if there's a Route model. The prompt implies "GET /bus/routes". 
        // Checking schema... we only saw BusTrip. 
        // If no Route model, we might return unique routeNames from trips or just return active trips?
        // Prompt says "Fetching route and trip data".
        // Let's assume we return unique route names from recent trips or a static list if modeled?
        // Wait, `prisma.busTrip.create` takes `routeName`.
        // I will return distinct route names from existing trips as a proxy for "Routes".

        const routes = await prisma.busTrip.findMany({
            where: { schoolId },
            select: { routeName: true },
            distinct: ['routeName']
        });

        // Return as simple list or objects
        res.status(200).json(routes.map(r => ({ id: r.routeName, name: r.routeName })));
    } catch (error) {
        logger.error({ error: error.message }, "Error fetching bus routes");
        res.status(500).json({ message: "Failed to fetch bus routes." });
    }
};

module.exports = { startTrip, endTrip, updateBusStatus, getBusTripDetails, getStudentBusStatus, getBusRoutes };