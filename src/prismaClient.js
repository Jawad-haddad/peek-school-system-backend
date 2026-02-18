// src/prismaClient.js
const { PrismaClient } = require('@prisma/client');

// Singleton pattern — prevents multiple PrismaClient instances during hot-reloads
const globalForPrisma = globalThis;

const prisma =
    globalForPrisma.__prisma ||
    new PrismaClient({
        log:
            process.env.NODE_ENV === 'development'
                ? ['query', 'error', 'warn']
                : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__prisma = prisma;
}

module.exports = prisma;