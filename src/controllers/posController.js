// src/controllers/posController.js

const prisma = require('../prismaClient');
const { WalletTxnType, POSOrderStatus } = require('@prisma/client');
const { sendNotification } = require('../services/notificationService');

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

    const itemsPromise = prisma.canteenItem.findMany({
        where: { id: { in: itemIds.map(i => i.id) }, schoolId, isAvailable: true }
    });

    const [student, itemsFromDb] = await Promise.all([studentPromise, itemsPromise]);

    if (!student) {
        throw { statusCode: 404, message: 'Student not found in this school.' };
    }
    if (itemsFromDb.length !== itemIds.length) {
        throw { statusCode: 400, message: 'One or more items are invalid or unavailable.' };
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

        // Step 2: Calculate total and validate balance
        const total = calculateOrderTotal(itemIds, itemsFromDb);
        if (Number(student.wallet_balance) < total) {
            return res.status(402).json({ 
                message: 'Insufficient wallet balance.',
                currentBalance: student.wallet_balance,
                orderTotal: total
            });
        }

        // --- NEW: Daily Spending Limit Check ---
        if (student.daily_spending_limit) {
            const currentDailySpend = await getDailySpend(studentId, schoolId);
            if ((currentDailySpend + total) > Number(student.daily_spending_limit)) {
                return res.status(403).json({ 
                    message: 'Daily spending limit exceeded.',
                    limit: student.daily_spending_limit,
                    currentUsage: currentDailySpend,
                    attempted: total
                });
            }
        }
        // ---------------------------------------

        // Step 3: Perform the database transaction
        const newOrder = await prisma.$transaction(async (tx) => {
            const walletTxn = await tx.walletTransaction.create({
                data: { studentId, schoolId, amount: -total, type: WalletTxnType.purchase, description: `Canteen purchase.` }
            });

            await tx.student.update({
                where: { id: studentId },
                data: { wallet_balance: { decrement: total } }
            });

            const order = await tx.pOSOrder.create({
                data: { schoolId, studentId, total, status: POSOrderStatus.completed, walletTxnId: walletTxn.id }
            });

            const orderItemsData = itemIds.map(orderItem => {
                const dbItem = itemsFromDb.find(i => i.id === orderItem.id);
                const quantity = Math.max(1, Math.floor(orderItem.quantity || 1));
                return { orderId: order.id, itemId: orderItem.id, quantity, unitPrice: dbItem.price, lineTotal: Number(dbItem.price) * quantity };
            });
            
            await tx.pOSOrderItem.createMany({ data: orderItemsData });
            return order;
        });

        const finalOrder = await prisma.pOSOrder.findUnique({
            where: { id: newOrder.id },
            include: { items: { include: { item: { select: { name: true } } } } }
        });

        // Step 4: Send notification with preferenceType
        if (student.parentId) {
            sendNotification({
                userId: student.parentId,
                title: 'Canteen Purchase',
                body: `Your child, ${student.fullName}, made a purchase from the canteen for a total of ${total.toFixed(2)} JOD.`,
                data: { orderId: finalOrder.id, screen: 'WalletHistory' },
                preferenceType: 'wallet' // Mapped to lowBalanceWarning in service for now, or we can add a specific one later
            });
        }

        res.status(201).json(finalOrder);

    } catch (error) {
        // Centralized error handling
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error("Error creating POS order:", error);
        res.status(500).json({ message: 'Something went wrong during the transaction.' });
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
        console.error("Error adding canteen item:", error);
        res.status(500).json({ message: "Failed to add item to canteen." });
    }
};

module.exports = { createPosOrder, addCanteenItem };