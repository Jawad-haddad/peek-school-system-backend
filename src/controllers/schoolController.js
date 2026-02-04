const { Parser } = require('json2csv');
const prisma = require('../prismaClient');
const logger = require('../config/logger');
// === SUPER ADMIN CONTROLLERS ===
const createSchool = async (req, res) => {
    const { name, address } = req.body;
    if (!name) { return res.status(400).json({ message: 'School name is required.' }); }
    try {
        const newSchool = await prisma.school.create({ data: { name, address } });
        res.status(201).json(newSchool);
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'A school with this name already exists.' }); }
        console.error(error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

// === SCHOOL ADMIN CONTROLLERS ===
const createAcademicYear = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) { return res.status(400).json({ message: 'Name, start date, and end date are required.' }); }

    try {
        const newYear = await prisma.academicYear.create({ data: { name, startDate: new Date(startDate), endDate: new Date(endDate), schoolId } });
        res.status(201).json(newYear);
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'An academic year with this name already exists for your school.' }); }
        console.error(error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const createSubject = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { name, teacherId, classId } = req.body;

    if (!name || !classId) { return res.status(400).json({ message: 'Subject name and Class ID are required.' }); }

    try {
        const newSubject = await prisma.subject.create({
            data: {
                name,
                schoolId,
                classId,
                teacherId: teacherId || undefined
            }
        });
        res.status(201).json(newSubject);
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'A subject with this name already exists for this class.' }); }
        console.error(error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const createClass = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { name, grade, academicYearId, defaultFee } = req.body; // Added grade and defaultFee

    // If grade is provided but name is not, use grade as name, or combine them? 
    // Usually "Grade 1" is the name. Let's assume name or grade is required.
    const className = name || grade;

    if (!className || !academicYearId) { return res.status(400).json({ message: 'Class name (or grade) and academic year ID are required.' }); }

    try {
        const academicYear = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
        if (!academicYear) { return res.status(404).json({ message: 'Academic year not found in your school.' }); }

        const newClass = await prisma.class.create({
            data: {
                name: className,
                academicYearId,
                defaultFee: defaultFee ? parseFloat(defaultFee) : 0 // Ensure decimal/float
            }
        });
        res.status(201).json(newClass);
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'A class with this name already exists for this academic year.' }); }
        console.error(error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const bcrypt = require('bcryptjs');
const { UserRole } = require('@prisma/client');

const createStudent = async (req, res) => {
    console.log("Create Student Body:", req.body);
    const schoolId = req.user.schoolId;
    const { fullName, email, password, classId, parentId, nfcTagId, date_of_birth, fee } = req.body;

    if (!classId) {
        return res.status(400).json({ message: "Class ID is required." });
    }

    if (!fullName || !email || !password) {
        return res.status(400).json({ message: "Full name, email, and password are required." });
    }

    // --- CULTURAL NAMING ALGORITHM START ---
    const parts = fullName.trim().split(/\s+/);
    let parentName;

    if (parts.length >= 3) {
        // Option A: Extract Suffix (Parts 2+)
        parentName = parts.slice(1).join(' ');
    } else {
        // Option B: User entered short name (e.g. "Leo Messi")
        // Use "Parent of [FullName]" as fallback
        parentName = `Parent of ${fullName}`;
    }

    try {
        // Check Class existence and get defaultFee
        const targetClass = await prisma.class.findUnique({ where: { id: classId } });
        if (!targetClass) {
            return res.status(404).json({ message: "Class not found." });
        }

        // Determine Fee
        const studentFee = fee ? parseFloat(fee) : parseFloat(targetClass.defaultFee || 0);

        // Check if email or NFC exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(409).json({ message: "Email already exists." });

        if (nfcTagId) {
            const existingNfc = await prisma.student.findUnique({ where: { nfc_card_id: nfcTagId } });
            if (existingNfc) return res.status(409).json({ message: "NFC Tag ID already exists." });
        }

        // --- TRANSACTION START ---
        // Atomic creation of Parent (if needed), Student User, Student Profile, and Enrollment
        const result = await prisma.$transaction(async (prisma) => {

            // 1. Lookup or Create Parent
            let parentUser = await prisma.user.findFirst({
                where: {
                    fullName: parentName,
                    role: UserRole.parent
                }
            });

            if (!parentUser) {
                // Generate email
                const emailPrefix = parts.length >= 2
                    ? `${parts[1].toLowerCase()}.${parts[parts.length - 1].toLowerCase()}`
                    : `parent.${fullName.replace(/\s+/g, '.').toLowerCase()}`;

                const parentEmail = `${emailPrefix}_${Date.now()}@parent.peak`;
                const parentHash = await bcrypt.hash('password123', 10);

                parentUser = await prisma.user.create({
                    data: {
                        fullName: parentName,
                        email: parentEmail,
                        password_hash: parentHash,
                        role: UserRole.parent,
                        schoolId,
                        isActive: true,
                        emailVerified: true
                    }
                });
                logger.info({ parentId: parentUser.id, parentName }, "Auto-created parent user");
            }

            // 2. Create Student User
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await prisma.user.create({
                data: {
                    fullName,
                    email,
                    password_hash: hashedPassword,
                    role: 'student',
                    schoolId,
                    isActive: true
                }
            });

            // 3. Create Student Profile
            const newStudent = await prisma.student.create({
                data: {
                    fullName,
                    schoolId,
                    parentId: parentUser.id,
                    userId: newUser.id,
                    nfc_card_id: nfcTagId,
                    date_of_birth: date_of_birth ? new Date(date_of_birth) : undefined,
                    totalFee: studentFee,
                    paid: 0,
                    balance: studentFee
                }
            });

            // 4. Enroll
            await prisma.studentEnrollment.create({
                data: {
                    studentId: newStudent.id,
                    classId: classId,
                    academicYearId: targetClass.academicYearId
                }
            });

            return { newUser, newStudent };
        });

        logger.info({ studentId: result.newStudent.id, userId: result.newUser.id, schoolId }, "Student created successfully (Transaction)");
        res.status(201).json({ user: result.newUser, student: result.newStudent });

    } catch (error) {
        logger.error({ error, schoolId, email }, "Error creating student");
        res.status(500).json({ message: "Failed to create student." });
    }
};

const createTeacher = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { fullName, email, password, subject, classId } = req.body; // Added classId

    if (!fullName || !email || !password) {
        return res.status(400).json({ message: "Full name, email, and password are required." });
    }

    try {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(409).json({ message: "Email already exists." });

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create User
        const newTeacher = await prisma.user.create({
            data: {
                fullName,
                email,
                password_hash: hashedPassword,
                role: UserRole.teacher,
                schoolId,
                isActive: true
            }
        });

        // If classId and subject are provided, link them
        if (classId && subject) {
            // Try to find if the subject exists in that class
            // Assuming 'subject' input is a Name string (e.g. "Math")
            let subjectRecord = await prisma.subject.findFirst({
                where: { classId, name: subject } // Case-sensitive or insensitive? using exact match for now.
            });

            // If subject doesn't exist, Create if implicit? Or assume it exists? 
            // Best to creating it if missing or failing? Prompt says "links the teacher".
            // Let's create it if it doesn't exist for better UX, or just link.
            // Given "createTeacher", creating the subject feels like a side effect, but often desired.
            // We will try to find it. If found, link. If not, maybe create? 
            // Logic: Update Subject's teacherId to this new teacher.

            if (subjectRecord) {
                await prisma.subject.update({
                    where: { id: subjectRecord.id },
                    data: { teacherId: newTeacher.id }
                });
                // Also create assignment for consistency with chat/grades
                await prisma.teacherSubjectAssignment.upsert({
                    where: { teacherId_subjectId_classId: { teacherId: newTeacher.id, subjectId: subjectRecord.id, classId: classId } },
                    update: {},
                    create: { teacherId: newTeacher.id, subjectId: subjectRecord.id, classId: classId }
                });
            } else {
                // Option: Create the subject.
                const newSubject = await prisma.subject.create({
                    data: {
                        name: subject,
                        schoolId,
                        classId,
                        teacherId: newTeacher.id
                    }
                });
                await prisma.teacherSubjectAssignment.create({
                    data: { teacherId: newTeacher.id, subjectId: newSubject.id, classId: classId }
                });
            }
        }

        logger.info({ teacherId: newTeacher.id, schoolId }, "Teacher created");
        res.status(201).json(newTeacher);

    } catch (error) {
        logger.error({ error, schoolId, email }, "Error creating teacher");
        res.status(500).json({ message: "Failed to create teacher." });
    }
};

const updateTeacher = async (req, res) => {
    const { teacherId } = req.params;
    const schoolId = req.user.schoolId;
    const { fullName, email, subject, classId } = req.body;

    try {
        // Update User Profile
        const updatedTeacher = await prisma.user.update({
            where: { id: teacherId },
            data: {
                fullName,
                email
            }
        });

        // Update Assignment if Subject/Class provided
        if (classId && subject) {
            let subjectRecord = await prisma.subject.findFirst({
                where: { classId, name: subject }
            });

            if (subjectRecord) {
                // Update Subject Owner
                await prisma.subject.update({
                    where: { id: subjectRecord.id },
                    data: { teacherId }
                });

                // Clear old assignments? Maybe complex. Just add new one for now.
                // Ideally we might want to wipe old ones for this teacher if we strictly enforcing 1-class-1-subject per teacher in this view?
                // For now, Upsert the new assignment.
                await prisma.teacherSubjectAssignment.upsert({
                    where: { teacherId_subjectId_classId: { teacherId, subjectId: subjectRecord.id, classId } },
                    update: {},
                    create: { teacherId, subjectId: subjectRecord.id, classId }
                });
            } else {
                // Create Logic Similar to Create
                const newSubject = await prisma.subject.create({
                    data: { name: subject, schoolId, classId, teacherId }
                });
                await prisma.teacherSubjectAssignment.create({
                    data: { teacherId, subjectId: newSubject.id, classId }
                });
            }
        }

        res.status(200).json(updatedTeacher);
    } catch (error) {
        logger.error({ error, teacherId }, "Error updating teacher");
        res.status(500).json({ message: "Failed to update teacher." });
    }
};

