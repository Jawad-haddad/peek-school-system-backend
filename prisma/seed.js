const { PrismaClient, UserRole, TripDirection } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Start Seeding for Peek Demo (Golden Path) ---');

  // 1. Tear Down - Order Matters because of cascading relations or restrictions
  // Most are CASCADE, but safer to delete in reverse order of creation logic
  await prisma.examMark.deleteMany();
  await prisma.examSchedule.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.homework.deleteMany();
  await prisma.studentEnrollment.deleteMany();
  await prisma.teacherSubjectAssignment.deleteMany();
  await prisma.timeTableEntry.deleteMany();
  await prisma.class.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.feeItem.deleteMany();
  await prisma.invoice.deleteMany(); // Cascade deletes payments
  await prisma.feeStructure.deleteMany();
  await prisma.pOSOrderItem.deleteMany();
  await prisma.pOSOrder.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.canteenItem.deleteMany();
  await prisma.busTripEntry.deleteMany();
  await prisma.busTrip.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.student.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.school.deleteMany();

  console.log('--- Database Cleared ---');

  // const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', 10);

  // 2. Create School
  const school = await prisma.school.create({
    data: { name: 'Peek Kindergarten', address: 'Downtown, Amman' },
  });
  console.log(`Created School: ${school.name}`);

  // 3. Create Users
  // Admin
  const admin = await prisma.user.create({
    data: {
      fullName: 'School Admin',
      email: 'admin@peek.com',
      password_hash: passwordHash,
      role: UserRole.school_admin,
      schoolId: school.id,
      emailVerified: true,
      isActive: true
    }
  });

  // Teacher
  const teacher = await prisma.user.create({
    data: {
      fullName: 'Ms. Sarah Teacher',
      email: 'teacher@peek.com',
      password_hash: passwordHash,
      role: UserRole.teacher,
      schoolId: school.id,
      emailVerified: true,
      isActive: true
    }
  });

  // Parent
  const parent = await prisma.user.create({
    data: {
      fullName: 'Jorge Parent',
      email: 'parent@peek.com',
      password_hash: passwordHash,
      role: UserRole.parent,
      emailVerified: true,
      isActive: true
    }
  });

  // 4. Academics
  const academicYear = await prisma.academicYear.create({
    data: {
      name: "2025-2026",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-06-30"),
      schoolId: school.id,
      current: true,
    }
  });

  const classStars = await prisma.class.create({
    data: {
      name: "Class A",
      academicYearId: academicYear.id,
      defaultFee: 500.00 // Added defaultFee
    }
  });

  const subjectMath = await prisma.subject.create({
    data: {
      name: "Math",
      schoolId: school.id,
      classId: classStars.id, // Linked to Class
      teacherId: teacher.id
    }
  });

  const subjectArt = await prisma.subject.create({
    data: {
      name: "Art",
      schoolId: school.id,
      classId: classStars.id, // Linked to Class 
      teacherId: teacher.id
    }
  });

  // Assign Teacher (Relation kept for many-to-many if needed, but redundant with simple link now)
  // Logic updated: Subject is now class-specific. Assignment is good for "who teaches this subject instance?"
  // But our simple model put teacherId directly on Subject. 
  // We will keep assignment for structure if existing code relies on it (it does for chat/grades).
  await prisma.teacherSubjectAssignment.create({
    data: { teacherId: teacher.id, subjectId: subjectMath.id, classId: classStars.id }
  });
  await prisma.teacherSubjectAssignment.create({
    data: { teacherId: teacher.id, subjectId: subjectArt.id, classId: classStars.id }
  });

  // 5. Student
  const student = await prisma.student.create({
    data: {
      fullName: "Leo Messi",
      schoolId: school.id,
      parentId: parent.id,
      nfc_card_id: "A1B2C3D4E5",
      wallet_balance: 50.00,
      daily_spending_limit: 10.00,
      is_nfc_active: true,
      totalFee: 500.00,
      paid: 0,
      balance: 500.00
    }
  });

  await prisma.studentEnrollment.create({
    data: { studentId: student.id, classId: classStars.id, academicYearId: academicYear.id }
  });

  // 6. Canteen Items
  await prisma.canteenItem.createMany({
    data: [
      { name: 'Juice', price: 0.50, category: 'Drinks', schoolId: school.id },
      { name: 'Sandwich', price: 2.00, category: 'Food', schoolId: school.id },
      { name: 'Apple', price: 0.75, category: 'Fruit', schoolId: school.id }
    ]
  });

  // 7. Bus Trip
  const trip = await prisma.busTrip.create({
    data: {
      schoolId: school.id,
      date: new Date(), // Today
      direction: TripDirection.pickup,
      routeName: "Morning Route A",
      supervisorId: admin.id // Using admin as supervisor for simplicity
    }
  });

  // 8. Exam
  const exam = await prisma.exam.create({
    data: { schoolId: school.id, name: 'Midterm Spring', startDate: new Date('2026-04-01'), endDate: new Date('2026-04-10') }
  });

  await prisma.examSchedule.create({
    data: {
      examId: exam.id,
      classId: classStars.id,
      subjectId: subjectMath.id,
      date: new Date('2026-04-05'),
      startTime: '09:00',
      endTime: '10:30'
    }
  });

  console.log('--- Seeding Completed Successfully ---');
  console.log('\n=== PEEK MVP DEMO DATA MAP ===');
  console.log(`School:       ${school.name} (ID: ${school.id})`);
  console.log(`Academy Year: ${academicYear.name} (ID: ${academicYear.id})`);
  console.log(`Class:        ${classStars.name} (ID: ${classStars.id})`);
  console.log(`Subject 1:    ${subjectMath.name} (ID: ${subjectMath.id})`);
  console.log(`Subject 2:    ${subjectArt.name} (ID: ${subjectArt.id})`);
  console.log(`Student:      ${student.fullName} (ID: ${student.id} | NFC: ${student.nfc_card_id})`);

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