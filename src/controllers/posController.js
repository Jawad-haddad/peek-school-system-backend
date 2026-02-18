// src/controllers/posController.js

const prisma = require('../prismaClient');
const { WalletTxnType, POSOrderStatus } = require('@prisma/client');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');
const { processTransaction } = require('./financeController'); // Import shared logic

// ... (previous imports)

// --- Helper Functions for createPosOrder ---

/**
 * Fetches and validates the student and items for a POS order.
 * @throws {Error} If student or items are not valid.
 */
async function validateOrderPrerequisites(studentId, itemIds, schoolId) {
    const studentPromise = prisma.student.findFirst({
        where: { id: studentId, schoolId },
        select: {
            id: true,
            wallet_balance: true,
            parentId: true,
            fullName: true,
            schoolId: true,
            daily_spending_limit: true // Include daily limit
        }
    });

    const itemsContentPromise = prisma.canteenItem.findMany({
        where: { id: { in: itemIds.map(i => i.id) }, schoolId, isAvailable: true }
    });

    const [student, itemsFromDb] = await Promise.all([studentPromise, itemsContentPromise]);

    if (!student) {
        const err = new Error('Student not found in this school.');
        err.statusCode = 404;
        throw err;
    }
    if (itemsFromDb.length !== itemIds.length) {
        const err = new Error('One or more items are invalid or unavailable.');
        err.statusCode = 400;
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
            status: POSOrderStatus.completed // Only count completed orders
        },
        select: { total: true }
    });

    return orders.reduce((sum, order) => sum + Number(order.total), 0);
}


// --- Main Controller Functions ---

const createPosOrder = async (req, res) => {
    const { studentId, itemIds } = req.body;
    const schoolId = req.user.schoolId;

    try {
        // Step 1: Validate prerequisites (student, items)
        const { student, itemsFromDb } = await validateOrderPrerequisites(studentId, itemIds, schoolId);

        // Step 2: Calculate total
        const total = calculateOrderTotal(itemIds, itemsFromDb);

        // Step 3: Atomic Transaction via Finance Controller
        const result = await prisma.$transaction(async (tx) => {
            // Use the shared processTransaction logic which handles:
            // - Balance checks
            // - Daily limits
            // - Creating the WalletTransaction
            // - Updating Student balance
            const { transaction: walletTxn } = await processTransaction(tx, {
                studentId,
                schoolId,
                amount: -total, // Negative amount for deduction
                type: WalletTxnType.purchase,
                description: `Canteen Purchase`
            });

            // Create POS Order linked to the Wallet Transaction
            const order = await tx.pOSOrder.create({
                data: {
                    schoolId,
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

        res.status(201).json(finalOrder);

    } catch (error) {
        logger.error({ error: error.message }, "Error creating POS order");
        // Map common errors from processTransaction
        if (error.message.includes("Insufficient wallet balance")) {
            return res.status(402).json({ message: error.message });
        }
        if (error.message.includes("Daily spending limit")) {
            return res.status(403).json({ message: error.message });
        }
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(500).json({ message: 'Something went wrong during the transaction.' });
    }
};

const getCanteenItems = async (req, res) => {
    const schoolId = req.user.schoolId;
    try {
        const items = await prisma.canteenItem.findMany({
            where: { schoolId },
            orderBy: { name: 'asc' }
        });
        res.json(items);
    } catch (error) {
        logger.error({ error: error.message }, "Error fetching canteen items");
        res.status(500).json({ message: "Failed to fetch canteen items." });
    }
};

const addCanteenItem = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { name, price, category } = req.body;

    if (!name || price === undefined || !category) {
        return res.status(400).json({ message: 'Item name, price, and category are required.' });
    }
    if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({ message: 'Price must be a non-negative number.' });
    }

    try {
        const newItem = await prisma.canteenItem.create({
            data: { name, price, category, schoolId }
        });
        res.status(201).json(newItem);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: `An item with the name "${name}" already exists in your school's canteen.` });
        }
        logger.error({ error: error.message }, "Error adding canteen item");
        res.status(500).json({ message: "Failed to add item to canteen." });
    }
};

const updateCanteenItem = async (req, res) => {
    const { id } = req.params;
    const schoolId = req.user.schoolId;
    const { name, price, category, isAvailable } = req.body;

    try {
        // Ensure item belongs to school
        const item = await prisma.canteenItem.findFirst({ where: { id, schoolId } });
        if (!item) return res.status(404).json({ message: "Item not found." });

        const updatedItem = await prisma.canteenItem.update({
            where: { id },
            data: {
                name: name || undefined,
                price: price !== undefined ? price : undefined,
                category: category || undefined,
                isAvailable: isAvailable !== undefined ? isAvailable : undefined
            }
        });
        res.json(updatedItem);
    } catch (error) {
        logger.error({ error: error.message }, "Error updating canteen item");
        res.status(500).json({ message: "Failed to update item." });
    }
};

const deleteCanteenItem = async (req, res) => {
    const { id } = req.params;
    const schoolId = req.user.schoolId;

    try {
        const item = await prisma.canteenItem.findFirst({ where: { id, schoolId } });
        if (!item) return res.status(404).json({ message: "Item not found." });

        await prisma.canteenItem.delete({ where: { id } });
        res.json({ message: "Item deleted successfully." });
    } catch (error) {
        logger.error({ error: error.message }, "Error deleting canteen item");
        res.status(500).json({ message: "Failed to delete item." });
    }
};

const verifyCard = async (req, res) => {
    const { nfcId } = req.params;
    const schoolId = req.user.schoolId;

    try {
        const student = await prisma.student.findFirst({
            where: { nfc_card_id: nfcId, schoolId },
            select: {
                id: true,
                fullName: true,
                is_nfc_active: true,
                wallet_balance: true,
                daily_spending_limit: true
            }
        });

        if (!student) {
            // Either card doesn't exist OR belongs to another school
            return res.status(404).json({ message: "Card not valid for this school." });
        }

        if (!student.is_nfc_active) {
            return res.status(403).json({ message: "Card is frozen by parent." });
        }

        return res.status(200).json({
            message: "Card Verified",
            student
        });

    } catch (error) {
        logger.error({ error: error.message }, "Error verifying card");
        res.status(500).json({ message: "Verification failed." });
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