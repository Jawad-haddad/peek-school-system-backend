// src/validators/nfc.validator.js
const { z } = require('zod');

const UID_REGEX = /^[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){1,9}$/;

const assignCardSchema = z.object({
    uid: z.string()
        .min(4, 'UID must be at least 4 characters')
        .max(40, 'UID must not exceed 40 characters')
        .regex(UID_REGEX, 'UID must be colon-separated hex bytes, e.g. A1:B2:C3:D4'),
    studentId: z.string().uuid('Invalid student ID format'),
    label: z.string().max(120, 'Label must not exceed 120 characters').optional(),
}).strict();

const scanCardSchema = z.object({
    uid: z.string()
        .min(4, 'UID must be at least 4 characters')
        .max(40, 'UID must not exceed 40 characters'),
    deviceId: z.string().max(64).optional(),
    timestamp: z.string().datetime({ offset: true }).optional(),
}).strict();

const cardIdParamSchema = z.object({
    id: z.string().uuid('Invalid card ID format'),
}).strict();

const createDeviceSchema = z.object({
    name: z.string().min(1).max(100),
}).strict();

const deviceIdParamSchema = z.object({
    id: z.string().uuid('Invalid device ID format'),
}).strict();

module.exports = {
    assignCardSchema,
    scanCardSchema,
    cardIdParamSchema,
    createDeviceSchema,
    deviceIdParamSchema,
};
