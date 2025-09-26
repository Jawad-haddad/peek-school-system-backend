const prisma = require('../prismaClient');
const { sendNotification } = require('../services/notificationService'); // THE FIX: This line was missing

// === TEACHER & ADMIN CONTROLLERS ===

const createHomework = async (req, res) => {
    // This function is now updated to send notifications
    const { title, classId, subjectId, dueDate, description } = req.body;

    if (!title || !classId || !subjectId || !dueDate) { 
        return res.status(400).json({ message: 'Title, class ID, subject ID, and due date are required.' }); 
    }

    try {
        const homework = await prisma.homework.create({ 
            data: { 
                title, description, classId, subjectId, 
                dueDate: new Date(dueDate) 
            },
            include: { 
                subject: { select: { name: true } }
            }
        });

        const enrollments = await prisma.studentEnrollment.findMany({
            where: { classId: classId },
            select: { student: { select: { parentId: true } } }
        });

        const parentIds = [...new Set(enrollments.map(e => e.student.parentId))];

        parentIds.forEach(parentId => {
            if (parentId) {
                sendNotification({
                    userId: parentId,
                    title: 'New Homework Assigned',
                    body: `A new homework for ${homework.subject.name} titled "${homework.title}" has been assigned.`,
                    data: { homeworkId: homework.id, screen: 'HomeworkDetails' }
                });
            }
        });

        res.status(201).json(homework);

    } catch (error) {
        console.error("Error in Making Homework:", error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

// src/controllers/academicController.js

const addGrade = async (req, res) => {
    const { homeworkId } = req.params;
    const { studentId, grade, comments } = req.body;
    const teacherId = req.user.id;
  
    if (grade === undefined || !studentId) {
      return res.status(400).json({ message: "Student ID and grade are required." });
    }
  
    try {
      // Find the homework and include subject name for the notification
      const homework = await prisma.homework.findUnique({
        where: { id: homeworkId },
        include: { 
          class: { include: { assignments: true } },
          subject: { select: { name: true } }
        },
      });
  
      if (!homework) {
        return res.status(404).json({ message: 'Homework not found.' });
      }
  
      // Security check: Ensure the user is the teacher for this class
      const isTeacherOfClass = homework.class.assignments.some(
        (assign) => assign.teacherId === teacherId
      );
  
      if (!isTeacherOfClass && req.user.role !== 'school_admin') {
        return res.status(403).json({ message: 'Forbidden: You do not teach this class.' });
      }
  
      // Find the student's enrollment to get the parentId for the notification
      const enrollment = await prisma.studentEnrollment.findFirst({
          where: {
              studentId: studentId,
              classId: homework.classId
          },
          include: {
              student: { select: { parentId: true, fullName: true } }
          }
      });
  
      if (!enrollment) {
          return res.status(404).json({ message: 'Student is not enrolled in this class.' });
      }
  
      // Create the grade record in the database
      const newGrade = await prisma.grade.create({
        data: {
          grade,
          comments,
          studentId,
          homeworkId,
        },
      });
  
      // --- NEW: Send notification to the parent ---
      if (enrollment.student.parentId) {
          sendNotification({
              userId: enrollment.student.parentId,
              title: 'New Grade Submitted',
              body: `A new grade of ${grade} has been submitted for your child, ${enrollment.student.fullName}, in ${homework.subject.name}.`,
              data: { gradeId: newGrade.id, screen: 'Grades' }
          });
      }
      // ---------------------------------------------
  
      res.status(201).json(newGrade);
    } catch (error) {
      if (error.code === 'P2022') { // Corrected error code for unique constraint
        return res.status(409).json({ message: 'A grade has already been submitted for this student for this homework.' });
      }
      console.error("Error adding grade:", error);
      res.status(500).json({ message: 'Failed to add grade.' });
    }
  };
const recordAttendance = async (req, res) => {
    const { studentId, status, date, reason } = req.body;
    const teacherId = req.user.id;

    if (!studentId || !status || !date) {
        return res.status(400).json({ message: "Student ID, status, and date are required." });
    }

    try {
        const student = await prisma.student.findFirst({
            where: {
                id: studentId,
                schoolId: req.user.schoolId
            },
            include: {
                enrollments: {
                    where: { academicYear: { isActive: true } },
                    include: { class: { include: { assignments: true } } }
                }
            }
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found in your school."});
        }

        const isTeacherOfStudent = student.enrollments.some(enrollment => 
            enrollment.class.assignments.some(assign => assign.teacherId === teacherId)
        );

        if (!isTeacherOfStudent && req.user.role !== 'school_admin') {
            return res.status(403).json({ message: "Forbidden: You are not a teacher for this student."});
        }

        const attendanceRecord = await prisma.attendance.create({
        data: {
            studentId,
            status,
            date: new Date(date),
            reason,
        },
        });

        res.status(201).json(attendanceRecord);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'Attendance for this student on this date has already been recorded.' });
        }
        console.error("Error recording attendance:", error);
        res.status(500).json({ message: 'Failed to record attendance.' });
    }
};

const getMySchedule = async (req, res) => {
    const teacherId = req.user.id;

    try {
        const assignments = await prisma.teacherSubjectAssignment.findMany({
        where: {
            teacherId: teacherId,
        },
        include: {
            subject: {
            select: {
                name: true,
            },
            },
            class: {
            select: {
                name: true,
            },
            },
        },
        });

        res.status(200).json(assignments);
    } catch (error) {
        console.error("Error fetching teacher schedule:", error);
        res.status(500).json({ message: 'Failed to fetch schedule.' });
    }
};

// === PARENT CONTROLLERS ===
const getHomeworkForStudent = async (req, res) => {
    const parentId = req.user.id;
    const { studentId } = req.params;

    try {
        const student = await prisma.student.findFirst({
            where: { id: studentId, parentId },
            include: { enrollments: { where: { academicYear: { isActive: true } } } }
        });

        if (!student) { return res.status(403).json({ message: 'Forbidden: You are not the parent of this student.' }); }
        if (student.enrollments.length === 0) { return res.status(200).json([]); }
        
        const classId = student.enrollments[0].classId;
        const homework = await prisma.homework.findMany({ 
            where: { classId }, 
            orderBy: { dueDate: 'asc' },
            include: { subject: { select: { name: true } } }
        });
        res.status(200).json(homework);
    } catch (error) {
        console.error("Error getting homework:", error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

module.exports = { 
    createHomework, 
    getHomeworkForStudent, 
    addGrade, 
    recordAttendance, 
    getMySchedule 
};