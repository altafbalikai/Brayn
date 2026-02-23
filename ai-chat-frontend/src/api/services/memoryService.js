// src/api/services/memoryService.js
import { refreshAccessToken } from '../axios';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;


if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not defined");
}

/**
 * Shared fetch wrapper for memory endpoints.
 * Mirrors the pattern in llmModelsService.js — token from
 * localStorage, automatic 401 retry with refresh, error normalization.
 */
async function fetchClient(url, options = {}) {
    const token = localStorage.getItem("accessToken");
    const retry = options.retry !== false;

    const res = await fetch(`${API_BASE_URL}/user/memory${url}`, {
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
            localStorage.removeItem("accessToken");
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

    // DELETE /user/memory/:key returns body — but handle 204 defensively
    if (res.status === 204) return null;

    return res.json();
}

/**
 * GET /user/memory
 * Fetch all memories for the current user.
 * @returns {Promise<Array>} List of memory objects.
 */
export function getMemories() {
    return fetchClient("/")
        .then(data => data.memories);
}

/**
 * PATCH /user/memory/:key/toggle
 * Toggle the enabled status of a specific memory key.
 * @param {string} key
 * @param {boolean} enabled
 * @returns {Promise<Object>}
 */
export function toggleMemory(key, enabled) {
    if (!key) throw new Error("Memory key is required");
    return fetchClient(`/${key}/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
    });
}

/**
 * PATCH /user/memory/:key/value
 * Edit the value of a specific memory key.
 * @param {string} key
 * @param {string} newValue
 * @returns {Promise<Object>}
 */
export function editMemory(key, newValue) {
    if (!key) throw new Error("Memory key is required");
    return fetchClient(`/${key}/value`, {
        method: "PATCH",
        body: JSON.stringify({ value: newValue }),
    });
}

/**
 * DELETE /user/memory/:key
 * Delete a specific memory key.
 * @param {string} key
 * @returns {Promise<Object>}
 */
export function deleteMemory(key) {
    if (!key) throw new Error("Memory key is required");
    return fetchClient(`/${key}`, {
        method: "DELETE",
    });
}