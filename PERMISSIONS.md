# RBAC & Permissions Matrix

This document outlines the user roles within the system, the high-level permission matrix for key modules, and an audit of the current Route-Level Role-Based Access Control (RBAC).

## System Roles
Derived from the `UserRole` Prisma enum and authorization middleware.

| Role | Description |
|------|-------------|
| `super_admin` | Global administrator bridging all schools and tenants. |
| `school_admin`| Administrator scoped to a single school tenant. |
| `finance` | Manages fee structures, invoices, and payments. |
| `teacher` | Manages academics, homework, attendance, and exams. |
| `bus_supervisor` | Manages bus trips and student transit logging. |
| `canteen_staff`| Manages POS, products, and canteen orders. |
| `parent` | Views their own children’s academics, wallet, and pays invoices. |
| `student` | (Implicit/Active) Often acts as the subject of the system; limited login permissions depending on school policy. |

---

## Route Permission Audit Matrix

*Analysis of all `src/routes/*` for explicit `authMiddleware` and `hasRole([...])` protections.*

| Module | Route / Action | Auth Middleware | Role Guard Valid? | Allowed Roles / Notes |
|--------|----------------|-----------------|-------------------|-----------------------|
| **Auth** | `/login`, `/register` | ❌ (Public) | N/A | Public endpoints |
| **Auth** | `/me`, `/register-device` | ✅ | ⚠️ Missing | Any authenticated user |
| **Finance** | `POST /invoices`, `POST /fee-structures`| ✅ | ✅ | `finance`, `school_admin` |
| **Finance** | `POST /invoices/.../payments` | ✅ | ✅ | `finance`, `school_admin` |
| **Finance** | `GET /wallet/:id/history` | ✅ | ✅ | `parent`, `school_admin`, `finance` |
| **POS** | `POST /orders` (Checkout) | ✅ | ✅ | `canteen_staff`, `school_admin`, `teacher` |
| **POS** | `POST /items` (Products) | ✅ | ✅ | `school_admin` |
| **Academics** | `GET /classes`, `GET /teachers` | ✅ | ✅ | `teacher`, `school_admin` |
| **Academics** | `GET /my-schedule`, `/my-students` | ✅ | ✅ | `teacher` |
| **Academics**| `POST /academic-years`, `/subjects` | ✅ | ⚠️ Missing | **DANGER**: No strict role guard |
| **Academics**| `POST /homework/.../grades` | ✅ | ⚠️ Missing | **DANGER**: No strict role guard |
| **Exams** | `POST /`, `POST /schedule` | ✅ | ⚠️ Missing | **DANGER**: No strict role guard |
| **Exams** | `PUT /:examId`, `DELETE /:examId` | ✅ | ⚠️ Missing | **DANGER**: No strict role guard |
| **Attendance**| `POST /bulk` | ✅ | ⚠️ Missing | **DANGER**: No strict role guard |
| **Bus** | `POST /trip/start`, `POST /trip/end` | ✅ | ⚠️ Missing | **DANGER**: No strict role guard |
| **School** | `POST /` (Create School) | ✅ | ✅ | `super_admin` |
| **School** | `POST /students`, `POST /teachers`| ✅ | ⚠️ Missing | **DANGER**: No strict role guard |
| **School** | `DELETE /students/:id` | ✅ | ⚠️ Missing | **DANGER**: No strict role guard |
| **Stats** | `GET /stats/fees` | ✅ | ⚠️ Missing | **DANGER**: Exposes financial data |

---

## ⚠️ Top 10 RBAC Risks (Dangerous Routes Missing Explicit Role Guards)

The following routes currently verify that the user has a valid JWT token (`authMiddleware`), but **do not** enforce a strict role constraint (`hasRole`). This means *any authenticated user in the system* (e.g., a student or a parent) could potentially hit these endpoints and modify sensitive data:

1. **`POST /api/exam/` & `PUT /api/exam/:examId`**: Any authenticated user can create, modify, or delete exams.
2. **`POST /api/exam/schedules/:scheduleId/marks`**: Any authenticated user can submit or alter exam grades for a student.
3. **`POST /api/academic/homework/:homeworkId/grades`**: Any authenticated user can alter homework grades.
4. **`POST /api/academic/academic-years` & `POST /api/academic/subjects`**: Core academic lifecycle data can be manipulated by anyone.
5. **`POST /api/school/students` & `POST /api/school/teachers`**: No role guard prevents a student/parent from adding rogue accounts to the school.
6. **`DELETE /api/school/students/:studentId`**: Any user can delete a student record.
7. **`POST /api/attendance/bulk`**: Any authenticated user can submit or overwrite attendance records for an entire class.
8. **`POST /api/bus/trip/start` & `PATCH /api/bus/entry/:studentId`**: Any user can start a bus trip or alter the manifest/boarding log of students.
9. **`POST /api/communication/broadcast`**: Any user can send school-wide announcements/broadcasts.
10. **`GET /api/stats/fees` & `GET /api/report/overview`**: Sensitive school-wide financial and demographic statistics are exposed to any valid token holder.
