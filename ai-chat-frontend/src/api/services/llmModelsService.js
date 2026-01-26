// src/services/llmModelsService.js

// Use relative URL when using Vite proxy, or absolute URL if VITE_API_URL is set
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not defined");
}

/**
 * Shared fetch wrapper
 */
async function fetchClient(url, options = {}) {
    const token = localStorage.getItem("accessToken");
    retry = true;
    const res = await fetch(`${API_BASE_URL}/llm-models${url}`, {
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
            // Delegate refresh to axios
            const newToken = await refreshAccessToken();

            // Retry fetch ONCE with new token
            return fetchClient(
                url,
                {
                    ...options,
                    headers: {
                        ...options.headers,
                        Authorization: `Bearer ${newToken}`,
                    },
                },
                false // prevent infinite loop
            );
        } catch (refreshError) {
            localStorage.removeItem("accessToken");
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
 * POST /
 * Create LLM model
 */
export function createLLMModel(payload) {
    return fetchClient("/", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * GET /
 * Fetch LLM models (for UI)
 */
export function fetchLLMModels(params = {}) {
    const query = new URLSearchParams(params).toString();
    return fetchClient(query ? `?${query}` : "");
}

/**
 * GET /:id
 * Fetch single LLM model
 */
export function fetchLLMModelById(id) {
    if (!id) throw new Error("Model ID is required");
    return fetchClient(`/${id}`);
}

/**
 * PATCH /:id
 * Update LLM model
 */
export function updateLLMModel(id, payload) {
    if (!id) throw new Error("Model ID is required");

    return fetchClient(`/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
    });
}

/**
 * DELETE /:id
 * Soft delete (deprecate)
 */
export function deleteLLMModel(id) {
    if (!id) throw new Error("Model ID is required");

    return fetchClient(`/${id}`, {
        method: "DELETE",
    });
}
