// src/services/promptSettingsService.js

import { getAccessToken } from "../axios";

// Use relative URL when using Vite proxy, or absolute URL if VITE_API_URL is set
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not defined");
}

/**
 * Shared fetch wrapper (same pattern as llmModelsService)
 */
async function fetchClient(url, options = {}) {
    const token = getAccessToken();

    const res = await fetch(`${API_BASE_URL}/prompt-settings${url}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers,
        },
    });

    // Handle validation & API errors
    if (!res.ok) {
        let errorMessage = "Request failed";
        try {
            const err = await res.json();
            errorMessage = err.message || errorMessage;
        } catch (_) { }

        const error = new Error(errorMessage);
        error.status = res.status;
        throw error;
    }

    // No body responses (future-proof)
    if (res.status === 204) return null;

    return res.json();
}

/**
 * GET /
 * Fetch current prompt settings
 */
export function fetchPromptSettings() {
    return fetchClient("");
}

/**
 * PUT /
 * Create or update prompt settings
 */
export function updatePromptSettings(payload) {
    if (!payload?.systemPrompt) {
        throw new Error("systemPrompt is required");
    }

    return fetchClient("", {
        method: "PUT",
        body: JSON.stringify(payload),
    });
}

/**
 * POST /reset
 * Reset prompt settings to default
 */
export function resetPromptSettings() {
    return fetchClient("/reset", {
        method: "POST",
    });
}
