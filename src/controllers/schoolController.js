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
        logger.error({ error: error.message }, "Error creating school");
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
        logger.error({ error: error.message }, "Error creating academic year");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const createSubject = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { name, teacherId, classId } = req.body;

    if (!name || !classId) { return res.status(400).json({ message: 'Subject name and Class ID are required.' }); }

    try {
        // Validate class belongs to school (FIX-5: Unprotected createSubject)
        const classRecord = await prisma.class.findFirst({
            where: { id: classId, academicYear: { schoolId } }
        });
        if (!classRecord) {
            return res.status(404).json({ message: 'Class not found in your school.' });
        }

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
        logger.error({ error: error.message }, "Error creating subject");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const createClass = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { name, academicYearId, defaultFee } = req.body;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: 'name (string) is required.' });
    }
    if (!academicYearId || typeof academicYearId !== 'string') {
        return res.status(400).json({ message: 'academicYearId (string) is required.' });
    }

    try {
        const academicYear = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
        if (!academicYear) { return res.status(404).json({ message: 'Academic year not found in your school.' }); }

        const created = await prisma.class.create({
            data: {
                name: name.trim(),
                academicYearId,
                defaultFee: defaultFee != null ? parseFloat(defaultFee) : 0
            },
            include: {
                academicYear: true,
                _count: { select: { enrollments: true } }
            }
        });

        res.status(201).json({
            id: created.id,
            name: created.name,
            academicYearId: created.academicYearId,
            academicYear: { id: created.academicYear.id, name: created.academicYear.name },
            defaultFee: created.defaultFee,
            _count: { students: created._count?.enrollments || 0 }
        });
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'A class with this name already exists for this academic year.' }); }
        logger.error({ error: error.message }, "Error creating class");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const bcrypt = require('bcryptjs');

const createStudent = async (req, res) => {

    const schoolId = req.user.schoolId;

    // Payload: { name, classId, gender, dob, ... }
    const { name, classId, nfcTagId, date_of_birth, dob, fee, gender, parentEmail, parentPhone, initialWalletBalance } = req.body;
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
        logger.warn({ error: e.message }, "Date parsing error in createStudent");
        birthDateValue = null;
    }

    try {
        const targetClass = await prisma.class.findUnique({ where: { id: classId } });
        if (!targetClass) {
            return res.status(404).json({ message: "Class not found." });
        }

        const studentFee = fee ? parseFloat(fee) : parseFloat(targetClass.defaultFee || 0);

        if (nfcTagId) {
            const existingNfc = await prisma.student.findFirst({ where: { nfc_card_id: nfcTagId } });
            if (existingNfc) return res.status(409).json({ message: "NFC Tag ID already exists." });
        }

        // --- PARENT LOGIC ---
        let parentUser;
        let isNewParent = false;

        if (parentEmail) {
            // Try to find existing parent
            parentUser = await prisma.user.findFirst({
                where: { email: parentEmail, role: UserRole.parent, schoolId }
            });
        }

        // If no existing parent found (or no email provided), prepare to create one
        if (!parentUser) {
            isNewParent = true;
            const parts = fullName.trim().split(/\s+/);
            let parentName;
            if (parts.length > 2) {
                parentName = parts.slice(1).join(' ');
            } else if (parts.length === 2) {
                parentName = parts[1];
            } else {
                parentName = `Parent of ${fullName}`;
            }

            let finalParentEmail = parentEmail;
            if (!finalParentEmail) {
                const uniqueStr = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
                finalParentEmail = `parent.${uniqueStr}.${Math.floor(Math.random() * 1000)}@peek.com`;
            }

            const defaultPasswordHash = await bcrypt.hash('password123', 10);

            // We defer creation to transaction to ensure atomicity
            parentUser = {
                fullName: parentName,
                email: finalParentEmail,
                password_hash: defaultPasswordHash,
                role: UserRole.parent,
                schoolId,
                isActive: true,
                emailVerified: true,
                phoneNumber: parentPhone || undefined
            };
        }

        // --- TRANSACTION ---
        const result = await prisma.$transaction(async (prisma) => {

            let finalParentId;
            let finalParentUser = parentUser;

            if (isNewParent) {
                // Check if email taken by non-parent or parent in another context (though we scoped by school above, email is unique global usually)
                // actually email is @unique in schema. So strictly unique.
                const checkEmail = await prisma.user.findUnique({ where: { email: parentUser.email } });
                if (checkEmail) {
                    // If we are here, it means we didn't find a parent with this email in THIS school (from findFirst above),
                    // BUT it exists globally (or maybe we didn't search properly). 
                    // Or user passed an email that exists but is not a parent role?
                    // Verify role.
                    if (checkEmail.role !== UserRole.parent) {
                        throw new Error(`Email ${parentUser.email} is already is use by a non-parent user.`);
                    }
                    // If it exists and IS a parent, maybe they are in another school?
                    // If so, we might want to link global parent? Schema allows User.schoolId to be nullable or specific.
                    // For now, if exact email match exists, let's use it.
                    finalParentId = checkEmail.id;
                    finalParentUser = checkEmail;
                } else {
                    const createdParent = await prisma.user.create({ data: parentUser });
                    finalParentId = createdParent.id;
                    finalParentUser = createdParent;
                }
            } else {
                finalParentId = parentUser.id;
            }

            // 3. Student Profile
            const newStudent = await prisma.student.create({
                data: {
                    parentId: finalParentId,
                    schoolId: schoolId,
                    fullName: fullName,
                    nfc_card_id: nfcTagId || undefined,
                    dob: birthDateValue,
                    gender: gender || 'Not Specified',
                    totalFee: studentFee,
                    balance: studentFee,
                    paid: 0,
                    wallet_balance: initialWalletBalance ? parseFloat(initialWalletBalance) : 0
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

            // FIX-6: Audit Log (Student Creation)
            const { logAudit } = require('../utils/auditLogger');
            await logAudit(prisma, { // transaction client is 'prisma' here due to variable naming
                userId: req.user.id,
                userEmail: req.user.email,
                actionType: 'CREATE_STUDENT',
                details: { studentId: newStudent.id, parentUserId: finalParentId },
                schoolId: schoolId
            });

            return { newStudent, parentUser: finalParentUser };
        });

        res.status(201).json({
            student: result.newStudent,
            parent: result.parentUser,
            message: "Student created successfully."
        });

    } catch (error) {
        logger.error({ error, schoolId }, "Error creating student");
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "Unique constraint failed (Email or NFC or ID)." });
        }
        res.status(500).json({ message: "Failed to create student. " + (error.message || "") });
    }
};

