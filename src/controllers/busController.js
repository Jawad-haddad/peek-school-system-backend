const prisma = require('../prismaClient');
const { TripDirection } = require('@prisma/client');
const { sendNotification } = require('../services/notificationService');
/**
 * Creates a new bus trip record.
 */
const createBusTrip = async (req, res) => {
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
        res.status(201).json(trip);
    } catch (error) {
        console.error("Error creating bus trip:", error);
        res.status(500).json({ message: 'Something went wrong.' });
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
    const { tripId, studentId, status } = req.body;

    if (!tripId || !studentId || !status) {
        return res.status(400).json({ message: "Trip ID, Student ID, and status are required." });
    }

    try {
        // Security check: Ensure the trip belongs to the supervisor's school
        const trip = await prisma.busTrip.findFirst({
            where: { id: tripId, schoolId: req.user.schoolId }
        });

        // Find student details for notification
        const student = await prisma.student.findFirst({
            where: { id: studentId, schoolId: req.user.schoolId },
            select: { id: true, parentId: true, fullName: true }
        });

        if (!trip || !student) {
            return res.status(404).json({ message: "Trip or Student not found in your school." });
        }

        // Determine boardedAt value
        let boardedAtUpdate = undefined;
        if (status === 'boarded') {
            boardedAtUpdate = new Date(); // Set timestamp if boarding
        }
        // If dropped, we don't overwrite boardedAt, assuming it was set earlier. 
        // If we want to clear it or track dropoff time separately, schema changes would be needed. 
        // For now, only 'boarded' triggers a timestamp set as per instructions.

        // Update or Create the entry
        // Using upsert ensures we handle both "student already on manifest" and "new student added dynamically"
        const attendanceEntry = await prisma.busTripEntry.upsert({
            where: {
                busTripId_studentId: {
                    busTripId: tripId,
                    studentId: studentId
                }
            },
            update: {
                status: status,
                boardedAt: boardedAtUpdate // Will be undefined (no change) if not 'boarded'
            },
            create: {
                busTripId: tripId,
                studentId: studentId,
                status: status,
                boardedAt: boardedAtUpdate
            }
        });

        // Send Notification
        if (student.parentId) {
            const action = status === 'boarded' ? 'boarded' : 'dropped from';
            const notificationBody = `Your child ${student.fullName} has just ${action} the bus.`;

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
        console.error("Error updating bus status:", error);
        res.status(500).json({ message: 'Something went wrong.' });
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
        console.error("Error fetching bus trip details:", error);
        res.status(500).json({ message: "Failed to fetch trip details." });
    }
};

module.exports = { createBusTrip, updateBusStatus, getBusTripDetails };