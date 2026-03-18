const { PrismaClient, UserRole, TripDirection } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// Helper to generate random consistent phone numbers
const generatePhone = (prefix, i) => `+96279${String(prefix).padStart(2, '0')}${String(i).padStart(4, '0')}`;
// Helper to generate NFC tags
const generateNfc = (prefix, i) => `NFC-${prefix}-${String(i).padStart(4, '0')}`;

async function main() {
  console.log('--- Start Realistic Seeding for Peek ---');

  // 1. Tear Down - Order Matters
  const tables = [
    'examMark', 'examSchedule', 'exam', 'attendance', 'grade', 'homework',
    'studentEnrollment', 'teacherSubjectAssignment', 'timeTableEntry',
    'class', 'subject', 'feeItem', 'invoice', 'feeStructure',
    'pOSOrderItem', 'pOSOrder', 'walletTransaction', 'canteenItem',
    'busTripEntry', 'busTrip', 'academicYear', 'student',
    'notificationPreference', 'auditLog', 'deviceToken', 'user', 'school'
  ];

  for (const table of tables) {
      if (prisma[table]) {
          await prisma[table].deleteMany();
      }
  }

  console.log('--- Database Cleared ---');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 2. Create School
  const school = await prisma.school.create({
    data: { name: 'Amman International Academy', address: 'Khalda, Amman, Jordan' },
  });
  console.log(`Created School: ${school.name}`);

  // 3. Create Admin
  const admin = await prisma.user.create({
    data: {
      fullName: 'Ahmad Director', email: 'admin@peek.com', phoneNumber: '+962790000001',
      password_hash: passwordHash, role: UserRole.school_admin, schoolId: school.id,
      emailVerified: true, isActive: true
    }
  });

  // 4. Create Teachers (10 teachers)
  const teachers = [];
  const teacherNames = ['Omar', 'Laila', 'Tareq', 'Huda', 'Rami', 'Sara', 'Zaid', 'Nour', 'Fadi', 'Mona'];
  for (let i = 0; i < 10; i++) {
      teachers.push(await prisma.user.create({
          data: {
              fullName: `${teacherNames[i]} Teacher`,
              email: `teacher${i+1}@peek.com`,
              phoneNumber: generatePhone(10, i),
              password_hash: passwordHash,
              role: UserRole.teacher,
              schoolId: school.id,
              emailVerified: true,
              isActive: true
          }
      }));
  }
  // Ensure the hardcoded teacher from old seed exists for easy login
  teachers[0] = await prisma.user.update({
    where: { id: teachers[0].id },
    data: { email: 'teacher@peek.com', fullName: 'Ms. Sarah Teacher' }
  });

  // 5. Create Parents (30 parents)
  const parents = [];
  for (let i = 0; i < 30; i++) {
      parents.push(await prisma.user.create({
          data: {
              fullName: `Parent ${i+1}`,
              email: `parent${i+1}@peek.com`,
              phoneNumber: generatePhone(20, i),
              password_hash: passwordHash,
              role: UserRole.parent,
              emailVerified: true,
              isActive: true
          }
      }));
  }
  // Hardcoded parent for easy login
  parents[0] = await prisma.user.update({
    where: { id: parents[0].id },
    data: { email: 'parent@peek.com', fullName: 'Jorge Parent' }
  });

  // 6. Academics
  const academicYear = await prisma.academicYear.create({
    data: {
      name: "2025-2026", startDate: new Date("2025-09-01"), endDate: new Date("2026-06-30"),
      schoolId: school.id, current: true,
    }
  });

  // Create Classes (Grade 1 to 5, 2 sections each)
  const classes = [];
  for (let grade = 1; grade <= 5; grade++) {
      for (const section of ['A', 'B']) {
          classes.push(await prisma.class.create({
              data: {
                  name: `Grade ${grade} ${section}`,
                  academicYearId: academicYear.id,
                  defaultFee: 1500.00 + (grade * 100) // Progressive fees
              }
          }));
      }
  }

  // Create Subjects for each class and assign a teacher
  const subjectsList = ['Mathematics', 'Science', 'English', 'Arabic', 'Art', 'Physical Education'];
  const createdSubjects = [];
  let teacherIndex = 0;

  for (const cls of classes) {
      for (const subName of subjectsList) {
          const t = teachers[teacherIndex % teachers.length];
          const subject = await prisma.subject.create({
              data: {
                  name: subName,
                  schoolId: school.id,
                  classId: cls.id,
                  teacherId: t.id
              }
          });
          createdSubjects.push(subject);
          
          await prisma.teacherSubjectAssignment.create({
            data: { teacherId: t.id, subjectId: subject.id, classId: cls.id }
          });
          
          teacherIndex++;
      }
  }

  // 7. Create Students (approx 20 per class = 200 total)
  const students = [];
  let parentIndex = 0;
  for (const cls of classes) {
      for (let i = 1; i <= 20; i++) {
          const stdParent = parents[parentIndex % parents.length];
          const isHardcodedStudent = (cls.name === 'Grade 1 A' && i === 1);
          
          const student = await prisma.student.create({
              data: {
                  fullName: isHardcodedStudent ? "Leo Messi" : `Student ${i} of ${cls.name}`,
                  schoolId: school.id,
                  parentId: stdParent.id,
                  nfc_card_id: isHardcodedStudent ? "A1B2C3D4E5" : generateNfc(cls.id.substring(0,4), i),
                  wallet_balance: Math.floor(Math.random() * 50) + 10,
                  daily_spending_limit: 5.00,
                  is_nfc_active: true,
                  totalFee: cls.defaultFee,
                  paid: Math.floor(Math.random() * cls.defaultFee),
                  balance: cls.defaultFee // Real logic would subtract paid
              }
          });
          
          await prisma.studentEnrollment.create({
              data: { studentId: student.id, classId: cls.id, academicYearId: academicYear.id }
          });
          
          students.push(student);
          parentIndex++;
      }
  }

  // 8. Timetable Entries for Grade 1 A (to populate the UI)
  const grade1A = classes[0];
  const grade1ASubjects = createdSubjects.filter(s => s.classId === grade1A.id);
  const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"];
  
  for (const day of days) {
      for (let period = 1; period <= 4; period++) {
          const startHour = 8 + (period - 1);
          const subj = grade1ASubjects[period % grade1ASubjects.length];
          
          await prisma.timeTableEntry.create({
              data: {
                  classId: grade1A.id,
                  subjectId: subj.id,
                  teacherId: subj.teacherId,
                  schoolId: school.id,
                  dayOfWeek: day,
                  startTime: `${String(startHour).padStart(2, '0')}:00`,
                  endTime: `${String(startHour).padStart(2, '0')}:45`
              }
          });
      }
  }

  // 9. Canteen Items
  await prisma.canteenItem.createMany({
    data: [
      { name: 'Orange Juice', price: 0.50, category: 'Drinks', schoolId: school.id },
      { name: 'Apple Juice', price: 0.50, category: 'Drinks', schoolId: school.id },
      { name: 'Turkey Sandwich', price: 2.00, category: 'Food', schoolId: school.id },
      { name: 'Cheese Croissant', price: 1.50, category: 'Food', schoolId: school.id },
      { name: 'Apple', price: 0.75, category: 'Fruit', schoolId: school.id },
      { name: 'Banana', price: 0.60, category: 'Fruit', schoolId: school.id }
    ]
  });

  // 10. Bus Trips (Morning & Afternoon)
  const tMorning = await prisma.busTrip.create({
    data: { schoolId: school.id, date: new Date(), direction: TripDirection.pickup, routeName: "Morning Route North", supervisorId: admin.id }
  });
  const tAfternoon = await prisma.busTrip.create({
    data: { schoolId: school.id, date: new Date(), direction: TripDirection.dropoff, routeName: "Afternoon Route North", supervisorId: admin.id }
  });

  // 11. Exams
  const exam = await prisma.exam.create({
    data: { schoolId: school.id, name: 'Midterm Spring', startDate: new Date('2026-04-01'), endDate: new Date('2026-04-10') }
  });

  // Schedule Exam for Grade 1 A Math
  const mathG1A = grade1ASubjects.find(s => s.name === 'Mathematics');
  await prisma.examSchedule.create({
    data: {
      examId: exam.id,
      classId: grade1A.id,
      subjectId: mathG1A.id,
      date: new Date('2026-04-05'),
      startTime: '09:00',
      endTime: '10:30'
    }
  });

  console.log('--- Seeding Completed Successfully ---');
  console.log('\n=== REALISTIC PEEK DB INIT ===');
  console.log(`School:       ${school.name} (ID: ${school.id})`);
  console.log(`Academy Year: ${academicYear.name}`);
  console.log(`Generated 10 Classes, 60 Subjects, 10 Teachers, 30 Parents, 200 Students.`);
  console.log(`Included Timetables, Canteen Items, Bus Trips, and Exams.`);
  
  console.log('\n=== DEMO LOGIN CREDENTIALS ===');
  console.log('All Passwords: password123');
  console.log(`ADMIN   (School Admin): admin@peek.com`);
  console.log(`TEACHER (Assigned):     teacher@peek.com`);
  console.log(`PARENT  (1 Student):    parent@peek.com`);
  console.log('===================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });