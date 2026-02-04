const express = require('express');
const router = express.Router();
const { authMiddleware, belongsToSchool } = require('../middleware/authMiddleware');
const { sendMessage, getConversation, getContacts } = require('../controllers/chatController');

// All chat routes require authentication and belonging to a school
const chatActions = [authMiddleware, belongsToSchool];

/**
 * @swagger
 * tags:
 *   - name: Chat
 *     description: APIs for direct messaging
 */

/**
 * @swagger
 * /api/chat/send:
 *   post:
 *     summary: Send a message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiverId
 *               - content
 *             properties:
 *               receiverId:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       "201":
 *         description: Message sent
 */
router.post('/send', chatActions, sendMessage);

/**
 * @swagger
 * /api/chat/conversation/{contactId}:
 *   get:
 *     summary: Get conversation with a specific contact
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: List of messages
 */
router.get('/conversation/:contactId', chatActions, getConversation);

/**
 * @swagger
 * /api/chat/contacts:
 *   get:
 *     summary: Get a list of chat contacts
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: List of contacts (Users)
 */
router.get('/contacts', chatActions, getContacts);

module.exports = router;
