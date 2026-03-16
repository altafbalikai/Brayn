// src/services/llmModelsService.js

import { refreshAccessToken, getAccessToken, setAccessToken } from "../axios";

// Use relative URL when using Vite proxy, or absolute URL if VITE_API_URL is set
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not defined");
}

/**
 * Shared fetch wrapper
 */
async function fetchClient(endpoint, options = {}) {
    const token = getAccessToken();
    const retry = options.retry !== false; // default true

    // endpoint should start with /llm-models or /admin/llm-models
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers,
        },
    });

    // 🔴 Handle unauthorized
    if (res.status === 401 && retry) {
        try {
            const newToken = await refreshAccessToken();
            setAccessToken(newToken);

            // Retry fetch ONCE with new token
            return fetchClient(endpoint, {
                ...options,
                headers: {
                    ...options.headers,
                    Authorization: `Bearer ${newToken}`,
                },
                retry: false, // prevent infinite loop
            });
        } catch (refreshError) {
            setAccessToken(null);
            throw refreshError;
        }
    }

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

    // DELETE may return no body
    if (res.status === 204) return null;

    return res.json();
}

/**
 * POST /api/llm-models
 * Create LLM model
 */
export function createLLMModel(payload) {
    return fetchClient("/llm-models", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * GET /api/llm-models/active
 * Fetch ONLY active LLM models (for composer)
 */
export function fetchActiveLLMModels(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchClient(`/llm-models/active${query ? `?${query}` : ""}`);
}

/**
 * GET /api/admin/llm-models
 * Fetch ALL LLM models (for admin panel)
 */
export function fetchAdminLLMModels(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchClient(`/admin/llm-models${query ? `?${query}` : ""}`);
}

/**
 * GET /api/llm-models/:id
 * Fetch single LLM model
 */
export function fetchLLMModelById(id) {
    if (!id) throw new Error("Model ID is required");
    return fetchClient(`/llm-models/${id}`);
}

/**
 * PATCH /api/llm-models/:id
 * Update LLM model
 */
export function updateLLMModel(id, payload) {
    if (!id) throw new Error("Model ID is required");

    return fetchClient(`/llm-models/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
    });
}

/**
 * DELETE /api/llm-models/:id
 * Soft delete (deprecate)
 */
export function deleteLLMModel(id) {
    if (!id) throw new Error("Model ID is required");

    return fetchClient(`/llm-models/${id}`, {
        method: "DELETE",
    });
}
// Keep for backward compatibility if needed by other components
export function fetchLLMModels(params = {}) {
    return fetchActiveLLMModels(params);
}
