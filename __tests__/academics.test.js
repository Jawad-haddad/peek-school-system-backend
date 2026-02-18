// __tests__/academics.test.js
const request = require('supertest');
const app = require('../index');
const { getAuthToken } = require('./helpers');
const prisma = require('../src/prismaClient');
const admin = require('firebase-admin');

describe('Academics Module', () => {
    let teacherToken;
    let studentId;
    let homeworkId;

    beforeAll(async () => {
        teacherToken = await getAuthToken('teacher.ahmad@almustaqbal.com', 'teacherpassword');
        const student = await prisma.student.findFirst({ where: { fullName: "Omar Haddad" } });
        studentId = student.id;
        const homework = await prisma.homework.findFirst({ where: { title: "Math Homework Chapter 1" } });
        homeworkId = homework.id;
    });

    it('should allow a teacher to add a grade to a homework', async () => {
        const response = await request(app)
            .post(`/api/academics/homework/${homeworkId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ studentId: studentId, grade: 88, comments: "Good work" });
        
        expect(response.statusCode).toBe(201);
    });

    it('should allow a teacher to record attendance', async () => {
        const uniqueDate = new Date().toISOString(); 
        const response = await request(app)
            .post('/api/academics/attendance')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ studentId: studentId, status: "present", date: uniqueDate });

        expect(response.statusCode).toBe(201);
    });
});

afterAll(async () => {
    await prisma.$disconnect();
    if (admin.apps.length) {
        await Promise.all(admin.apps.map(app => app.delete()));
    }
});