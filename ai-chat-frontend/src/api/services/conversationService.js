/**
 * src/api/services/conversationService.js
 *
 * Centralized service for conversation operations using Fetch API.
 * Follows the shared fetchClient pattern with automatic token refresh.
 */

import { refreshAccessToken } from '../axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not defined");
}

/**
 * Shared fetch wrapper with automatic token refresh and error normalization.
 *
 * @param {string} url - API endpoint relative to base URL
 * @param {Object} options - Fetch options
 * @param {boolean} [options.retry=true] - Whether to retry once on 401
 * @returns {Promise<any>} Parsed JSON response or null for 204
 */
async function fetchClient(url, options = {}) {
    const token = localStorage.getItem("accessToken");
    const retry = options.retry !== false;

    const headers = {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
    };

    const fullUrl = `${API_BASE_URL}${url}`;

    const res = await fetch(fullUrl, {
        ...options,
        credentials: "include",
        headers,
    });

    // Handle 401 — refresh and retry once
    if (res.status === 401 && retry) {
        try {
            const newToken = await refreshAccessToken();
            return fetchClient(url, {
                ...options,
                headers: {
                    ...options.headers,
                    Authorization: `Bearer ${newToken}`,
                },
                retry: false,
            });
        } catch (refreshError) {
            localStorage.removeItem("accessToken");
            throw refreshError;
        }
    }

    // Normalize errors
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

    // Handle 204 No Content
    if (res.status === 204) return null;

    return res.json();
}

/**
 * POST /api/conversations
 * Create a new conversation.
 */
export async function createConversation({ agentId, title, modelId, personaId }) {
    return fetchClient("/conversations", {
        method: "POST",
        body: JSON.stringify({
            agentId,
            title,
            modelId,
            currentPersonaId: personaId,
        }),
    });
}

/**
 * GET /api/conversations/my
 * List conversations for the current user.
 */
export async function listConversations(agent, page = 1, limit = 50) {
    const params = new URLSearchParams({ page, limit });
    if (agent) params.set("agent", agent);
    return fetchClient(`/conversations/my?${params.toString()}`);
}

/**
 * GET /api/conversations/:cid/messages
 * Get messages for a conversation.
 */
export async function getMessages(conversationId, page = 1, limit = 50) {
    const params = new URLSearchParams({ page, limit });
    return fetchClient(`/conversations/${conversationId}/messages?${params.toString()}`);
}

/**
 * POST /api/conversations/:cid/messages
 * Add a message to a conversation.
 */
export async function addMessage(conversationId, role, text) {
    return fetchClient(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ role, text }),
    });
}

/**
 * PATCH /api/conversations/:cid/rename
 * Rename a conversation.
 */
export async function renameConversationTitle(conversationId, title) {
    return fetchClient(`/conversations/${conversationId}/rename`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
    });
}

/**
 * DELETE /api/conversations/:cid
 * Delete a conversation.
 */
export async function deleteConversation(conversationId) {
    return fetchClient(`/conversations/${conversationId}`, {
        method: "DELETE",
    });
}

/**
 * PATCH /api/conversations/:cid/model
 * Update the selected LLM model for a conversation.
 */
export async function updateConversationModel(conversationId, modelId) {
    return fetchClient(`/conversations/${conversationId}/model`, {
        method: "PATCH",
        body: JSON.stringify({ modelId }),
    });
}

// Backward-compatible named export for existing imports
export const conversationService = {
    createConversation,
    listConversations,
    getMessages,
    addMessage,
    renameConversationTitle,
    deleteConversation,
    updateConversationModel,
};
