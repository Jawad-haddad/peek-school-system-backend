const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Start Seeding (Final Version with All Users) ---');

  const salt = await bcrypt.genSalt(10);

  // 1. Create School
  const school = await prisma.school.create({
    data: { name: 'Al-Mustaqbal International School', address: 'Amman, Jordan' },
  });

  // 2. Create Users
  const schoolAdmin = await prisma.user.create({
    data: {
      fullName: 'School Principal',
      email: 'principal@almustaqbal.com',
      password_hash: await bcrypt.hash('principalpassword', salt),
      role: UserRole.school_admin,
      schoolId: school.id,
      emailVerified: true,
    },
  });

  const teacher = await prisma.user.create({
    data: {
      fullName: 'Ahmad Al-Saleh',
      email: 'teacher.ahmad@almustaqbal.com',
      password_hash: await bcrypt.hash('teacherpassword', salt),
      role: UserRole.teacher,
      schoolId: school.id,
      emailVerified: true,
    },
  });

  const parent = await prisma.user.create({
    data: {
      fullName: 'Jawad Haddad',
      email: 'jawad.parent@email.com',
      phoneNumber: '0791234567',
      password_hash: await bcrypt.hash('parentpassword', salt),
      role: UserRole.parent,
      emailVerified: true,
    },
  });

  // 3. Create Student
  const student = await prisma.student.create({
    data: {
       fullName: "Omar Haddad",
       date_of_birth: new Date("2010-05-15"),
       schoolId: school.id,
       parentId: parent.id,
       nfc_card_id: "NFC_OMAR_123",
       wallet_balance: 50.00
    }
  });

  // 4. Create Academic Entities
  const academicYear = await prisma.academicYear.create({
      data: {
        name: "2025-2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-06-30"),
        schoolId: school.id,
        isActive: true,
      }
  });

  const subject = await prisma.subject.create({
    data: { name: "Mathematics", schoolId: school.id },
  });

  const aClass = await prisma.class.create({
    data: { name: "Grade 10 - A", academicYearId: academicYear.id },
  });

  // 5. Enroll Student
  await prisma.studentEnrollment.create({
    data: { studentId: student.id, classId: aClass.id, academicYearId: academicYear.id }
  });

  // 6. Assign Teacher to Class/Subject
  await prisma.teacherSubjectAssignment.create({
      data: {
          teacherId: teacher.id,
          subjectId: subject.id,
          classId: aClass.id
      }
  });

  // 7. Create a Homework assignment
  const homework = await prisma.homework.create({
      data: {
          title: "Math Homework Chapter 1",
          description: "Solve exercises 1 to 10.",
          dueDate: new Date("2025-09-15"),
          classId: aClass.id,
          subjectId: subject.id,
      }
  });

  // 8. Create Canteen Items
  const sandwich = await prisma.canteenItem.create({
      data: {
          name: 'Chicken Sandwich',
          price: 1.50,
          category: 'Food',
          schoolId: school.id
      }
  });

  const juice = await prisma.canteenItem.create({
      data: {
          name: 'Orange Juice',
          price: 0.50,
          category: 'Drinks',
          schoolId: school.id
      }
  });

  console.log('--- Seeding Finished Successfully ---');
  console.log('\n✅ --- TEST DATA AND IDs ---');
  console.log(`- STUDENT_ID: ${student.id}`);
  console.log(`- HOMEWORK_ID: ${homework.id}`);
  console.log(`- ACADEMIC_YEAR_ID: ${academicYear.id}`);
  console.log(`- PARENT_EMAIL: ${parent.email} (Password: parentpassword)`);
  console.log(`- TEACHER_EMAIL: ${teacher.email} (Password: teacherpassword)`);
  console.log(`- SCHOOL_ADMIN_EMAIL: ${schoolAdmin.email} (Password: principalpassword)`);
  console.log(`- CLASS_ID: ${aClass.id}`);
  console.log(`- SUBJECT_ID: ${subject.id}`);
  console.log(`- SANDWICH_ID: ${sandwich.id}`);
  console.log(`- JUICE_ID: ${juice.id}`);
  console.log('---------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });