const { Parser } = require('json2csv');
const prisma = require('../prismaClient');
const logger = require('../config/logger');
const { UserRole } = require('@prisma/client');
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
        const result = await prisma.$transaction(async (prisma) => {
            const newSubject = await prisma.subject.create({
                data: {
                    name,
                    schoolId,
                    classId,
                    teacherId: teacherId || undefined
                }
            });

            // Sync with TeacherSubjectAssignment if teacher is assigned
            if (teacherId) {
                await prisma.teacherSubjectAssignment.create({
                    data: {
                        teacherId,
                        subjectId: newSubject.id,
                        classId
                    }
                });
            }
            return newSubject;
        });

        res.status(201).json(result);
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

const createStudent = async (req, res) => {
    console.log("Create Student Body:", req.body);
    const schoolId = req.user.schoolId;

    // Payload: { name, classId, gender, dob, ... }
    const { name, classId, nfcTagId, date_of_birth, dob, fee, gender } = req.body;
    const fullName = name || req.body.fullName;

    // Validate Required Fields
    if (!classId) {
        return res.status(400).json({ message: "Class ID is required." });
    }
    if (!fullName) {
        return res.status(400).json({ message: "Student Name is required." });
    }

    // Safe Date Parsing
    let birthDateValue = null;
    try {
        if (dob) birthDateValue = new Date(dob);
        else if (date_of_birth) birthDateValue = new Date(date_of_birth);

        // Check for invalid date
        if (birthDateValue && isNaN(birthDateValue.getTime())) {
            birthDateValue = null;
        }
    } catch (e) {
        console.warn("Date parsing error in createStudent", e);
        birthDateValue = null;
    }

    // --- PARENT LOGIC ---
    const parts = fullName.trim().split(/\s+/);
    let parentName;
    if (parts.length > 2) {
        // "Leo Andres Messi" -> "Andres Messi"
        parentName = parts.slice(1).join(' ');
    } else if (parts.length === 2) {
        // "Leo Messi" -> "Messi" (Family name usually, acting as Parent Name placeholder)
        parentName = parts[1];
    } else {
        parentName = `Parent of ${fullName}`;
    }

    const uniqueStr = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    // Generate a more unique email to avoid growing collisions in testing
    const generatedParentEmail = `parent.${uniqueStr}.${Math.floor(Math.random() * 1000)}@peek.com`;
    const studentEmail = `student.${uniqueStr}.${Math.floor(Math.random() * 1000)}@peek.com`;
    const defaultPasswordHash = await bcrypt.hash('password123', 10);

    try {
        const targetClass = await prisma.class.findUnique({ where: { id: classId } });
        if (!targetClass) {
            return res.status(404).json({ message: "Class not found." });
        }

        const studentFee = fee ? parseFloat(fee) : parseFloat(targetClass.defaultFee || 0);

        if (nfcTagId) {
            const existingNfc = await prisma.student.findUnique({ where: { nfc_card_id: nfcTagId } });
            if (existingNfc) return res.status(409).json({ message: "NFC Tag ID already exists." });
        }

        // --- TRANSACTION ---
        const result = await prisma.$transaction(async (prisma) => {

            // 1. Parent User (Try to find existing by name? No, safer to create new for this simulation or match by email if provided)
            // For this flow, we auto-create.
            const parentUser = await prisma.user.create({
                data: {
                    fullName: parentName,
                    email: generatedParentEmail,
                    password_hash: defaultPasswordHash,
                    role: UserRole.parent,
                    schoolId,
                    isActive: true,
                    emailVerified: true
                }
            });

            // 2. Student User - REMOVED (Students do not have login)
            // const studentEmail = ... 
            // const newStudentUser = ...

            // 3. Student Profile
            const newStudent = await prisma.student.create({
                data: {
                    // userId: newStudentUser.id, <--- REMOVED
                    parentId: parentUser.id,
                    schoolId: schoolId,
                    fullName: fullName,
                    nfc_card_id: nfcTagId || undefined,
                    dob: birthDateValue,
                    // date_of_birth: birthDateValue, <--- REMOVED
                    gender: gender || 'Not Specified',
                    totalFee: studentFee,
                    balance: studentFee,
                    paid: 0
                }
            });

            // 4. Enrollment
            await prisma.studentEnrollment.create({
                data: {
                    studentId: newStudent.id,
                    classId: classId,
                    academicYearId: targetClass.academicYearId
                }
            });

            return { newStudent, parentUser };
        });

        res.status(201).json({
            student: result.newStudent,
            parent: result.parentUser,
            message: "Student created successfully."
        });

    } catch (error) {
        logger.error({ error, schoolId }, "Error creating student");
        res.status(500).json({ message: "Failed to create student. " + (error.message || "") });
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
        const csv = json22csvParser.parse(formattedStudents);

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

    // 1. Strict Sanitization (Only allow these fields)
    const { fullName, gender, dob, nfc_card_id, classId, date_of_birth } = req.body;

    try {
        const student = await prisma.student.findFirst({
            where: { id: studentId, schoolId },
            include: { enrollments: { where: { academicYear: { current: true } } } }
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found in your school." });
        }

        const dataToUpdate = {};
        if (fullName) dataToUpdate.fullName = fullName;
        if (gender) dataToUpdate.gender = gender;
        if (nfc_card_id) dataToUpdate.nfc_card_id = nfc_card_id;

        // Date Parsing
        let newDob = null;
        if (dob) newDob = new Date(dob);
        else if (date_of_birth) newDob = new Date(date_of_birth);

        if (newDob && !isNaN(newDob.getTime())) {
            dataToUpdate.dob = newDob;
        }

        // 2. Transaction
        const result = await prisma.$transaction(async (tx) => {
            // Update Core Data
            const updatedStudent = await tx.student.update({
                where: { id: studentId },
                data: dataToUpdate
            });

            // Handle Enrollment Change
            if (classId) {
                const currentEnrollment = student.enrollments[0];

                // If class changed or no enrollment exists
                if (!currentEnrollment || currentEnrollment.classId !== classId) {
                    // Check if target class exists and get its year
                    const targetClass = await tx.class.findUnique({
                        where: { id: classId },
                        select: { academicYearId: true }
                    });

                    if (targetClass) {
                        // If an enrollment exists for this year, we must delete it first (or update it) due to Unique constraint.
                        // The prompt asks to "create a new StudentEnrollment".
                        // To clear the unique constraint for the *same* year, we delete the old one.
                        if (currentEnrollment) {
                            await tx.studentEnrollment.delete({ where: { id: currentEnrollment.id } });
                        }

                        // Create NEW enrollment
                        await tx.studentEnrollment.create({
                            data: {
                                studentId,
                                classId,
                                academicYearId: targetClass.academicYearId
                            }
                        });
                    }
                }
            }

            return updatedStudent;
        });

        logger.info({ studentId: result.id, schoolId }, "Student updated successfully");
        res.status(200).json(result);

    } catch (error) {
        logger.error({ error, studentId }, "Error updating student");
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "NFC ID already in use." });
        }
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
        // Updated to use Assignments to fetch classes (since teacherProfile doesn't exist on User directly)
        const teachers = await prisma.user.findMany({
            where: { schoolId, role: UserRole.teacher, isActive: true },
            select: {
                id: true,
                fullName: true,
                email: true,
                // Include assignments to get classes
                teacherAssignments: {
                    include: {
                        class: { select: { name: true } }
                    }
                }
            }
        });

        // Map to flat format
        const result = teachers.map(t => {
            const classNames = t.teacherAssignments.map(ta => ta.class?.name).filter(Boolean);
            const uniqueClasses = [...new Set(classNames)]; // removing duplicates

            return {
                id: t.id,
                fullName: t.fullName,
                email: t.email,
                classes: uniqueClasses, // Returning array of class names strings
                subject: uniqueClasses.length > 0 ? "Mapped via Classes" : "N/A", // Deprecated/Fallback field
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
    const userId = req.user.id;
    const role = req.user.role;

    console.log("getAllClasses Check:", { userId, role, schoolId });

    try {
        let classes = [];

        // Check role case-insensitively
        if (role === 'TEACHER' || role === 'teacher') {
            console.log("Fetching classes for TEACHER...");
            const assignments = await prisma.teacherSubjectAssignment.findMany({
                where: { teacherId: userId },
                include: {
                    class: {
                        include: { academicYear: true }
                    }
                }
            });

            // Extract unique classes
            const classMap = new Map();
            assignments.forEach(a => {
                if (a.class) {
                    classMap.set(a.class.id, a.class);
                }
            });
            classes = Array.from(classMap.values());
            console.log(`Found ${classes.length} classes for teacher`);

        } else {
            // ADMIN/OTHERS: Get All Classes
            console.log("Fetching ALL classes for ADMIN...");
            classes = await prisma.class.findMany({
                where: { academicYear: { schoolId } }, // Scoped to school
                include: { academicYear: true },
                orderBy: { name: 'asc' }
            });
        }

        const formatted = classes.map(c => ({
            id: c.id,
            name: c.name,
            academicYear: c.academicYear ? c.academicYear.name : 'N/A',
            // Keeping these helpful fields as they don't break "id, name" requirement but add value
            isCurrent: c.academicYear ? c.academicYear.current : false,
            defaultFee: c.defaultFee
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