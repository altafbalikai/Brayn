// src/routes/persona.routes.js
const express = require('express');
const router = express.Router();
const personaController = require('../controllers/persona.controller');

/**
 * @swagger
 * /api/personas:
 *   get:
 *     summary: Get all active personas
 *     tags: [Personas]
 *     responses:
 *       200:
 *         description: List of active personas
 */
router.get('/', personaController.getActivePersonas);

/**
 * @swagger
 * /api/personas/{id}:
 *   get:
 *     summary: Get a specific persona by ID
 *     tags: [Personas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Persona details
 *       404:
 *         description: Persona not found
 */
router.get('/:id', personaController.getPersona);

module.exports = router;