const createTeacher = async (req, res) => {
    const schoolId = req.user.schoolId;
    // START DEBUG LOG
    logger.info({ body: req.body }, "createTeacher Request Body");
    // END DEBUG LOG

    let { fullName, email, password, phoneNumber, phone, subject, classId, assignments, nfc_card_id, nfcTagId } = req.body;

    // Normalize Phone
    if (phone && !phoneNumber) phoneNumber = phone;

    // Normalize NFC
    if (nfcTagId && !nfc_card_id) nfc_card_id = nfcTagId;

    // assignments expectation: [{ classId: '...', subjects: ['Math', 'Physics'] }, { classId: '...', subjects: ['Biology'] }]

    if (!fullName || !email) {
        return res.status(400).json({ message: "Full name and email are required." });
    }

    try {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(409).json({ message: "Email already exists." });

        // Password Logic: If missing, generate defaults
        let finalPassword = password;
        if (!finalPassword) {
            // Generate random password or default
            // const randomString = Math.random().toString(36).slice(-8);
            finalPassword = "Teacher@123"; // Simplistic default or random
        }
        const hashedPassword = await bcrypt.hash(finalPassword, 10);

        // NFC Check
        if (nfc_card_id) {
            // Check if NFC used by another USER in this school (or global? Schema unique on school+nfc for Student, but User is global-ish)
            // Schema added nfc_card_id to User, not unique constraint there yet in my plan, but ideally should be.
            // Let's check manually to avoid P2002 if we added unique.
            const existingNfc = await prisma.user.findFirst({ where: { nfc_card_id, schoolId } });
            if (existingNfc) return res.status(409).json({ message: "NFC Card ID already assigned to another user." });
        }

        // Transaction to ensure User creation and assignments all succeed
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create User
            const newTeacher = await tx.user.create({
                data: {
                    fullName,
                    email,
                    phoneNumber, // Add phoneNumber
                    nfc_card_id: nfc_card_id || undefined, // Add NFC
                    password_hash: hashedPassword,
                    role: UserRole.teacher,
                    schoolId,
                    isActive: true
                }
            });

            // 2. Prepare assignments list
            // Backward compatibility: If top-level classId and subject provided, add them to list
            let assignmentsToProcess = [];
            if (assignments && Array.isArray(assignments)) {
                assignmentsToProcess = assignments;
            } else if (classId && subject) {
                // Legacy support for single assignment
                const subjects = Array.isArray(subject) ? subject : [subject];
                assignmentsToProcess.push({ classId, subjects });
            }

            logger.info({ assignmentsToProcess, classId, subject }, "Processing teacher assignments");

            // 3. Process Assignments
            for (const assign of assignmentsToProcess) {
                const { classId: cId, subjects, subjectIds } = assign;

                if (!cId) continue;
                if ((!subjects || subjects.length === 0) && (!subjectIds || subjectIds.length === 0)) continue;

                // Validate class belongs to school
                const classRecord = await tx.class.findFirst({
                    where: { id: cId, academicYear: { schoolId } }
                });

                if (!classRecord) {
                    logger.warn({ schoolId, cId }, "Class not found during teacher creation, skipping.");
                    continue;
                }

                // A. Handle subjectIds (Direct ID Link)
                if (subjectIds && Array.isArray(subjectIds)) {
                    for (const sId of subjectIds) {
                        const subjectRecord = await tx.subject.findFirst({
                            where: { id: sId, classId: cId }
                        });

                        if (subjectRecord) {
                            await tx.subject.update({
                                where: { id: subjectRecord.id },
                                data: { teacherId: newTeacher.id }
                            });

                            // Enforce Single Teacher: Remove ANY existing assignments for this subject
                            await tx.teacherSubjectAssignment.deleteMany({
                                where: { subjectId: subjectRecord.id }
                            });

                            // Create or update assignment
                            await tx.teacherSubjectAssignment.create({
                                data: { teacherId: newTeacher.id, subjectId: subjectRecord.id, classId: cId }
                            });
                        }
                    }
                }

                // B. Handle subjects (Names)
                if (subjects && Array.isArray(subjects)) {
                    for (const subjName of subjects) {
                        logger.info({ subjName, cId }, "Processing subject assignment");
                        // Try to find subject in this class
                        let subjectRecord = await tx.subject.findFirst({
                            where: { classId: cId, name: { equals: subjName, mode: 'insensitive' } }
                        });

                        // Update existing subject's teacher
                        if (subjectRecord) {
                            await tx.subject.update({
                                where: { id: subjectRecord.id },
                                data: { teacherId: newTeacher.id }
                            });

                            // Enforce Single Teacher: Remove ANY existing assignments for this subject
                            await tx.teacherSubjectAssignment.deleteMany({
                                where: { subjectId: subjectRecord.id }
                            });

                            // Create Assignment Link
                            await tx.teacherSubjectAssignment.create({
                                data: { teacherId: newTeacher.id, subjectId: subjectRecord.id, classId: cId }
                            });
                        } else {
                            // Create Subject
                            const newSubject = await tx.subject.create({
                                data: {
                                    name: subjName,
                                    schoolId,
                                    classId: cId,
                                    teacherId: newTeacher.id
                                }
                            });

                            // Create Assignment Link
                            await tx.teacherSubjectAssignment.create({
                                data: { teacherId: newTeacher.id, subjectId: newSubject.id, classId: cId }
                            });
                        }
                    }
                }
            }

            return newTeacher;
        });

        // FIX-6: Audit Log
        const { logAudit } = require('../utils/auditLogger');
        await logAudit(null, {
            userId: req.user.id,
            userEmail: req.user.email,
            actionType: 'CREATE_TEACHER',
            details: { teacherId: result.id, fullName },
            schoolId
        });

        logger.info({ teacherId: result.id, schoolId }, "Teacher created with assignments");
        res.status(201).json(result);

    } catch (error) {
        logger.error({ error, schoolId, email }, "Error creating teacher");
        res.status(500).json({ message: "Failed to create teacher." });
    }
};

const updateTeacher = async (req, res) => {
    const { teacherId } = req.params;
    const schoolId = req.user.schoolId;

    // START DEBUG LOG
    logger.info({ body: req.body, teacherId }, "updateTeacher Request Body");
    // END DEBUG LOG

    let { fullName, email, phoneNumber, phone, subject, classId, assignments, nfc_card_id, nfcTagId } = req.body;

    // Normalize Phone
    if (phone && !phoneNumber) phoneNumber = phone;

    // Normalize NFC
    if (nfcTagId && !nfc_card_id) nfc_card_id = nfcTagId;

    try {
        // Verify teacher belongs to this school
        const existingTeacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId } });
        if (!existingTeacher) {
            return res.status(404).json({ message: "Teacher not found in your school." });
        }

        // NFC Uniqueness Check (if changed)
        if (nfc_card_id && nfc_card_id !== existingTeacher.nfc_card_id) {
            const existingNfc = await prisma.user.findFirst({ where: { nfc_card_id, schoolId } });
            if (existingNfc) return res.status(409).json({ message: "NFC Card ID already assigned to another user." });
        }

        // Update User Profile
        const updatedTeacher = await prisma.user.update({
            where: { id: teacherId },
            data: {
                fullName,
                email,
                phoneNumber, // Add phoneNumber
                nfc_card_id: nfc_card_id
            }
        });

        // 2. Prepare assignments list
        // Backward compatibility
        let assignmentsToProcess = [];
        if (assignments && Array.isArray(assignments)) {
            assignmentsToProcess = assignments;
        } else if (classId && subject) {
            const subjects = Array.isArray(subject) ? subject : [subject];
            assignmentsToProcess.push({ classId, subjects });
        }

        logger.info({ assignmentsToProcess, teacherId, classId, subject }, "Processing teacher update assignments");

        // 3. Process Assignments
        for (const assign of assignmentsToProcess) {
            const { classId: cId, subjects, subjectIds } = assign;

            if (!cId) continue;
            if ((!subjects || subjects.length === 0) && (!subjectIds || subjectIds.length === 0)) continue;

            const classRecord = await prisma.class.findFirst({
                where: { id: cId, academicYear: { schoolId } }
            });

            if (!classRecord) continue;

            // A. Handle subjectIds (Direct ID Link)
            if (subjectIds && Array.isArray(subjectIds)) {
                for (const sId of subjectIds) {
                    const subjectRecord = await prisma.subject.findFirst({
                        where: { id: sId, classId: cId }
                    });

                    if (subjectRecord) {
                        await prisma.subject.update({
                            where: { id: subjectRecord.id },
                            data: { teacherId }
                        });
                        // Create or update assignment
                        await prisma.teacherSubjectAssignment.upsert({
                            where: { teacherId_subjectId_classId: { teacherId, subjectId: subjectRecord.id, classId: cId } },
                            update: {},
                            create: { teacherId, subjectId: subjectRecord.id, classId: cId }
                        });
                    }
                }
            }

            // B. Handle names
            if (subjects && Array.isArray(subjects)) {
                for (const subjName of subjects) {
                    logger.info({ subjName, cId }, "Processing subject assignment update");
                    let subjectRecord = await prisma.subject.findFirst({
                        where: { classId: cId, name: { equals: subjName, mode: 'insensitive' } }
                    });

                    if (subjectRecord) {
                        await prisma.subject.update({
                            where: { id: subjectRecord.id },
                            data: { teacherId }
                        });

                        // Enforce Single Teacher: Remove ANY existing assignments for this subject
                        await prisma.teacherSubjectAssignment.deleteMany({
                            where: { subjectId: subjectRecord.id }
                        });

                        await prisma.teacherSubjectAssignment.create({
                            data: { teacherId, subjectId: subjectRecord.id, classId: cId }
                        });
                    } else {
                        const newSubject = await prisma.subject.create({
                            data: { name: subjName, schoolId, classId: cId, teacherId }
                        });
                        await prisma.teacherSubjectAssignment.create({
                            data: { teacherId, subjectId: newSubject.id, classId: cId }
                        });
                    }
                }
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
    const schoolId = req.user.schoolId;
    try {
        const teacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId } });
        if (!teacher) {
            return res.status(404).json({ message: "Teacher not found in your school." });
        }
        await prisma.user.delete({ where: { id: teacherId } });

        // FIX-6: Audit Log
        const { logAudit } = require('../utils/auditLogger');
        await logAudit(null, {
            userId: req.user.id,
            userEmail: req.user.email,
            actionType: 'DELETE_TEACHER',
            details: { teacherId },
            schoolId
        });

        res.status(204).send();
    } catch (error) {
        logger.error({ error, teacherId }, "Error deleting teacher");
        res.status(500).json({ message: "Failed to delete teacher." });
    }
};

