// __tests__/validation-4d.test.js
const request = require('supertest');
const express = require('express');

// 1. Mock controllers isolating validation layers
jest.mock('../src/controllers/posController', () => ({
    createPosOrder: (req, res) => res.status(200).json({ success: true, data: { fake: 'order-created' } }),
    addCanteenItem: (req, res) => res.status(200).json({ success: true, data: { fake: 'item-added' } }),
    getCanteenItems: jest.fn(),
    updateCanteenItem: (req, res) => res.status(200).json({ success: true, data: { fake: 'item-updated' } }),
    deleteCanteenItem: (req, res) => res.status(200).json({ success: true, data: { fake: 'item-deleted' } }),
    verifyCard: (req, res) => res.status(200).json({ success: true, data: { fake: 'card-verified' } })
}));

jest.mock('../src/controllers/schoolController', () => ({}));
jest.mock('../src/controllers/financeController', () => ({}));

// 2. Mock auth middleware explicitly passing all tests through with arbitrary super roles 
jest.mock('../src/middleware/authMiddleware', () => ({
    authMiddleware: (req, res, next) => {
        req.user = { id: 'test', role: 'school_admin', schoolId: 'school-A' };
        next();
    },
    hasRole: () => (req, res, next) => next(),
    belongsToSchool: (req, res, next) => next()
}));

const posRoutes = require('../src/routes/posRoutes');

// 3. Setup test express app
const app = express();
app.use(express.json());
app.use('/api/pos', posRoutes);

// ── TEST SUITE ──────────────────────────────────────────

describe('Input Validation 4D (POS)', () => {

    describe('POST /api/pos/items', () => {
        it('create item missing name → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/pos/items')
                .send({ price: 10 });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'name' })
                ])
            );
        });

        it('create item negative price → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/pos/items')
                .send({ name: 'Chips', price: -5 });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'price', message: 'Price must be greater than 0' })
                ])
            );
        });

        it('create item valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/pos/items')
                .send({ name: 'Juice Box', price: 2.5, stock: 100 });
            expect(res.status).toBe(200);
        });
    });

    describe('PUT /api/pos/items/:id', () => {
        it('update item invalid price type → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .put('/api/pos/items/4bc7b949-fa08-4e89-9b48-37f223bb7e57')
                .send({ price: -5, name: "Juice Box" });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'price' })
                ])
            );
        });
    });

    describe('DELETE /api/pos/items/:id', () => {
        it('delete item invalid UUID param → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .delete('/api/pos/items/not-a-valid-uuid');

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'id' })
                ])
            );
        });
    });

    describe('POST /api/pos/orders', () => {
        it('create order empty items array → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/pos/orders')
                .send({ studentId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57', itemIds: [] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'itemIds', message: 'Order must contain at least one item' })
                ])
            );
        });

        it('create order invalid quantity (0) → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/pos/orders')
                .send({
                    studentId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57',
                    itemIds: [{ id: '9fa7b949-fa08-4e89-9b48-37f223bb7e57', quantity: 0 }]
                });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'itemIds.0.quantity' }) // Nested map path matches zod arrays
                ])
            );
        });

        it('create order invalid studentId → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .post('/api/pos/orders')
                .send({ studentId: 'bad-uuid', itemIds: [{ id: '9fa7b949-fa08-4e89-9b48-37f223bb7e57', quantity: 1 }] });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'studentId' })
                ])
            );
        });

        it('create order valid payload → 200', async () => {
            const res = await request(app)
                .post('/api/pos/orders')
                .send({
                    studentId: '4bc7b949-fa08-4e89-9b48-37f223bb7e57',
                    itemIds: [{ id: '9fa7b949-fa08-4e89-9b48-37f223bb7e57', quantity: 2 }]
                });
            expect(res.status).toBe(200);
        });
    });

    describe('GET /api/pos/verify-card/:nfcId', () => {
        it('verify-card invalid nfcId param (too short) → 400 VALIDATION_ERROR', async () => {
            const res = await request(app)
                .get('/api/pos/verify-card/12'); // 2 chars (requires 4)

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ field: 'nfcId', message: 'NFC ID must be at least 4 characters' })
                ])
            );
        });
    });

});
