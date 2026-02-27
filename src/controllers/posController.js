// src/controllers/posController.js

const prisma = require('../prismaClient');
const { WalletTxnType, POSOrderStatus } = require('@prisma/client');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');
const { processTransaction } = require('./financeController');
const { ok, fail } = require('../utils/response');
const { getTenant, tenantWhere, assertTenantEntity } = require('../utils/tenant');

// --- Helper Functions for createPosOrder ---

/**
 * Fetches and validates the student and items for a POS order.
 * Uses tenantWhere for school-scoped lookups.
 * @throws {Error} If student or items are not valid.
 */
async function validateOrderPrerequisites(req, studentId, itemIds) {
    const studentPromise = prisma.student.findFirst({
        where: tenantWhere(req, { id: studentId }),
        select: {
            id: true,
            wallet_balance: true,
            parentId: true,
            fullName: true,
            schoolId: true,
            daily_spending_limit: true
        }
    });

    // Items must also belong to the same school and be available
    const itemsContentPromise = prisma.canteenItem.findMany({
        where: tenantWhere(req, { id: { in: itemIds.map(i => i.id) }, isAvailable: true })
    });

    const [student, itemsFromDb] = await Promise.all([studentPromise, itemsContentPromise]);

    if (!student) {
        const err = new Error('Student not found in this school.');
        err.statusCode = 404;
        throw err;
    }
    if (itemsFromDb.length !== itemIds.length) {
        const err = new Error('One or more items are invalid, unavailable, or belong to another school.');
        err.statusCode = 404;
        throw err;
    }

    return { student, itemsFromDb };
}

/**
 * Calculates the total cost of an order.
 */
function calculateOrderTotal(itemIds, itemsFromDb) {
    return itemIds.reduce((sum, orderItem) => {
        const dbItem = itemsFromDb.find(i => i.id === orderItem.id);
        const quantity = Math.max(1, Math.floor(orderItem.quantity || 1));
        return sum + (Number(dbItem.price) * quantity);
    }, 0);
}

/**
 * Calculates the total spent by the student today.
 */
async function getDailySpend(studentId, schoolId) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const orders = await prisma.pOSOrder.findMany({
        where: {
            studentId,
            schoolId,
            createdAt: {
                gte: startOfDay,
                lte: endOfDay
            },
            status: POSOrderStatus.completed
        },
        select: { total: true }
    });

    return orders.reduce((sum, order) => sum + Number(order.total), 0);
}


// --- Main Controller Functions ---

const createPosOrder = async (req, res) => {
    const { studentId, itemIds } = req.body;
    // Force schoolId from tenant — ignore any client-supplied schoolId
    const { schoolId } = getTenant(req);

    try {
        // Step 1: Validate prerequisites (student + items in same school)
        const { student, itemsFromDb } = await validateOrderPrerequisites(req, studentId, itemIds);

        // Step 2: Calculate total
        const total = calculateOrderTotal(itemIds, itemsFromDb);

        // Step 3: Atomic Transaction via Finance Controller
        const result = await prisma.$transaction(async (tx) => {
            const { transaction: walletTxn } = await processTransaction(tx, {
                studentId,
                schoolId: student.schoolId, // Use the student's actual schoolId (verified by tenantWhere)
                amount: -total,
                type: WalletTxnType.purchase,
                description: `Canteen Purchase`
            });

            // Create POS Order
            const order = await tx.pOSOrder.create({
                data: {
                    schoolId: student.schoolId,
                    studentId,
                    total,
                    status: POSOrderStatus.completed,
                    paidByWallet: true,
                    walletTxnId: walletTxn.id
                }
            });

            // Create Order Items
            const orderItemsData = itemIds.map(orderItem => {
                const dbItem = itemsFromDb.find(i => i.id === orderItem.id);
                const quantity = Math.max(1, Math.floor(orderItem.quantity || 1));
                return {
                    orderId: order.id,
                    itemId: orderItem.id,
                    quantity,
                    unitPrice: dbItem.price,
                    lineTotal: Number(dbItem.price) * quantity
                };
            });

            await tx.pOSOrderItem.createMany({ data: orderItemsData });

            return order;
        });

        const finalOrder = await prisma.pOSOrder.findUnique({
            where: { id: result.id },
            include: { items: { include: { item: { select: { name: true } } } } }
        });

        // Step 4: Send notification
        if (student.parentId) {
            sendNotification({
                userId: student.parentId,
                title: 'Canteen Purchase',
                body: `Your child, ${student.fullName}, made a purchase from the canteen for a total of ${total.toFixed(2)} JOD.`,
                data: { orderId: finalOrder.id, screen: 'WalletHistory' },
                preferenceType: 'wallet'
            });
        }

        ok(res, finalOrder, null, 201);

    } catch (error) {
        logger.error({ error: error.message }, "Error creating POS order");
        if (error.message.includes("Insufficient wallet balance")) {
            return fail(res, 402, error.message, 'INSUFFICIENT_BALANCE');
        }
        if (error.message.includes("Daily spending limit")) {
            return fail(res, 403, error.message, 'DAILY_LIMIT_EXCEEDED');
        }
        if (error.statusCode) {
            return fail(res, error.statusCode, error.message, 'NOT_FOUND');
        }
        fail(res, 500, 'Something went wrong during the transaction.', 'SERVER_ERROR');
    }
};

