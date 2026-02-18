const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { updateStudentNfc, getStudentByNfc, getChildren, getStudentById } = require('../controllers/studentController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Students
 *     description: Student management endpoints
 */

const adminActions = [authMiddleware, hasRole([UserRole.school_admin]), belongsToSchool];
const staffActions = [authMiddleware, hasRole([UserRole.school_admin, UserRole.canteen_staff, UserRole.bus_supervisor]), belongsToSchool];

/**
 * @swagger
 * /api/students/{id}/nfc:
 *   patch:
 *     summary: Assign or update an NFC card for a student
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nfc_card_id]
 *             properties:
 *               nfc_card_id:
 *                 type: string
 *     responses:
 *       "200":
 *         description: NFC card updated successfully
 *       "409":
 *         description: NFC card already in use
 */
router.patch('/:id/nfc', adminActions, updateStudentNfc);

/**
 * @swagger
 * /api/students/nfc/{cardId}:
 *   get:
 *     summary: Get student details by NFC card ID
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Student found
 *       "404":
 *         description: Card not found or student not in school
 */
router.get('/nfc/:cardId', staffActions, getStudentByNfc);

/**
 * @swagger
 * /api/students/my-children:
 *   get:
 *     summary: Get children for the logged-in parent
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: List of children with details
 */
router.get('/my-children', [authMiddleware, hasRole([UserRole.parent]), belongsToSchool], getChildren);

/**
 * @swagger
 * /api/students/{studentId}:
 *   get:
 *     summary: Get student profile by ID
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Student details
 *       "404":
 *         description: Student not found
 */
router.get('/:studentId', staffActions, getStudentById);

module.exports = router;
