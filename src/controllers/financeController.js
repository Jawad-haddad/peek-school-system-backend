const prisma = require('../prismaClient');
const { UserRole, InvoiceStatus, PaymentMethod, WalletTxnType } = require('@prisma/client');
const logger = require('../config/logger');

// === FINANCE & ADMIN CONTROLLERS ===

const createFeeStructure = async (req, res) => {
    // Logic for creating fee structures
    const schoolId = req.user.schoolId;
    const { name, totalAmount, academicYearId } = req.body;
    if (!name || totalAmount === undefined || !academicYearId) {
        return res.status(400).json({ message: 'Name, totalAmount, and academicYearId are required.' });
    }
    try {
        const academicYear = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
        if (!academicYear) { return res.status(404).json({ message: 'Academic Year not found in your school.' }); }

        const feeStructure = await prisma.feeStructure.create({
            data: { name, totalAmount, academicYearId },
        });
        res.status(201).json(feeStructure);
    } catch (error) {
        logger.error({ error: error.message }, "Error creating fee structure");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const issueInvoice = async (req, res) => {
    // Logic for issuing invoices
    const schoolId = req.user.schoolId;
    const { studentId, feeStructureId, dueDate } = req.body;
    if (!studentId || !feeStructureId || !dueDate) {
        return res.status(400).json({ message: 'Student ID, fee structure ID, and due date are required.' });
    }
    try {
        const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
        const feeStructure = await prisma.feeStructure.findFirst({ where: { id: feeStructureId, academicYear: { schoolId } } });
        if (!student || !feeStructure) { return res.status(404).json({ message: 'Student or Fee Structure not found in your school.' }); }

        const newInvoice = await prisma.invoice.create({
            data: {
                studentId, feeStructureId, dueDate: new Date(dueDate),
                totalAmount: feeStructure.totalAmount, status: InvoiceStatus.issued
            }
        });
        res.status(201).json(newInvoice);
    } catch (error) {
        logger.error({ error: error.message }, "Error issuing invoice");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const recordPayment = async (req, res) => {
    // Logic for recording a payment
    const { invoiceId } = req.params;
    const { amount, method } = req.body; // Corrected from paymentMethod

    if (!amount || amount <= 0 || !method || !Object.values(PaymentMethod).includes(method)) {
        return res.status(400).json({ message: "A positive amount and a valid payment method are required." });
    }

    try {
        const updatedInvoice = await prisma.$transaction(async (tx) => {
            // Include student to check schoolId
            const invoice = await tx.invoice.findUnique({
                where: { id: invoiceId },
                include: { student: true }
            });

            if (!invoice) { throw new Error("Invoice not found."); }

            // Enforce Multi-Tenancy
            if (req.user.schoolId && invoice.student.schoolId !== req.user.schoolId) {
                throw new Error("Invoice not found in your school.");
            }

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

        res.status(200).json({ message: "Payment recorded successfully.", invoice: updatedInvoice });

    } catch (error) {
        logger.error({ error: error.message }, "Error recording payment");
        if (error.message.includes("Invoice not found")) { return res.status(404).json({ message: error.message }); }
        if (error.message.includes("Invoice is already")) { return res.status(409).json({ message: error.message }); }
        res.status(500).json({ message: "Failed to record payment." });
    }
};


// === PARENT CONTROLLERS ===

const topUpWallet = async (req, res) => {
    const parentId = req.user.id;
    const { studentId, amount } = req.body;

    const parsedAmount = Number(amount);
    if (!studentId || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Student ID and a positive numeric amount are required.' });
    }

    try {
        const where = { id: studentId, parentId: parentId };
        if (req.user.schoolId) {
            where.schoolId = req.user.schoolId;
        }

        const student = await prisma.student.findFirst({
            where
        });

        if (!student) {
            return res.status(403).json({ message: 'Forbidden: You are not the parent of this student or student not in your school scope.' });
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
        res.status(200).json({ message: 'Wallet topped up successfully.', transaction });
    } catch (error) {
        logger.error({ error: error.message }, "Error topping up wallet");
        res.status(500).json({ message: 'Failed to top up wallet.' });
    }
};

// ... (previous code)

const getWalletHistory = async (req, res) => {
    const { studentId } = req.params;
    const user = req.user;

    try {
        // 1. Fetch student to verify existence and school scope
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { id: true, schoolId: true, parentId: true }
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        // 2. Strict Multi-Tenancy & Authorization Logic
        if (user.role === UserRole.parent) {
            // Parent can only see their OWN child
            if (student.parentId !== user.id) {
                return res.status(403).json({ message: "Access denied. Not your child." });
            }
        } else if ([UserRole.school_admin, UserRole.finance].includes(user.role)) {
            // Staff can only see students in THEIR school
            if (student.schoolId !== user.schoolId) {
                return res.status(403).json({ message: "Access denied. Student belongs to another school." });
            }
        } else {
            // Other roles (like teacher, bus_supervisor) usually don't access wallet history directly here,
            // unless allowed by policy. For now, restrict.
            return res.status(403).json({ message: "Access denied." });
        }

        // 3. Fetch History
        const history = await prisma.walletTransaction.findMany({
            where: { studentId },
            orderBy: { createdAt: 'desc' },
            include: {
                payment: { select: { invoice: { select: { feeStructure: { select: { name: true } } } } } }, // To show what was paid for
                posOrder: { select: { total: true } } // To show order details if needed
            }
        });

        res.json(history);

    } catch (error) {
        logger.error({ error: error.message }, "Error fetching wallet history");
        res.status(500).json({ message: "Failed to fetch wallet history." });
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
                type: WalletTxnType.purchase, // Verify if we only track purchases
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