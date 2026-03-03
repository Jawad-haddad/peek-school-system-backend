// src/controllers/platformController.js
const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');
const { ok, fail } = require('../utils/response');
const logger = require('../config/logger');

const onboardSchool = async (req, res) => {
    try {
        const { school, admin, academicYear, classes } = req.body;

        // 1. Pre-check email uniqueness outside transaction to present a cleaner error
        const existingUser = await prisma.user.findUnique({
            where: { email: admin.email.toLowerCase() }
        });

        if (existingUser) {
            return fail(res, 409, 'A user with this email already exists.', 'CONFLICT_EMAIL');
        }

        // 2. Hash the initial admin password
        const password_hash = await bcrypt.hash(admin.password, 10);

        // 3. Execute the compound transaction
        const result = await prisma.$transaction(async (tx) => {

            // a. Create School
            const newSchool = await tx.school.create({
                data: {
                    name: school.name,
                    address: school.city || undefined // Mapping payload city -> address constraint broadly
                }
            });

            // b. Create Admin User bound to school
            const newAdmin = await tx.user.create({
                data: {
                    fullName: admin.fullName,
                    email: admin.email.toLowerCase(),
                    password_hash,
                    role: 'school_admin',
                    schoolId: newSchool.id,
                    isActive: true,
                    emailVerified: true // Assume verified on bootstrapping
                }
            });

            // c. Create Academic Year
            const newAcademicYear = await tx.academicYear.create({
                data: {
                    name: academicYear.name,
                    startDate: new Date(academicYear.startDate),
                    endDate: new Date(academicYear.endDate),
                    current: academicYear.isCurrent,
                    schoolId: newSchool.id
                }
            });

            // d. Create Classes associated with the academic year
            const createdClasses = [];
            if (classes && classes.length > 0) {
                for (const cls of classes) {
                    const createdClass = await tx.class.create({
                        data: {
                            name: cls.name,
                            defaultFee: cls.defaultFee,
                            academicYearId: newAcademicYear.id
                        }
                    });
                    createdClasses.push(createdClass);
                }
            }

            return {
                schoolId: newSchool.id,
                adminUserId: newAdmin.id,
                adminEmail: newAdmin.email,
                academicYearId: newAcademicYear.id,
                classIds: createdClasses.map(c => c.id)
            };
        });

        logger.info({ action: 'onboard_school', schoolId: result.schoolId, adminId: result.adminUserId }, 'School successfully onboarded via platform.');
        return ok(res, result, 'School successfully onboarded.');

    } catch (error) {
        // Bubble up structural or generic failures
        logger.error({ err: error.message }, 'Failed to onboard school');

        // Prisma uniqueness failure bubble mapping fallback just in case
        if (error.code === 'P2002') {
            return fail(res, 409, `Resource conflict: ${error.meta?.target}`, 'CONFLICT');
        }

        return fail(res, 500, 'Internal server error during school onboarding', 'INTERNAL_ERROR');
    }
};

module.exports = {
    onboardSchool
};
