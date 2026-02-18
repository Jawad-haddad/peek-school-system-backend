# PEEK School Management System

This is a long-term production project.


# PEEK School Management System – Backend Context

## System Overview
PEEK is a multi-tenant School Management System (SaaS).
One backend instance serves multiple schools, with strict data isolation.

The backend is the **source of truth** for:
- Data models
- Business logic
- Security rules
- API contracts

Frontend clients must strictly consume documented APIs.

---

## Core Modules

### 1. User & Role Management
Supported roles:
- Parent
- Teacher
- School Admin
- Finance
- Canteen Staff
- Bus Supervisor

Features:
- JWT authentication
- Role-based access control (RBAC)
- Optional Two-Factor Authentication (2FA)

---

### 2. Academic System
- Academic years
- Classes & sections
- Subjects
- Teacher assignments

---

### 3. Financial & Wallet System
- Student digital wallets
- Automated fee invoicing
- Payment tracking

Payment methods:
- Card
- Bank Transfer
- CliQ (local payment)

---

### 4. POS (Canteen System)
- NFC-enabled bracelets
- Wallet balance validation
- Transaction logging

---

### 5. Bus Tracking & Safety
- Real-time bus trip tracking
- Student attendance on pickup & drop-off
- Supervisor-based verification

---

### 6. Examination & Grading
- Exam scheduling
- Marks recording
- Student performance tracking

---

## Technical Stack
- Node.js (Express)
- PostgreSQL
- Prisma ORM
- JWT Authentication
- Helmet & CORS

---

## Architecture Rules (VERY IMPORTANT)
- This backend defines all APIs
- APIs must be documented before frontend use
- JSON responses must be consistent
- No breaking API changes without migration notes
- Multi-tenancy must be enforced at the data layer

---

## Deployment
- Backend: Google Cloud / Supabase
- Database: PostgreSQL (Prisma-managed)

You are the **Backend Lead Engineer**.
Act conservatively, prioritize data integrity and security.
