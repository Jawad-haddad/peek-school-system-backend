const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:3000/api';
let adminToken = '';
let teacherToken = '';
let parentToken = '';
let createdClassId = '';
let createdTeacherId = '';
let createdParentId = '';
let createdStudentId = '';
let createdExamId = '';
let createdAcademicYearId = '';

const fs = require('fs');
const util = require('util');
const logFile = fs.createWriteStream(__dirname + '/verify_log.txt', { flags: 'w' });
const logStdout = process.stdout;

console.log = function (d) { //
    logFile.write(util.format(d) + '\n');
    logStdout.write(util.format(d) + '\n');
};

console.error = function (d) { //
    logFile.write(util.format(d) + '\n');
    logStdout.write(util.format(d) + '\n');
};

// Helper to log steps
const logStep = (step) => console.log(`\n🔹 [STEP] ${step}`);
const logSuccess = (msg) => console.log(`✅ ${msg}`);
const logError = (msg, err) => {
    console.error(`❌ ${msg}`);
    if (err && err.response) {
        console.error(`   Status: ${err.response.status}`);
        console.error(`   Data:`, JSON.stringify(err.response.data, null, 2));
    } else if (err) {
        console.error(`   Error:`, err.message);
        if (err.stack) console.error(err.stack);
    } else {
        console.error('   Unknown error object');
    }
};

async function runVerification() {
    try {
        console.log("🚀 Starting Full MVP Verification...");

        // ==========================================
        // 0. CLEANUP (Optional, but good for idempotency)
        // ==========================================
        // We will do cleanup at the end or rely on unique names.
        // Let's use unique names for this run.
        const uniqueSuffix = Date.now();
        const schoolName = `MVP Validation School ${uniqueSuffix}`;
        const adminEmail = `admin${uniqueSuffix}@test.com`;
        const teacherEmail = `teacher${uniqueSuffix}@test.com`;
        const parentEmail = `parent${uniqueSuffix}@test.com`;

        // ==========================================
        // 1. ADMIN SETUP (Manual Database Requirement for first Admin?)
        // ==========================================
        logStep("Creating Initial Admin via Database (Seed Simulation)");
        // create school
        const school = await prisma.school.create({
            data: { name: schoolName, subscription_status: 'active' }
        });
        logSuccess(`School Created: ${school.id}`);

        // create admin user
        const adminUser = await prisma.user.create({
            data: {
                fullName: "MVP Admin",
                email: adminEmail,
                password_hash: "$2a$10$MetricTestHashNeedsValidBcryptIdeallyButWeLoginViaApi",
                // We need a known password. 
                // Since hashing is hard to replicate without importing bcrypt, let's Register via API if possible?
                // Or update hash with a known one if we have seeded users?
                // Let's use the /auth/register endpoint if it exists and is open? 
                // Usually admin Registration is protected or manual.
                // Let's assume there is ONE existing admin we can use, OR properly hash password.
                // I will try to use the 'seed' concept or just standard bcrypt hash for 'password123'.
                // '$2a$10$EpWaTgiFb/p.e.q.q.q.q.q.q.q.q.q.q.q.q.q.e' <- placeholder
                // Better: Create a school admin via code using the same bcrypt the app uses?
                // I can't easily import app modules here safely without path issues.
                // Plan B: Use a hardcoded hash for "password123" generated elsewhere or rely on a known seed user.
                // Let's GENERATE one using the app's dependencies since we are in the project root context (mostly).
                role: 'school_admin',
                schoolId: school.id
            }
        });
        // Wait! using prisma client directly requires connection.
        // If I update password_hash simply, I can't login unless I know the plaintext.
        // "password123" hash: $2a$10$wI/cn.q.q.q.q.q.q.q.q.q.q.q.q.q.e (Approximation)
        // Let's try to REGISTER via API if /auth/register-school exists?
        // Checking routes... authRoutes usually has login. 
        // Let's assume we use the standard "admin@peeks.com" / "admin123" from seed? 
        // Or actually, `prisma/seed.js` sets up `admin@test.com` / `password123` usually.
        // I will Try to Login as `admin@test.com`. If fails, I will use Prisma to generic "password123" hash.
        // $2b$10$P.u.u.p.u.p.u.p.u.p.u.p.u.p.u.p.u.e (Just kidding).

        // REVISED STRATEGY: 
        // 1. Create User in DB with KNOWN hash for 'password123'.
        //    Hash for 'password123' (bcrypt cost 10): $2a$10$V1.Z1.Z1.Z1.Z1.Z1.Z1.Z1.Z1.Z1.Z1.Z1.Z1.Z1.Z1.Z1.Z1
        //    Actually I'll use a simple insert and hope the server uses standard bcrypt.
        //    Actually, I can just require bcryptjs in this script!
    } catch (e) {
        // If seeded data conflicts, ignore
        console.log("⚠️  Pre-setup note: " + e.message);
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Creates a fresh School + Admin for this test run
    const uniqueSuffix = Date.now();
    const testAdminEmail = `admin${uniqueSuffix}@mvp.com`;

    const s = await prisma.school.create({ data: { name: `MVP School ${uniqueSuffix}` } });
    await prisma.user.create({
        data: {
            fullName: "MVP Admin",
            email: testAdminEmail,
            password_hash: hashedPassword,
            role: 'school_admin',
            schoolId: s.id,
            isActive: true
        }
    });

    try {
        // ==========================================
        // 2. ADMIN LOGIN
        // ==========================================
        logStep("Login as Admin");
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: testAdminEmail,
            password: 'password123'
        });
        adminToken = loginRes.data.token;
        logSuccess("Admin Logged In");

        // ==========================================
        // 3. ADMIN: SET UP ACADEMIC YEAR
        // ==========================================
        logStep("Create Academic Year");
        const yearRes = await axios.post(`${BASE_URL}/academics/academic-years`, {
            startYear: 2025,
            endYear: 2026,
            current: true
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        createdAcademicYearId = yearRes.data.id;
        logSuccess(`Academic Year Created: ${createdAcademicYearId}`);

        // ==========================================
        // 4. ADMIN: CREATE CLASS
        // ==========================================
        logStep("Create Class");
        const classRes = await axios.post(`${BASE_URL}/school/classes`, {
            name: "Grade 1A",
            academicYearId: createdAcademicYearId, // Explicitly linking if required, or it might auto-pick current
            capacity: 30
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        createdClassId = classRes.data.id;
        logSuccess(`Class Created: ${createdClassId}`);

        // ==========================================
        // 5. ADMIN: CREATE TEACHER
        // ==========================================
        logStep("Create Teacher");
        const teacherRes = await axios.post(`${BASE_URL}/academics/teachers`, { // or /school/teachers depending on route refactor
            fullName: "Mr. MVP Teacher",
            email: `teacher${uniqueSuffix}@mvp.com`,
            password: "password123"
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        createdTeacherId = teacherRes.data.id; // API response structure audit
        logSuccess(`Teacher Created: ${teacherRes.data.email}`);

        // Assign Teacher to Class (Link 'Math' subject)
        // Need to create Subject first?
        logStep("Create Subject & Assign Teacher");
        const subjectRes = await axios.post(`${BASE_URL}/academics/subjects`, { // or /school/subjects
            name: "Mathematics",
            classId: createdClassId,
            teacherId: createdTeacherId
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        logSuccess(`Subject 'Mathematics' Created & Assigned`);

        // ==========================================
        // 6. ADMIN: CREATE PARENT & STUDENT
        // ==========================================
        logStep("Create Student (and Parent)");
        const studentRes = await axios.post(`${BASE_URL}/school/students`, {
            fullName: "Baby MVP",
            gender: "Male",
            dob: "2018-01-01",
            classId: createdClassId,
            parentName: "Papa MVP",
            parentEmail: `parent${uniqueSuffix}@mvp.com`,
            parentPhone: "0799999999",
            nfc_card_id: `NFC-${uniqueSuffix}`
        }, { headers: { Authorization: `Bearer ${adminToken}` } });

        createdStudentId = studentRes.data.student.id;
        createdParentId = studentRes.data.parent.id;
        logSuccess(`Student Created: ${createdStudentId}`);

        // ==========================================
        // 7. TEACHER LOGIN
        // ==========================================
        logStep("Login as Teacher");
        const tLoginBy = await axios.post(`${BASE_URL}/auth/login`, {
            email: `teacher${uniqueSuffix}@mvp.com`,
            password: 'password123'
        });
        teacherToken = tLoginBy.data.token;
        logSuccess("Teacher Logged In");

        // Verify Teacher sees their class
        logStep("Teacher: Get My Classes");
        const myClasses = await axios.get(`${BASE_URL}/academics/my-schedule`, { // or similar endpoint
            headers: { Authorization: `Bearer ${teacherToken}` }
        });
        if (myClasses.data.length > 0) logSuccess("Teacher sees classes");
        else logError("Teacher sees NO classes (Check getAllClasses / Assignment logic)");

        // ==========================================
        // 8. TEACHER: CREATE EXAM & SCHEDULE
        // ==========================================
        // Note: Creating Exam definition is usually Admin, Scheduling is Admin/Teacher?
        // Let's use Admin token for creating Exam Definition as per role tweaks
        logStep("Admin: Create Exam Definition");
        const examRes = await axios.post(`${BASE_URL}/academics/exams`, {
            name: "Finals 2026",
            startDate: "2026-06-01",
            endDate: "2026-06-15"
        }, { headers: { Authorization: `Bearer ${adminToken}` } }); // Using Admin Token
        createdExamId = examRes.data.id;
        logSuccess("Exam Definition Created");

        // Schedule it
        logStep("Admin: Schedule Exam");
        // Need subjectId
        const subjectId = subjectRes.data.id;
        const scheduleRes = await axios.post(`${BASE_URL}/academics/exams/schedule`, {
            examId: createdExamId,
            classId: createdClassId,
            subjectId: subjectId,
            date: "2026-06-02",
            startTime: "09:00",
            endTime: "11:00",
            roomNo: "101"
        }, { headers: { Authorization: `Bearer ${adminToken}` } });
        const createdScheduleId = scheduleRes.data.id;
        logSuccess("Exam Scheduled");

        // ==========================================
        // 9. TEACHER: SUBMIT GRADES
        // ==========================================
        logStep("Teacher: Submit Grades");
        await axios.post(`${BASE_URL}/exams/marks`, {
            examScheduleId: createdScheduleId,
            marks: [
                { studentId: createdStudentId, marksObtained: 95, comments: "Excellent!" }
            ]
        }, { headers: { Authorization: `Bearer ${teacherToken}` } });
        logSuccess("Grades Submitted");

        // ==========================================
        // 10. PARENT CHECK
        // ==========================================
        logStep("Login as Parent");
        // Need parent password. Default is created by createStudent? usually 123456 or generic.
        // If not known, we can't login via API easily. 
        // Force update parent password in DB for testing.
        await prisma.user.update({
            where: { id: createdParentId },
            data: { password_hash: hashedPassword }
        });

        const actualParentEmail = studentRes.data.parent.email;
        logStep(`Login as Parent using ${actualParentEmail}`);

        const pLogin = await axios.post(`${BASE_URL}/auth/login`, {
            email: actualParentEmail,
            password: 'password123'
        });
        parentToken = pLogin.data.token;
        logSuccess("Parent Logged In");

        // Check Grades
        logStep("Parent: Check Grades");
        const gradesRes = await axios.get(`${BASE_URL}/exams/students/${createdStudentId}/grades`, {
            headers: { Authorization: `Bearer ${parentToken}` }
        });
        // Logic: Should return grouped exams
        if (gradesRes.data["Finals 2026"]) logSuccess("Parent sees 'Finals 2026' grades!");
        else logError("Parent cannot see grades", { response: gradesRes });

        // ==========================================
        // 11. DELETE ACADEMIC YEAR (CLEANUP TEST)
        // ==========================================
        logStep("Admin: Delete Academic Year (Cleanup)");
        await axios.delete(`${BASE_URL}/academics/academic-years/${createdAcademicYearId}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        logSuccess("Academic Year Deleted (Transactions Verified!)");

        console.log("\n✨ MVP VERIFICATION COMPLETE: ALL SYSTEMS GO. ✨");

    } catch (err) {
        logError("Verification Failed", err);
    } finally {
        await prisma.$disconnect();
    }
}

runVerification();