const deleteClass = async (req, res) => {
    const { classId } = req.params;
    const schoolId = req.user.schoolId;
    try {
        const classRecord = await prisma.class.findFirst({
            where: { id: classId, academicYear: { schoolId } }
        });
        if (!classRecord) {
            return res.status(404).json({ message: "Class not found in your school." });
        }
        await prisma.class.delete({ where: { id: classId } });

        // FIX-6: Audit Log
        const { logAudit } = require('../utils/auditLogger');
        await logAudit(null, {
            userId: req.user.id,
            userEmail: req.user.email,
            actionType: 'DELETE_CLASS',
            details: { classId, className: classRecord.name },
            schoolId
        });

        res.status(204).send();
    } catch (error) {
        logger.error({ error, classId }, "Error deleting class");
        res.status(500).json({ message: "Failed to delete class." });
    }
};

const updateClass = async (req, res) => {
    const { classId } = req.params;
    const schoolId = req.user.schoolId;
    const { name, academicYearId, defaultFee } = req.body;

    try {
        const classRecord = await prisma.class.findFirst({
            where: { id: classId, academicYear: { schoolId } }
        });
        if (!classRecord) {
            return res.status(404).json({ message: "Class not found in your school." });
        }

        // Build update payload — only include provided fields
        const data = {};
        if (name !== undefined) data.name = name.trim();
        if (academicYearId !== undefined) {
            // Verify the new academic year also belongs to this school
            const ay = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
            if (!ay) { return res.status(404).json({ message: 'Academic year not found in your school.' }); }
            data.academicYearId = academicYearId;
        }
        if (defaultFee !== undefined) data.defaultFee = parseFloat(defaultFee);

        const updated = await prisma.class.update({
            where: { id: classId },
            data,
            include: {
                academicYear: true,
                _count: { select: { enrollments: true } }
            }
        });

        res.status(200).json({
            id: updated.id,
            name: updated.name,
            academicYearId: updated.academicYearId,
            academicYear: updated.academicYear ? { id: updated.academicYear.id, name: updated.academicYear.name } : null,
            defaultFee: updated.defaultFee,
            _count: { students: updated._count?.enrollments || 0 }
        });
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'A class with this name already exists for this academic year.' }); }
        logger.error({ error, classId }, "Error updating class");
        res.status(500).json({ message: "Failed to update class." });
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
        logger.error({ error: error.message }, "Error enrolling student");
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
        logger.error({ error: error.message }, "Error exporting students");
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
        const teachers = await prisma.user.findMany({
            where: { schoolId, role: UserRole.teacher, isActive: true },
            select: {
                id: true,
                fullName: true,
                email: true,
                phoneNumber: true,
                nfc_card_id: true,
                // Include assignments to get classes and subjects
                teacherAssignments: {
                    include: {
                        class: { select: { name: true } },
                        subject: { select: { name: true } }
                    }
                }
            }
        });

        // Map to requested format
        const result = teachers.map(t => {
            // Map assignments to { className, subjectName }
            const assignments = t.teacherAssignments.map(ta => ({
                className: ta.class?.name || "Unknown Class",
                subjectName: ta.subject?.name || "Unknown Subject"
            }));

            return {
                id: t.id,
                fullName: t.fullName,
                email: t.email,
                phone: t.phoneNumber || 'N/A', // Map to phone
                nfcTagId: t.nfc_card_id || 'N/A', // Map to nfcTagId
                assignments: assignments // Detailed assignments list
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



    try {
        let classes = [];

        // Check role case-insensitively
        if (role === 'TEACHER' || role === 'teacher') {

            const assignments = await prisma.teacherSubjectAssignment.findMany({
                where: { teacherId: userId },
                include: {
                    class: {
                        include: {
                            academicYear: true,
                            _count: { select: { enrollments: true } }
                        }
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


        } else {
            // ADMIN/OTHERS: Get All Classes

            classes = await prisma.class.findMany({
                where: { academicYear: { schoolId } }, // Scoped to school
                include: {
                    academicYear: true,
                    _count: { select: { enrollments: true } } // Fetch student count from ENROLLMENTS
                },
                orderBy: { name: 'asc' }
            });
        }

        const formatted = classes.map(c => ({
            id: c.id,
            name: c.name,
            academicYearId: c.academicYearId, // REQUIRED for Editing
            academicYear: c.academicYear ? {
                id: c.academicYear.id,
                name: c.academicYear.name
            } : null,  // REQUIRED as Object
            defaultFee: c.defaultFee,
            _count: {
                students: c._count?.enrollments || 0 // Use enrollments count
            }
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
                parentId: true, // Return parent ID
                parent: {
                    select: {
                        fullName: true,
                        email: true
                    }
                },
                enrollments: {
                    where: { academicYear: { current: true } },
                    include: { class: { select: { name: true } } }
                }
            }
        });

        const formatted = students.map(s => ({
            id: s.id,
            name: s.fullName,
            class: s.enrollments[0]?.class?.name || 'Unassigned',
            parentId: s.parentId,
            parentName: s.parent?.fullName,
            parentEmail: s.parent?.email
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
    getAllClasses, getStudents, updateTeacher, deleteTeacher, deleteClass, updateClass
};