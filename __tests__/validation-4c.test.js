// __tests__/validation-4c.test.js
const request = require('supertest');
const express = require('express');

// 1. Mock the controllers so we only test validation logic
jest.mock('../src/controllers/financeController', () => ({
    createFeeStructure: jest.fn(),
    issueInvoice: (req, res) => res.status(200).json({ success: true, data: { fake: 'invoice-issued' } }),
    recordPayment: (req, res) => res.status(200).json({ success: true, data: { fake: 'payment-recorded' } }),
    topUpWallet: (req, res) => res.status(200).json({ success: true, data: { fake: 'wallet-topped-up' } }),
    getWalletHistory: (req, res) => res.status(200).json({ success: true, data: { fake: 'wallet-history' } }),
}));

// Ignore non-target controller setups
jest.mock('../src/controllers/schoolController', () => ({}));
jest.mock('../src/controllers/studentController', () => ({}));
jest.mock('../src/controllers/examController', () => ({}));
jest.mock('../src/controllers/statsController', () => ({}));
jest.mock('../src/controllers/academicController', () => ({}));

// 2. Mock authMiddleware to purely pass-through and set a fake admin role so we bypass RBAC
jest.mock('../src/middleware/authMiddleware', () => ({
    authMiddleware: (req, res, next) => {
        req.user = { id: 'test', role: 'school_admin', schoolId: 'school-A' };
        next();
    },
    hasRole: () => (req, res, next) => next(),
    belongsToSchool: (req, res, next) => next()
}));

// Require routes
const financeRoutes = require('../src/routes/financeRoutes');

// 3. Setup Express app
const app = express();
app.use(express.json());
app.use('/api/finance', financeRoutes);

// ── TEST SUITE ──────────────────────────────────────────

describe('Input Validation 4C (Finance)', () => {

    describe('POST /api/finance/wallet/topup', () => {
        it('topUp missing amount → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/finance/wallet/topup')
                .send({ studentId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'amount' })
                ])
            );
        });

        it('topUp negative amount → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/finance/wallet/topup')
                .send({ studentId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57', amount: -50 });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'amount', message: 'Top up amount must be greater than 0' })
                ])
            );
        });

        it('topUp exceeding 100,000 threshold → 400', async () => {
            const res = await request(app)
                .post('/api/finance/wallet/topup')
                .send({ studentId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57', amount: 100001 });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('topUp valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/finance/wallet/topup')
                .send({ studentId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57', amount: 50 });
            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/finance/invoices', () => {
        it('issueInvoice invalid studentId → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/finance/invoices')
                .send({ studentId: 'not-a-uuid', feeStructureId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'studentId' })
                ])
            );
        });

        it('issueInvoice valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/finance/invoices')
                .send({ studentId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57', feeStructureId: '9fa7b949-fa08-4e89-9b48-37f223bb7e57' });
            expect(res.status).toBe(200);
        });
    });

    describe('POST /api/finance/invoices/:invoiceId/payments', () => {
        it('recordPayment params: invalid invoiceId → 400 VALIDATION_ERROR', async () => {
            // Valid payload, but bad param format forces params validator bounce
            const res = await request(app)
                .post('/api/finance/invoices/not-a-uuid/payments')
                .send({ amount: 100, paymentMethod: 'card' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'invoiceId' })
                ])
            );
        });

        it('recordPayment invalid method → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/finance/invoices/4bc7b949-fa08-4e89-9b48-37f223bb7e57/payments')
                .send({ amount: 100, paymentMethod: 'bitcoin' }); // enum test

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'paymentMethod', message: 'Invalid option: expected one of "card"|"cash"|"bank_transfer"|"cliq"' })
                ])
            );
        });

        it('recordPayment missing amount → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/finance/invoices/4bc7b949-fa08-4e89-9b48-37f223bb7e57/payments')
                .send({ paymentMethod: 'cash' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'amount' })
                ])
            );
        });

        it('recordPayment valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/finance/invoices/4bc7b949-fa08-4e89-9b48-37f223bb7e57/payments')
                .send({ amount: 1000, paymentMethod: 'bank_transfer' });
            expect(res.status).toBe(200);
        });
    });

    describe('GET /api/finance/wallet/:studentId/history', () => {
        it('wallet history invalid limit parameter → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .get('/api/finance/wallet/123/history?limit=300'); // > 200

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'limit', message: 'Limit must be between 1 and 200' })
                ])
            );
        });

        it('wallet history valid query → 200', async () => {
            const res = await request(app)
                .get('/api/finance/wallet/123/history?limit=50&from=2024-01-01');

            expect(res.status).toBe(200);
        });
    });

});
