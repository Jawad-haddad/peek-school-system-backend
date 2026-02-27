const { z } = require('zod');

// ── Canteen Items (Products) ────────────────────────
const createItemSchema = z.object({
    name: z.string().min(1, 'Item name is required').max(120, 'Item name exceeds 120 characters'),
    price: z.union([z.number(), z.string().transform(Number)])
        .refine(val => val > 0, { message: 'Price must be greater than 0' }),
    stock: z.union([z.number(), z.string().transform(Number)])
        .refine(val => val >= 0, { message: 'Stock must be 0 or greater' })
        .optional(),
    category: z.string().optional(),
    isAvailable: z.boolean().optional(),
}).strict();

const updateItemSchema = z.object({
    name: z.string().min(1, 'Item name cannot be empty').max(120, 'Item name exceeds 120 characters').optional(),
    price: z.union([z.number(), z.string().transform(Number)])
        .refine(val => val > 0, { message: 'Price must be greater than 0' })
        .optional(),
    stock: z.union([z.number(), z.string().transform(Number)])
        .refine(val => val >= 0, { message: 'Stock must be 0 or greater' })
        .optional(),
    category: z.string().optional(),
    isAvailable: z.boolean().optional(),
}).strict();

// ── Orders ──────────────────────────────────────────
const orderSchema = z.object({
    studentId: z.string().uuid('Invalid studentId format (UUID expected)'),
    itemIds: z.array(z.object({
        id: z.string().uuid('Invalid item UUID format'),
        quantity: z.number().int().min(1, 'Quantity must be at least 1').max(50, 'Quantity cannot exceed 50')
    })).min(1, 'Order must contain at least one item'),
    paymentMethod: z.enum(['card', 'cash', 'bank_transfer', 'cliq'], {
        errorMap: () => ({ message: "Payment method must be 'card', 'cash', 'bank_transfer', or 'cliq'" })
    }).optional()
}).strict();

// ── Params ──────────────────────────────────────────
const idParamSchema = z.object({
    id: z.string().uuid('Invalid UUID param format')
}).strict();

const nfcIdParamSchema = z.object({
    nfcId: z.string()
        .min(4, 'NFC ID must be at least 4 characters')
        .max(64, 'NFC ID must not exceed 64 characters')
        .regex(/^[a-zA-Z0-9-_]+$/, 'NFC ID contains invalid characters. Only alphanumeric, -, and _ allowed.')
}).strict();

module.exports = {
    createItemSchema,
    updateItemSchema,
    orderSchema,
    idParamSchema,
    nfcIdParamSchema
};