const deleteTeacher = async (req, res) => {
    const { teacherId } = req.params;
    try {
        await prisma.user.delete({ where: { id: teacherId } }); // Cascade handles related data ideally
        res.status(204).send();
    } catch (error) {
        logger.error({ error, teacherId }, "Error deleting teacher");
        res.status(500).json({ message: "Failed to delete teacher." });
    }
};

const deleteClass = async (req, res) => {
    const { classId } = req.params;
    try {
        await prisma.class.delete({ where: { id: classId } });
        res.status(204).send();
    } catch (error) {
        logger.error({ error, classId }, "Error deleting class");
        res.status(500).json({ message: "Failed to delete class." });
    }
};

const enrollStudentInClass = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { studentId, classId } = req.body;
    if (!studentId || !classId) { return res.status(400).json({ message: 'Student ID and class ID are required.' }); }

    try {
        const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
        const classToEnroll = await prisma.class.findFirst({
            where: { id: classId, academicYear: { schoolId: schoolId, current: true } }
        });

        if (!student || !classToEnroll) { return res.status(404).json({ message: 'Student or active class not found in your school.' }); }

        const enrollment = await prisma.studentEnrollment.create({ data: { studentId, classId, academicYearId: classToEnroll.academicYearId } });
        res.status(200).json({ message: 'Student enrolled successfully.', enrollment });
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'Student is already enrolled for this academic year.' }); }
        console.error(error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};
const exportStudentsToCsv = async (req, res) => {
    const schoolId = req.user.schoolId;

    try {
        const students = await prisma.student.findMany({
            where: { schoolId },
            select: {
                fullName: true,
                date_of_birth: true,
                parent: {
                    select: {
                        fullName: true,
                        email: true,
                        phoneNumber: true
                    }
                },
                enrollments: {
                    where: { academicYear: { current: true } },
                    select: { class: { select: { name: true } } }
                }
            }
        });

        const formattedStudents = students.map(student => ({
            studentName: student.fullName,
            dateOfBirth: student.date_of_birth ? student.date_of_birth.toISOString().split('T')[0] : 'N/A',
            parentName: student.parent.fullName,
            parentEmail: student.parent.email,
            parentPhone: student.parent.phoneNumber || 'N/A',
            className: student.enrollments[0]?.class.name || 'Not Enrolled'
        }));

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(formattedStudents);

        res.header('Content-Type', 'text/csv');
        res.attachment("students-report.csv");
        res.send(csv);

    } catch (error) {
        console.error("Error exporting students:", error);
        res.status(500).json({ message: "Failed to export students." });
    }
};

