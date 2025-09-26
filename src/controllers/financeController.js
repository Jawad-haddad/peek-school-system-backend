const prisma = require('../prismaClient');
const { UserRole, InvoiceStatus, PaymentMethod, WalletTxnType } = require('@prisma/client');

// === FINANCE & ADMIN CONTROLLERS ===

const createFeeStructure = async (req, res) => {
  // Logic for creating fee structures
  const schoolId = req.user.schoolId;
  const { name, totalAmount, academicYearId } = req.body;
  if (!name || totalAmount === undefined || !academicYearId) {
    return res.status(400).json({ message: 'Name, totalAmount, and academicYearId are required.' });
  }
  try {
    const academicYear = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId }});
    if (!academicYear) { return res.status(404).json({ message: 'Academic Year not found in your school.' }); }

    const feeStructure = await prisma.feeStructure.create({
      data: { name, totalAmount, academicYearId },
    });
    res.status(201).json(feeStructure);
  } catch (error) {
    console.error("Error creating fee structure:", error);
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
    console.error("Error issuing invoice:", error);
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
            const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });

            if (!invoice) { throw new Error("Invoice not found."); }
            if (invoice.status === InvoiceStatus.paid || invoice.status === InvoiceStatus.cancelled) {
                throw new Error(`Invoice is already ${invoice.status}.`);
            }

            await tx.payment.create({
                data: { invoiceId, amount, method }
            });

            const newAmountPaid = Number(invoice.amountPaid) + amount;
            let newStatus = invoice.status;
            if (newAmountPaid >= Number(invoice.totalAmount)) {
                newStatus = InvoiceStatus.paid;
            } else if (newAmountPaid > 0) {
                newStatus = InvoiceStatus.partial;
            }

            return tx.invoice.update({
                where: { id: invoiceId },
                data: { amountPaid: newAmountPaid, status: newStatus }
            });
        });

        res.status(200).json({ message: "Payment recorded successfully.", invoice: updatedInvoice });

    } catch (error) {
        console.error("Error recording payment:", error);
        if (error.message.includes("Invoice not found")) { return res.status(404).json({ message: error.message }); }
        if (error.message.includes("Invoice is already")) { return res.status(409).json({ message: error.message }); }
        res.status(500).json({ message: "Failed to record payment." });
    }
};


// === PARENT CONTROLLERS ===

const topUpWallet = async (req, res) => {
    const parentId = req.user.id;
    const { studentId, amount } = req.body;

    if (!studentId || !amount || amount <= 0) {
        return res.status(400).json({ message: 'Student ID and a positive amount are required.' });
    }

    try {
        const student = await prisma.student.findFirst({
            where: { id: studentId, parentId: parentId }
        });

        if (!student) {
            return res.status(403).json({ message: 'Forbidden: You are not the parent of this student.' });
        }

        const transaction = await prisma.$transaction(async (tx) => {
            const updatedStudent = await tx.student.update({
                where: { id: studentId },
                data: { wallet_balance: { increment: amount } },
            });
            const walletTxn = await tx.walletTransaction.create({
                data: {
                    studentId: studentId,
                    schoolId: student.schoolId,
                    amount: amount,
                    type: WalletTxnType.topup,
                    description: `Wallet top-up by parent. New balance: ${updatedStudent.wallet_balance}`,
                },
            });
            return walletTxn;
        });
        res.status(200).json({ message: 'Wallet topped up successfully.', transaction });
    } catch (error) {
        console.error("Error topping up wallet:", error);
        res.status(500).json({ message: 'Failed to top up wallet.' });
    }
};

module.exports = { 
    createFeeStructure, 
    issueInvoice, 
    recordPayment,
    topUpWallet // Re-added the exported function
};