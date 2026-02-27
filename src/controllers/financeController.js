const prisma = require('../prismaClient');
const { UserRole, InvoiceStatus, PaymentMethod, WalletTxnType } = require('@prisma/client');
const logger = require('../config/logger');
const { ok, fail } = require('../utils/response');
const { getTenant, tenantWhere, assertTenantEntity } = require('../utils/tenant');

// === FINANCE & ADMIN CONTROLLERS ===

const createFeeStructure = async (req, res) => {
    const { schoolId } = getTenant(req);
    const { name, totalAmount, academicYearId } = req.body;
    if (!name || totalAmount === undefined || !academicYearId) {
        return fail(res, 400, 'Name, totalAmount, and academicYearId are required.', 'VALIDATION_ERROR');
    }
    try {
        const academicYear = await prisma.academicYear.findFirst({ where: tenantWhere(req, { id: academicYearId }) });
        if (!academicYear) { return fail(res, 404, 'Academic Year not found in your school.', 'NOT_FOUND'); }

        const feeStructure = await prisma.feeStructure.create({
            data: { name, totalAmount, academicYearId },
        });
        ok(res, feeStructure, null, 201);
    } catch (error) {
        logger.error({ error: error.message }, "Error creating fee structure");
        fail(res, 500, 'Something went wrong.', 'SERVER_ERROR');
    }
};

const issueInvoice = async (req, res) => {
    const { schoolId } = getTenant(req);
    const { studentId, feeStructureId, dueDate } = req.body;
    if (!studentId || !feeStructureId || !dueDate) {
        return fail(res, 400, 'Student ID, fee structure ID, and due date are required.', 'VALIDATION_ERROR');
    }
    try {
        // Tenant-scoped lookups — student and fee structure must belong to same school
        const student = await prisma.student.findFirst({ where: tenantWhere(req, { id: studentId }) });
        const feeStructure = await prisma.feeStructure.findFirst({
            where: { id: feeStructureId, academicYear: tenantWhere(req) }
        });
        if (!student || !feeStructure) { return fail(res, 404, 'Student or Fee Structure not found in your school.', 'NOT_FOUND'); }

        const newInvoice = await prisma.invoice.create({
            data: {
                studentId, feeStructureId, dueDate: new Date(dueDate),
                totalAmount: feeStructure.totalAmount, status: InvoiceStatus.issued
            }
        });
        ok(res, newInvoice, null, 201);
    } catch (error) {
        logger.error({ error: error.message }, "Error issuing invoice");
        fail(res, 500, 'Something went wrong.', 'SERVER_ERROR');
    }
};

const recordPayment = async (req, res) => {
    const { invoiceId } = req.params;
    const { amount, method } = req.body;

    if (!amount || amount <= 0 || !method || !Object.values(PaymentMethod).includes(method)) {
        return fail(res, 400, 'A positive amount and a valid payment method are required.', 'VALIDATION_ERROR');
    }

    try {
        // Pre-flight: fetch invoice with student to check tenant ownership
        const invoiceCheck = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: { student: { select: { schoolId: true } } }
        });

        if (!invoiceCheck) {
            return fail(res, 404, 'Invoice not found.', 'NOT_FOUND');
        }

        // Defense-in-depth: explicit tenant check before mutation
        if (assertTenantEntity(req, res, invoiceCheck.student.schoolId)) return;

        const updatedInvoice = await prisma.$transaction(async (tx) => {
            const invoice = await tx.invoice.findUnique({
                where: { id: invoiceId },
                include: { student: true }
            });

            if (!invoice) { throw new Error("Invoice not found."); }

            if (invoice.status === InvoiceStatus.paid || invoice.status === InvoiceStatus.cancelled) {
                throw new Error(`Invoice is already ${invoice.status}.`);
            }

            await tx.payment.create({
                data: { invoiceId, amount, method }
            });

            const newAmountPaid = Number(invoice.amountPaid) + Number(amount);
            let newStatus = invoice.status;
            if (newAmountPaid >= Number(invoice.totalAmount)) {
                newStatus = InvoiceStatus.paid;
            } else if (newAmountPaid > 0) {
                newStatus = InvoiceStatus.partial;
            }

            // Sync Student fee fields atomically (FIX-1: Financial Desync)
            await tx.student.update({
                where: { id: invoice.studentId },
                data: {
                    paid: { increment: Number(amount) },
                    balance: { decrement: Number(amount) }
                }
            });

            // FIX-6: Audit Log (Payment)
            const { logAudit } = require('../utils/auditLogger');
            await logAudit(tx, {
                userId: req.user.id,
                userEmail: req.user.email,
                actionType: 'RECORD_PAYMENT',
                details: { invoiceId, amount, method },
                schoolId: req.user.schoolId
            });

            return tx.invoice.update({
                where: { id: invoiceId },
                data: { amountPaid: newAmountPaid, status: newStatus }
            });
        });

        ok(res, { invoice: updatedInvoice });

    } catch (error) {
        logger.error({ error: error.message }, "Error recording payment");
        if (error.message.includes("Invoice not found")) { return fail(res, 404, error.message, 'NOT_FOUND'); }
        if (error.message.includes("Invoice is already")) { return fail(res, 409, error.message, 'CONFLICT'); }
        fail(res, 500, 'Failed to record payment.', 'SERVER_ERROR');
    }
};