const updateStudent = async (req, res) => {
    const { studentId } = req.params;
    const schoolId = req.user.schoolId;
    try {
        const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
        if (!student) {
            return res.status(404).json({ message: "Student not found in your school." });
        }
        const updatedStudent = await prisma.student.update({
            where: { id: studentId },
            data: req.body
        });
        logger.info({ studentId: updatedStudent.id, schoolId }, "Student information updated");
        res.status(200).json(updatedStudent);
    } catch (error) {
        logger.error({ error, studentId }, "Error updating student");
        res.status(500).json({ message: "Failed to update student information." });
    }
};

const deleteStudent = async (req, res) => {
    const { studentId } = req.params;
    const schoolId = req.user.schoolId;
    try {
        const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
        if (!student) {
            return res.status(404).json({ message: "Student not found in your school." });
        }
        await prisma.student.delete({ where: { id: studentId } });
        logger.info({ studentId, schoolId }, "Student deleted successfully");
        res.status(204).send();
    } catch (error) {
        logger.error({ error, studentId }, "Error deleting student");
        res.status(500).json({ message: "Failed to delete student." });
    }
};

const getAllTeachers = async (req, res) => {
    const schoolId = req.user.schoolId;
    try {
        const teachers = await prisma.user.findMany({
            where: { schoolId, role: UserRole.teacher, isActive: true },
            select: {
                id: true,
                fullName: true,
                email: true
            }
        });

        if (!teachers || teachers.length === 0) {
            return res.status(200).json([]);
        }

        const teacherIds = teachers.map(t => t.id);
        const assignments = await prisma.teacherSubjectAssignment.findMany({
            where: { teacherId: { in: teacherIds } },
            include: { subject: { select: { name: true } } }
        });

        const result = teachers.map(teacher => {
            const teacherAssignments = assignments.filter(a => a.teacherId === teacher.id);
            const subjects = [...new Set(teacherAssignments.map(a => a.subject.name))].join(', ');

            return {
                id: teacher.id,
                fullName: teacher.fullName, // Changed to fullName as requested
                email: teacher.email,
                subject: subjects || 'N/A',
                phone: 'N/A'
            };
        });

        res.status(200).json(result);
    } catch (error) {
        logger.error({ error, schoolId }, "Error fetching teachers");
        res.status(500).json({ message: "Failed to fetch teachers." });
    }
};

const getAllClasses = async (req, res) => {
    const schoolId = req.user.schoolId;
    try {
        const classes = await prisma.class.findMany({
            where: { academicYear: { schoolId } },
            include: { academicYear: { select: { name: true, current: true } } }
        });

        // Ensure struct: { id, name, academicYear: { name } }
        const formatted = classes.map(c => ({
            id: c.id,
            name: c.name,
            academicYear: c.academicYear ? { name: c.academicYear.name } : { name: 'N/A' }, // Added safety
            isCurrent: c.academicYear ? c.academicYear.current : false
        }));
        res.status(200).json(formatted);
    } catch (error) {
        logger.error({ error, schoolId }, "Error fetching classes");
        res.status(500).json({ message: "Failed to fetch classes." });
    }
};

const getStudents = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { classId } = req.query; // Allow filtering by classId

    try {
        const whereClause = { schoolId };

        if (classId) {
            // Filter by students enrolled in this class for the *current* academic year likely?
            // Or just any enrollment history? Usually current.
            whereClause.enrollments = {
                some: {
                    classId: classId,
                    academicYear: { current: true }
                }
            };
        }

        const students = await prisma.student.findMany({
            where: whereClause,
            select: {
                id: true,
                fullName: true,
                enrollments: {
                    where: { academicYear: { current: true } },
                    include: { class: { select: { name: true } } }
                }
            }
        });

        const formatted = students.map(s => ({
            id: s.id,
            name: s.fullName,
            class: s.enrollments[0]?.class?.name || 'Unassigned'
        }));

        res.status(200).json(formatted);
    } catch (error) {
        logger.error({ error, schoolId }, "Error fetching students");
        res.status(500).json({ message: "Failed to fetch students." });
    }
};

module.exports = {
    createSchool, createStudent, createTeacher, createAcademicYear, createSubject, createClass,
    enrollStudentInClass, exportStudentsToCsv, updateStudent, deleteStudent, getAllTeachers,
    getAllClasses, getStudents, updateTeacher, deleteTeacher, deleteClass
};