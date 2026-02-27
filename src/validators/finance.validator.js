const { z } = require('zod');

// ── Wallet ──────────────────────────────────────────
const topUpWalletSchema = z.object({
    studentId: z.string().uuid('Invalid studentId format (UUID expected)').optional(),
    amount: z.number()
        .min(0.01, 'Top up amount must be greater than 0')
        .max(100000, 'Top up amount exceeds maximum transaction limit'),
}).strict();

const walletHistoryQuerySchema = z.object({
    limit: z.union([z.number(), z.string().transform(Number)])
        .refine(val => val >= 1 && val <= 200, { message: 'Limit must be between 1 and 200' })
        .optional(),
    from: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid ISO from date string' }).optional(),
    to: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid ISO to date string' }).optional(),
    type: z.string().optional() // Allow history type filtering if supported
}).strict();

// ── Invoices ────────────────────────────────────────
const issueInvoiceSchema = z.object({
    studentId: z.string().uuid('Invalid studentId format (UUID expected)'),
    feeStructureId: z.string().uuid('Invalid feeStructureId format (UUID expected)'),
    dueDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid ISO due date string' }).optional(),
    description: z.string().max(255, 'Description exceeds 255 characters').optional()
}).strict();

// ── Payments ────────────────────────────────────────
const recordPaymentSchema = z.object({
    amount: z.number().min(0.01, 'Payment amount must be greater than 0'),
    paymentMethod: z.enum(['card', 'cash', 'bank_transfer', 'cliq'], {
        errorMap: () => ({ message: "Payment method must be 'card', 'cash', 'bank_transfer', or 'cliq'" })
    })
}).strict();

const invoiceIdParamSchema = z.object({
    invoiceId: z.string().uuid('Invalid invoiceId format (UUID expected)')
}).strict();

module.exports = {
    topUpWalletSchema,
    walletHistoryQuerySchema,
    issueInvoiceSchema,
    recordPaymentSchema,
    invoiceIdParamSchema
};
