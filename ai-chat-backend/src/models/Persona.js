// src/models/Persona.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const personaSchema = new Schema({
    id: { type: String, unique: true, required: true }, // UUID for API consistency
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    description: { type: String, required: true },
    detailedDescription: { type: String },
    iconUrl: { type: String },
    systemPrompt: { type: String, required: true },
    exampleOutput: { type: String },
    category: {
        type: String,
        enum: ['legal', 'creative', 'support', 'technical', 'business', 'education'],
        required: true
    },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
}, { timestamps: true });

// Index for frequent lookups
personaSchema.index({ id: 1 });
personaSchema.index({ slug: 1 });
personaSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('Persona', personaSchema);