const getCanteenItems = async (req, res) => {
    try {
        const items = await prisma.canteenItem.findMany({
            where: tenantWhere(req),
            orderBy: { name: 'asc' }
        });
        ok(res, items);
    } catch (error) {
        logger.error({ error: error.message }, "Error fetching canteen items");
        fail(res, 500, 'Failed to fetch canteen items.', 'SERVER_ERROR');
    }
};

const addCanteenItem = async (req, res) => {
    // Force schoolId from tenant — ignore any client-supplied schoolId
    const { schoolId } = getTenant(req);
    const { name, price, category } = req.body;

    if (!name || price === undefined || !category) {
        return fail(res, 400, 'Item name, price, and category are required.', 'VALIDATION_ERROR');
    }
    if (typeof price !== 'number' || price < 0) {
        return fail(res, 400, 'Price must be a non-negative number.', 'VALIDATION_ERROR');
    }

    try {
        const newItem = await prisma.canteenItem.create({
            data: { name, price, category, schoolId }
        });
        ok(res, newItem, null, 201);
    } catch (error) {
        if (error.code === 'P2002') {
            return fail(res, 409, `An item with the name "${name}" already exists in your school's canteen.`, 'DUPLICATE_ITEM');
        }
        logger.error({ error: error.message }, "Error adding canteen item");
        fail(res, 500, 'Failed to add item to canteen.', 'SERVER_ERROR');
    }
};

const updateCanteenItem = async (req, res) => {
    const { id } = req.params;
    const { name, price, category, isAvailable } = req.body;

    try {
        // Tenant-scoped lookup
        const item = await prisma.canteenItem.findFirst({ where: tenantWhere(req, { id }) });
        if (!item) return fail(res, 404, 'Item not found.', 'NOT_FOUND');

        // Defense-in-depth: explicit tenant check before mutation
        if (assertTenantEntity(req, res, item.schoolId)) return;

        const updatedItem = await prisma.canteenItem.update({
            where: { id },
            data: {
                name: name || undefined,
                price: price !== undefined ? price : undefined,
                category: category || undefined,
                isAvailable: isAvailable !== undefined ? isAvailable : undefined
            }
        });
        ok(res, updatedItem);
    } catch (error) {
        logger.error({ error: error.message }, "Error updating canteen item");
        fail(res, 500, 'Failed to update item.', 'SERVER_ERROR');
    }
};

const deleteCanteenItem = async (req, res) => {
    const { id } = req.params;

    try {
        // Tenant-scoped lookup
        const item = await prisma.canteenItem.findFirst({ where: tenantWhere(req, { id }) });
        if (!item) return fail(res, 404, 'Item not found.', 'NOT_FOUND');

        // Defense-in-depth: explicit tenant check before mutation
        if (assertTenantEntity(req, res, item.schoolId)) return;

        await prisma.canteenItem.delete({ where: { id } });
        ok(res, { message: 'Item deleted successfully.' });
    } catch (error) {
        logger.error({ error: error.message }, "Error deleting canteen item");
        fail(res, 500, 'Failed to delete item.', 'SERVER_ERROR');
    }
};

const verifyCard = async (req, res) => {
    const { nfcId } = req.params;

    try {
        // Tenant-scoped: card must belong to this school
        const student = await prisma.student.findFirst({
            where: tenantWhere(req, { nfc_card_id: nfcId }),
            select: {
                id: true,
                fullName: true,
                is_nfc_active: true,
                wallet_balance: true,
                daily_spending_limit: true
            }
        });

        if (!student) {
            return fail(res, 404, 'Card not valid for this school.', 'NOT_FOUND');
        }

        if (!student.is_nfc_active) {
            return fail(res, 403, 'Card is frozen by parent.', 'CARD_FROZEN');
        }

        ok(res, { message: 'Card Verified', student });

    } catch (error) {
        logger.error({ error: error.message }, "Error verifying card");
        fail(res, 500, 'Verification failed.', 'SERVER_ERROR');
    }
};

module.exports = {
    createPosOrder,
    getCanteenItems,
    addCanteenItem,
    updateCanteenItem,
    deleteCanteenItem,
    verifyCard
};