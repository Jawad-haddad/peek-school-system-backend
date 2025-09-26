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

const recordBusAttendance = async (req, res) => {
    const { tripId, studentId, status } = req.body;

    if (!tripId || !studentId || !status) {
        return res.status(400).json({ message: "Trip ID, Student ID, and status are required." });
    }

    try {
        // Security check: Ensure the trip belongs to the supervisor's school
        const trip = await prisma.busTrip.findFirst({
            where: { id: tripId, schoolId: req.user.schoolId }
        });

        // Find student and include parentId and name for the notification
        const student = await prisma.student.findFirst({
            where: { id: studentId, schoolId: req.user.schoolId },
            select: { id: true, parentId: true, fullName: true }
        });

        if (!trip || !student) {
            return res.status(404).json({ message: "Trip or Student not found in your school." });
        }

        // Create the attendance entry
        const attendanceEntry = await prisma.busTripEntry.create({
            data: {
                busTripId: tripId,
                studentId,
                status, // e.g., "boarded_on", "dropped_off"
                boardedAt: new Date()
            }
        });

        // --- NEW: Send notification to the parent ---
        if (student.parentId) {
            // Customize the message based on the status
            let notificationBody = `An update regarding your child, ${student.fullName}, on the bus. Status: ${status}.`;
            if (status.toLowerCase() === 'boarded_on') {
                notificationBody = `Your child, ${student.fullName}, has successfully boarded the bus.`;
            } else if (status.toLowerCase() === 'dropped_off') {
                notificationBody = `Your child, ${student.fullName}, has been dropped off by the bus.`;
            }

            sendNotification({
                userId: student.parentId,
                title: 'Bus Attendance Update',
                body: notificationBody,
                data: { tripId: trip.id, screen: 'BusTracking' }
            });
        }
        // ---------------------------------------------

        res.status(201).json(attendanceEntry);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'This student\'s attendance has already been recorded for this trip.' });
        }
        console.error("Error recording bus attendance:", error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};
module.exports = { createBusTrip, recordBusAttendance };