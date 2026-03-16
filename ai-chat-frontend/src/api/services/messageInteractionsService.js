/**
 * src/api/services/messageInteractionsService.js
 * 
 * Centralized service for message interactions using Fetch API.
 * Follows the shared fetchClient pattern with automatic token refresh.
 * Replaces the legacy axios-based messageService.js.
 */

import { refreshAccessToken, getAccessToken, setAccessToken } from '../axios';
import { retryWithBackoff, generateUuid } from '../utils/retryWithBackoff';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not defined");
}
// console.log('[DEBUG] messageInteractionsService: API_BASE_URL =', API_BASE_URL);

/**
 * Shared fetch wrapper with automatic token refresh and error normalization.
 * 
 * @param {string} url - API endpoint relative to base URL
 * @param {Object} options - Fetch options 
 * @param {boolean} [options.retry=true] - Whether to retry once on 401
 * @returns {Promise<any>} Parsed JSON response or null for 204
 */
async function fetchClient(url, options = {}) {
    const token = getAccessToken();
    const retry = options.retry !== false;

    // Build headers
    const headers = {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
    };

    const fullUrl = `${API_BASE_URL}${url}`;
    // console.log('[DEBUG] messageInteractionsService: Fetching', fullUrl);

    const res = await fetch(fullUrl, {
        ...options,
        credentials: "include", // Ensure cookies/CORS consistency
        headers,
    });

    // 🔐 HANDLE 401 - REFRESH AND RETRY ONCE
    // retry: false is critical to prevent infinite loops if refresh fails or new token is also 401
    if (res.status === 401 && retry) {
        try {
            const newToken = await refreshAccessToken();
            setAccessToken(newToken);
            return fetchClient(url, {
                ...options,
                headers: {
                    ...options.headers,
                    Authorization: `Bearer ${newToken}`,
                },
                retry: false, // CRITICAL: Only retry once
            });
        } catch (refreshError) {
            setAccessToken(null);
            throw refreshError;
        }
    }

    // NORMALIZE ERRORS
    if (!res.ok) {
        let errorMessage = "Request failed";
        try {
            const err = await res.json();
            // Try multiple error message sources
            errorMessage = err.message || err.error || errorMessage;
        } catch (_) { }

        const error = new Error(errorMessage);
        error.status = res.status; // CRITICAL: Redux thunks depend on status
        throw error;
    }

    // HANDLE 204 NO CONTENT (no body to parse)
    if (res.status === 204) return null;

    return res.json();
}

/**
 * Submit or update feedback on a message.
 * 
 * @param {string} messageId - UUID of the message
 * @param {Object} options - Feedback details
 * @param {string} options.feedbackType - "positive", "negative", or "neutral"
 * @param {string} options.conversationId - UUID of the conversation
 * @param {string} [options.reason] - Optional text reason
 * @param {Array<string>} [options.tags] - Optional category tags
 * @returns {Promise<Object>} The saved feedback object
 */
export async function submitFeedback(messageId, { feedbackType, conversationId, reason, tags }) {
    if (!messageId) throw new Error("messageId is required");
    if (!feedbackType) throw new Error("feedbackType is required");
    if (!conversationId) throw new Error("conversationId is required");

    const validTypes = ["positive", "negative", "neutral"];
    if (!validTypes.includes(feedbackType)) {
        throw new Error(`Invalid feedbackType. Must be one of: ${validTypes.join(", ")}`);
    }

    return fetchClient(`/messages/${messageId}/feedback`, {
        method: "POST",
        body: JSON.stringify({
            feedbackType,
            conversationId,
            reason,
            tags
        }),
    });
}

/**
 * Get feedback stats and user's specific feedback for a message.
 * Supports optional authentication (anonymous users get aggregate stats).
 * 
 * @param {string} messageId - UUID of the message
 * @returns {Promise<Object>} { messageId, userFeedback, stats: { positive, negative } }
 */
export async function getFeedback(messageId) {
    if (!messageId) throw new Error("messageId is required");

    // fetchClient handles optional token via localStorage check automatically
    return fetchClient(`/messages/${messageId}/feedback`, {
        method: "GET"
    });
}

/**
 * Regenerate an assistant response (Retry Flow) with STREAMING support.
 * 
 * @param {Object} params
 * @param {string} params.conversationId - UUID of the conversation
 * @param {string} params.messageId - UUID of the message to regenerate
 * @param {Object} [params.options] - Optional model parameters
 * @param {string} [params.requestKey] - Request idempotency key (auto-generated if not provided)
 * @returns {Object} { start, cancel }
 */
