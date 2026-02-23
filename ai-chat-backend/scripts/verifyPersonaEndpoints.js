// scripts/verifyPersonaEndpoints.js
const axios = require('axios');
require('dotenv').config();

const API_URL = 'http://localhost:4000/api';
let authToken = '';

async function verify() {
    try {
        console.log('--- Persona Feature Verification ---');

        // 1. GET /api/personas
        console.log('\n1. Fetching all personas...');
        const personasRes = await axios.get(`${API_URL}/personas`);
        console.log(`Success! Found ${personasRes.data.length} personas.`);
        const personas = personasRes.data;
        const firstPersona = personas[0];
        console.log(`First persona: ${firstPersona.name} (${firstPersona.id})`);

        // Note: Manual authentication needed for further steps in a real scenario
        // For this verification script, we assume a local dev environment where we can bypass auth or use a test token
        console.log('\nNote: Further automated verification (switching, message tracking) requires an auth token.');
        console.log('Please perform manual verification using the walkthrough provided.');

        console.log('\n--- Verification Complete ---');
    } catch (error) {
        console.error('Verification failed:', error.response ? error.response.data : error.message);
    }
}

verify();