// === PARENT CONTROLLERS ===

const topUpWallet = async (req, res) => {
    const parentId = req.user.id;
    const { studentId, amount } = req.body;

    const parsedAmount = Number(amount);
    if (!studentId || isNaN(parsedAmount) || parsedAmount <= 0) {
        return fail(res, 400, 'Student ID and a positive numeric amount are required.', 'VALIDATION_ERROR');
    }

    try {
        // Tenant-scoped: student must belong to user's school AND be user's child
        const student = await prisma.student.findFirst({
            where: tenantWhere(req, { id: studentId, parentId: parentId })
        });

        if (!student) {
            return fail(res, 403, 'Forbidden: You are not the parent of this student or student not in your school scope.', 'TENANT_FORBIDDEN');
        }

        const transaction = await prisma.$transaction(async (tx) => {
            const updatedStudent = await tx.student.update({
                where: { id: studentId },
                data: { wallet_balance: { increment: parsedAmount } },
            });
            const walletTxn = await tx.walletTransaction.create({
                data: {
                    studentId: studentId,
                    schoolId: student.schoolId,
                    amount: parsedAmount,
                    type: WalletTxnType.topup,
                    description: `Wallet top-up by parent. New balance: ${updatedStudent.wallet_balance}`,
                },
            });

            // FIX-6: Audit Log (Wallet Top-up)
            const { logAudit } = require('../utils/auditLogger');
            await logAudit(tx, {
                userId: parentId,
                userEmail: req.user.email,
                actionType: 'WALLET_TOPUP',
                details: { studentId, amount: parsedAmount },
                schoolId: student.schoolId
            });

            return walletTxn;
        });
        ok(res, { transaction });
    } catch (error) {
        logger.error({ error: error.message }, "Error topping up wallet");
        fail(res, 500, 'Failed to top up wallet.', 'SERVER_ERROR');
    }
};

// ... (previous code)

const getWalletHistory = async (req, res) => {
    const { studentId } = req.params;
    const user = req.user;

    try {
        // 1. Tenant-scoped fetch: only find student within caller's school
        const student = await prisma.student.findFirst({
            where: tenantWhere(req, { id: studentId }),
            select: { id: true, schoolId: true, parentId: true }
        });

        if (!student) {
            return fail(res, 404, 'Student not found.', 'NOT_FOUND');
        }

        // 2. Defense-in-depth: explicit tenant check
        if (assertTenantEntity(req, res, student.schoolId)) return;

        // 3. Role-based authorization (parent can only see own child)
        if (user.role === UserRole.parent) {
            if (student.parentId !== user.id) {
                return fail(res, 403, 'Access denied. Not your child.', 'FORBIDDEN');
            }
        } else if (![UserRole.school_admin, UserRole.finance, UserRole.super_admin].includes(user.role)) {
            return fail(res, 403, 'Access denied.', 'FORBIDDEN');
        }

        // 4. Fetch History
        const history = await prisma.walletTransaction.findMany({
            where: { studentId },
            orderBy: { createdAt: 'desc' },
            include: {
                payment: { select: { invoice: { select: { feeStructure: { select: { name: true } } } } } },
                posOrder: { select: { total: true } }
            }
        });

        ok(res, history);

    } catch (error) {
        logger.error({ error: error.message }, "Error fetching wallet history");
        fail(res, 500, 'Failed to fetch wallet history.', 'SERVER_ERROR');
    }
};

const processTransaction = async (tx, { studentId, schoolId, amount, type, description }) => {
    // 1. Atomic Transactions are handled by passing the transaction client 'tx'

    // Fetch student for balance check
    const student = await tx.student.findFirst({
        where: { id: studentId, schoolId }
    });

    if (!student) throw new Error("Student not found or does not belong to the school.");

    // 2. Overdraft Protection (for deductions)
    if (amount < 0 && Number(student.wallet_balance) + amount < 0) {
        throw new Error("Insufficient wallet balance.");
    }

    // 3. Daily Spending Limit Check
    if (amount < 0 && student.daily_spending_limit) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const dailyTxns = await tx.walletTransaction.findMany({
            where: {
                studentId,
                type: WalletTxnType.purchase,
                createdAt: { gte: startOfDay, lte: endOfDay }
            }
        });

        const spentToday = dailyTxns.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

        if (spentToday + Math.abs(amount) > Number(student.daily_spending_limit)) {
            throw new Error(`Daily spending limit of ${student.daily_spending_limit} exceeded.`);
        }
    }

    // Update Balance
    const updatedStudent = await tx.student.update({
        where: { id: studentId },
        data: { wallet_balance: { increment: amount } }
    });

    // Create Transaction Record
    const walletTxn = await tx.walletTransaction.create({
        data: {
            studentId,
            schoolId,
            amount,
            type,
            description: description || `Transaction: ${type}`
        }
    });

    return { student: updatedStudent, transaction: walletTxn };
};

module.exports = {
    createFeeStructure,
    issueInvoice,
    recordPayment,
    topUpWallet,
    processTransaction,
    getWalletHistory
};