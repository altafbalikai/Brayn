// src/services/persona.service.js
const Persona = require('../models/Persona');

/**
 * Get all active personas sorted by order.
 * @returns {Promise<Array>}
 */
async function getAllActivePersonas() {
    return await Persona.find({ isActive: true })
        .sort({ order: 1 })
        .lean();
}

/**
 * Get a specific persona by its UUID (id field).
 * @param {string} personaId 
 * @returns {Promise<Object|null>}
 */
async function getPersonaById(personaId) {
    return await Persona.findOne({ id: personaId }).lean();
}

module.exports = {
    getAllActivePersonas,
    getPersonaById
};
