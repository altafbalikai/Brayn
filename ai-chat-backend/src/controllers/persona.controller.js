// src/controllers/persona.controller.js
const personaService = require('../services/persona.service');
const logger = require('../config/logger');

/**
 * GET /api/personas
 * Retrieves all active personas.
 */
async function getActivePersonas(req, res, next) {
    try {
        const personas = await personaService.getAllActivePersonas();
        res.json(personas);
    } catch (error) {
        logger.error('Failed to fetch personas:', error);
        res.status(500).json({ error: 'Failed to fetch personas' });
    }
}

/**
 * GET /api/personas/:id
 * Retrieves a specific persona by ID.
 */
async function getPersona(req, res, next) {
    try {
        const persona = await personaService.getPersonaById(req.params.id);
        if (!persona) {
            return res.status(404).json({ error: 'Persona not found' });
        }
        res.json(persona);
    } catch (error) {
        logger.error('Failed to fetch persona:', error);
        res.status(500).json({ error: 'Failed to fetch persona' });
    }
}

module.exports = {
    getActivePersonas,
    getPersona
};
