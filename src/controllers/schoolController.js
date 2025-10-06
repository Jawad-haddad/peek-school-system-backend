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
    if (!name || !startDate || !endDate) { return res.status(400).json({ message: 'Name, start date, and end date are required.'}); }
    
    try {
        const newYear = await prisma.academicYear.create({ data: { name, startDate: new Date(startDate), endDate: new Date(endDate), schoolId } });
        res.status(201).json(newYear);
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'An academic year with this name already exists for your school.'}); }
        console.error(error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const createSubject = async (req, res) => {
  const schoolId = req.user.schoolId;
  const { name } = req.body;
  if (!name) { return res.status(400).json({ message: 'Subject name is required.' }); }

  try {
    const newSubject = await prisma.subject.create({ data: { name, schoolId } });
    res.status(201).json(newSubject);
  } catch (error) {
    if (error.code === 'P2002') { return res.status(409).json({ message: 'A subject with this name already exists for your school.'}); }
    console.error(error);
    res.status(500).json({ message: 'Something went wrong.' });
  }
};

const createClass = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { name, academicYearId } = req.body;
    if (!name || !academicYearId) { return res.status(400).json({ message: 'Class name and academic year ID are required.'}); }
    
    try {
        const academicYear = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId }});
        if (!academicYear) { return res.status(404).json({ message: 'Academic year not found in your school.'}); }
        
        const newClass = await prisma.class.create({ data: { name, academicYearId }});
        res.status(201).json(newClass);
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'A class with this name already exists for this academic year.'}); }
        console.error(error);
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const addStudentToSchool = async (req, res) => {
  const schoolId = req.user.schoolId;
  const { fullName, parentId, date_of_birth, nfc_card_id } = req.body;
  if (!fullName || !parentId) { return res.status(400).json({ message: 'Student full name and parent ID are required.' }); }

  try {
    const parent = await prisma.user.findFirst({ where: { id: parentId, role: 'parent' } });
    if (!parent) { return res.status(404).json({ message: 'Parent user not found.' }); }
    
    const newStudent = await prisma.student.create({ 
        data: { 
            fullName, 
            parentId, 
            schoolId,
            date_of_birth: date_of_birth ? new Date(date_of_birth) : null,
            nfc_card_id
        } 
    });
    res.status(201).json(newStudent);
  } catch (error) {
    if (error.code === 'P2002') { return res.status(409).json({ message: 'The provided NFC card ID is already in use.'}); }
    console.error(error);
    res.status(500).json({ message: 'Something went wrong.' });
  }
};

const enrollStudentInClass = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { studentId, classId } = req.body;
    if (!studentId || !classId) { return res.status(400).json({ message: 'Student ID and class ID are required.' }); }
    
    try {
        const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
        const classToEnroll = await prisma.class.findFirst({ 
            where: { id: classId, academicYear: { schoolId: schoolId, isActive: true } }
        });

        if (!student || !classToEnroll) { return res.status(404).json({ message: 'Student or active class not found in your school.' }); }
        
        const enrollment = await prisma.studentEnrollment.create({ data: { studentId, classId, academicYearId: classToEnroll.academicYearId }});
        res.status(200).json({ message: 'Student enrolled successfully.', enrollment });
    } catch (error) {
        if (error.code === 'P2002') { return res.status(409).json({ message: 'Student is already enrolled for this academic year.'}); }
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
                      phoneNumber: true // <-- جلب رقم هاتف ولي الأمر
                  }
              },
              enrollments: {
                  where: { academicYear: { isActive: true } },
                  select: { class: { select: { name: true } } }
              }
          }
      });

      // Flatten the data and add new fields
      const formattedStudents = students.map(student => ({
          studentName: student.fullName,
          dateOfBirth: student.date_of_birth ? student.date_of_birth.toISOString().split('T')[0] : 'N/A', // <-- إضافة تاريخ الميلاد
          parentName: student.parent.fullName,
          parentEmail: student.parent.email,
          parentPhone: student.parent.phoneNumber || 'N/A', // <-- إضافة رقم هاتف ولي الأمر
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

/**
* Deletes a student from the school.
* Accessible by: school_admin
*/
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
      res.status(204).send(); // 204 No Content is standard for successful deletion
  } catch (error) {
      logger.error({ error, studentId }, "Error deleting student");
      res.status(500).json({ message: "Failed to delete student." });
  }
};

module.exports = {
  createSchool, addStudentToSchool, createAcademicYear, createSubject, createClass,
  enrollStudentInClass, exportStudentsToCsv, updateStudent, deleteStudent
};