export function retryMessageStream({ conversationId, messageId, options = {}, requestKey = generateUuid(), signal: externalSignal = null }) {
    if (!conversationId) throw new Error("conversationId is required");
    if (!messageId) throw new Error("messageId is required");

    const controller = externalSignal ? null : new AbortController();
    const signal = externalSignal ?? controller.signal;

    async function start(onChunk, onComplete, retry = true) {
        const url = `${API_BASE_URL}/conversations/${conversationId}/messages/${messageId}/retry`;
        const token = getAccessToken();

        const headers = {
            "Content-Type": "application/json",
            "X-Request-Idempotency-Key": requestKey, // ✅ NEW: Idempotency key
            ...(token && { Authorization: `Bearer ${token}` }),
        };

        const body = {
            ...(options.temperature && { temperature: options.temperature }),
            ...(options.maxTokens && { maxTokens: options.maxTokens }),
            ...(options.overrideModelId && { overrideModelId: options.overrideModelId }),
        };

        // One-shot fetch attempt. The Redux thunk handles retries and UI progress.
        let res;
        try {
            res = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal,
                credentials: "include",
            });
        } catch (error) {
            if (error.name === "AbortError") throw new Error("Request was cancelled");
            throw new Error(`Network error: ${error.message}`);
        }

        // Handle 401 BEFORE streaming
        if (res.status === 401 && retry) {
            try {
                const newToken = await refreshAccessToken();
                setAccessToken(newToken);
                return start(onChunk, onComplete, false);
            } catch (refreshError) {
                setAccessToken(null);
                throw new Error("Session expired. Please log in again.");
            }
        }

        if (!res.ok) {
            const txt = await res.text();
            let errorMessage = `Retry stream failed: ${res.status} ${txt}`;
            let errorCode = null;

            try {
                const parsed = JSON.parse(txt);
                errorMessage = parsed.error || parsed.message || errorMessage;
                errorCode = parsed.code || null;
            } catch (_) { }

            const error = new Error(errorMessage);
            error.status = res.status;
            error.code = errorCode;
            throw error;
        }

        if (!res.body) {
            throw new Error("Response body is not available");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulatedText = "";

        // ✅ STREAMING LOOP - Errors here NOT retriable
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    accumulatedText += chunk;

                    // Filter out our [DONE] marker from the visible stream if it's there
                    const visibleChunk = chunk.split("[DONE]")[0];
                    if (visibleChunk && onChunk) {
                        onChunk(visibleChunk);
                    }
                }
            }

            // Extract the final JSON metadata if present
            let finalMetadata = null;
            const doneMarker = "[DONE]";
            const doneIndex = accumulatedText.lastIndexOf(doneMarker);
            if (doneIndex !== -1) {
                try {
                    const jsonStr = accumulatedText.substring(doneIndex + doneMarker.length);
                    finalMetadata = JSON.parse(jsonStr);
                } catch (e) {
                    console.warn("[DEBUG] Failed to parse final metadata from stream", e);
                }
            }

            if (onComplete) onComplete(accumulatedText, finalMetadata);
            return { fullText: accumulatedText, metadata: finalMetadata };
        } catch (streamErr) {
            // Stream interrupted mid-transfer (NOT retriable)
            throw new Error(`Stream interrupted: ${streamErr.message}`);
        } finally {
            reader.releaseLock();
        }
    }

    return {
        start,
        cancel: () => controller ? controller.abort() : null
    };
}

/**
 * Regenerate an assistant response (Legacy Non-streaming fallback).


/**
 * Switch the active version of a message.
 * 
 * @param {string} messageId - UUID of the message
 * @param {Object} params - Version targeting parameters
 * @param {string} [params.versionId] - Specific version UUID
 * @param {number} [params.versionNumber] - Sequential version number (1-based)
 * @returns {Promise<Object>} Updated message object with new version content
 */
export async function switchVersion(messageId, { versionId, versionNumber }) {
    if (!messageId) throw new Error("messageId is required");
    if (!versionId && !versionNumber) {
        throw new Error("Either versionId or versionNumber is required");
    }

    const body = versionId ? { versionId } : { versionNumber };

    return fetchClient(`/messages/${messageId}/version`, {
        method: "PATCH",
        body: JSON.stringify(body),
    });
}

/**
 * Delete a specific message version.
 * 
 * @param {string} messageId - UUID of the message
 * @param {string} versionId - UUID of the version to delete
 * @returns {Promise<null>} Resolves on 204 success
 */
export async function deleteVersion(messageId, versionId) {
    if (!messageId) throw new Error("messageId is required");
    if (!versionId) throw new Error("versionId is required");

    return fetchClient(`/messages/${messageId}/versions/${versionId}`, {
        method: "DELETE",
    });
}

/**
 * Track when a message is copied to clipboard.
 * 
 * @param {string} messageId - UUID of the message
 * @returns {Promise<Object>} Success status
 */
export async function trackCopy(messageId) {
    if (!messageId) throw new Error("messageId is required");

    return fetchClient(`/messages/${messageId}/copy`, {
        method: "POST"
    });
}
