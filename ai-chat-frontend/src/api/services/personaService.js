// src/api/services/personaService.js
import { refreshAccessToken, getAccessToken, setAccessToken } from '../axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not defined");
}

/**
 * Shared fetch wrapper for persona endpoints.
 * Mirrors the pattern in memoryService.js — token from
 * localStorage, automatic 401 retry with refresh, error normalization.
 */
async function fetchClient(url, options = {}) {
    const token = getAccessToken();
    const retry = options.retry !== false;

    // The backend persona routes are prefixed with /api/personas or /api/conversations
    // The provided endpoints are:
    // GET /api/personas
    // GET /api/personas/:id
    // POST /api/conversations/:cid/switch-persona

    // The fetchClient in memoryService.js adds /user/memory prefix.
    // For personas, we should probably just use the URL as provided or adjust.
    // The user's provided code for personaService.js uses absolute paths starting with /api

    const res = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers,
        },
    });

    // Handle unauthorized — refresh and retry once
    if (res.status === 401 && retry) {
        try {
            const newToken = await refreshAccessToken();
            setAccessToken(newToken);
            return fetchClient(
                url,
                {
                    ...options,
                    headers: {
                        ...options.headers,
                        Authorization: `Bearer ${newToken}`,
                    },
                    retry: false,
                }
            );
        } catch (refreshError) {
            setAccessToken(null);
            throw refreshError;
        }
    }

    // Normalize API errors
    if (!res.ok) {
        let errorMessage = "Request failed";
        try {
            const err = await res.json();
            errorMessage = err.message || err.error || errorMessage;
        } catch (_) { }

        const error = new Error(errorMessage);
        error.status = res.status;
        throw error;
    }

    return res.json();
}

/**
 * GET /api/personas
 * Fetch all available personas
 * @returns {Promise<Array>} List of persona objects.
 */
export function getPersonas() {
    return fetchClient("/personas");
}

/**
 * GET /api/personas/:id
 * Fetch a specific persona by ID
 * @param {string} personaId - UUID of the persona
 * @returns {Promise<Object>} Persona details
 */
export function getPersonaById(personaId) {
    if (!personaId) throw new Error("Persona ID is required");
    return fetchClient(`/personas/${personaId}`);
}

/**
 * POST /api/conversations/:cid/switch-persona
 * Switch persona in a conversation
 * @param {string} conversationId - ID of the conversation
 * @param {string} personaId - UUID of the persona
 * @returns {Promise<Object>} Updated conversation
 */
export function switchPersona(conversationId, personaId) {
    if (!conversationId) throw new Error("Conversation ID is required");
    if (!personaId) throw new Error("Persona ID is required");

    return fetchClient(`/conversations/${conversationId}/switch-persona`, {
        method: "POST",
        body: JSON.stringify({ personaId }),
    });
}

/**
 * GET /api/user/persona-preference
 * Get user's last used persona preference
 * @returns {Promise<Object>} Last persona used
 */
export function getLastUsedPersona() {
    return fetchClient("/user/persona-preference")
        .catch(err => {
            // Preference may not exist yet — return null instead of failing
            if (err.status === 404) return null;
            throw err;
        });
}

/**
 * POST /api/user/persona-preference
 * Save user's persona preference
 * @param {string} personaId - UUID to save as preference
 * @returns {Promise<Object>} Updated preference
 */
export function savePersonaPreference(personaId) {
    if (!personaId) throw new Error("Persona ID is required");

    return fetchClient("/user/persona-preference", {
        method: "POST",
        body: JSON.stringify({ personaId }),
    });
}
