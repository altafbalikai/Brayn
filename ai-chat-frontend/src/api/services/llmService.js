import api from '../axios';
import { refreshAccessToken, getAccessToken, setAccessToken } from '../axios'; // axios instance
import { retryWithBackoff, generateUuid } from '../utils/retryWithBackoff';

// export const llmService = {
//     ask: async (message, conversationId) => {
//         const response = await api.post('/llm/ask', { message, conversationId });
//         return response.data;
//     },


//     askStream: ({ message, conversationId }) => {
//         const controller = new AbortController();
//         const signal = controller.signal;

//         async function start(onChunk, onComplete) {
//             const url = `${import.meta.env.VITE_API_BASE_URL}/llm/ask`;
//             const token = localStorage.getItem('accessToken');

//             const headers = { 'Content-Type': 'application/json' };
//             if (token) {
//                 headers.Authorization = `Bearer ${token}`;
//             }

//             let res;
//             try {
//                 res = await fetch(url, {
//                     method: 'POST',
//                     headers,
//                     body: JSON.stringify({ message, conversationId }),
//                     signal,
//                 });
//             } catch (error) {
//                 if (error.name === 'AbortError') {
//                     throw new Error('Request was cancelled');
//                 }
//                 throw new Error(`Network error: ${error.message}`);
//             }

//             // Handle non-OK responses
//             if (!res.ok) {
//                 const txt = await res.text();
//                 throw new Error(`Stream failed: ${res.status} ${txt}`);
//             }

//             if (!res.body) {
//                 throw new Error('Response body is not available');
//             }

//             const reader = res.body.getReader();
//             const decoder = new TextDecoder("utf-8");
//             let fullText = '';

//             try {
//                 while (true) {
//                     const { value, done } = await reader.read();

//                     if (done) break;

//                     if (value) {
//                         // Decode chunk and send IMMEDIATELY for real-time display
//                         const chunk = decoder.decode(value, { stream: true });

//                         if (chunk) {
//                             fullText += chunk;

//                             try {
//                                 // Call onChunk with raw decoded text
//                                 onChunk(chunk);
//                             } catch (err) {
//                                 console.error('onChunk handler error', err);
//                                 // Continue streaming even if handler fails
//                             }
//                         }
//                     }
//                 }

//                 // Call onComplete callback if provided
//                 if (onComplete) {
//                     onComplete(fullText);
//                 }

//                 return fullText;
//             } catch (error) {
//                 if (error.name === 'AbortError') {
//                     throw new Error('Streaming was cancelled');
//                 }
//                 throw error;
//             } finally {
//                 reader.releaseLock();
//             }
//         }

//         return {
//             start,
//             cancel: () => controller.abort(),
//         };
//     }
// };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * LLM Streaming Service (conversation-scoped)
 */
export const llmService = {
    /**
     * POST /api/llm/conversations/:cid/branch
     * Branch a conversation by editing a prior user message.
     */
    branchConversation: async ({ conversationId, editedMessageId, newContent }) => {
        if (!conversationId) throw new Error("conversationId is required");
        if (!editedMessageId) throw new Error("editedMessageId is required");

        const url = `${API_BASE_URL}/llm/conversations/${conversationId}/branch`;
        const token = getAccessToken();

        const headers = {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
        };

        const body = JSON.stringify({ editedMessageId, newContent });

        const res = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers,
            body,
        });

        if (res.status === 401) {
            try {
                const newToken = await refreshAccessToken();
                setAccessToken(newToken);
                const retryRes = await fetch(url, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        ...headers,
                        Authorization: `Bearer ${newToken}`,
                    },
                    body,
                });
                if (!retryRes.ok) {
                    const txt = await retryRes.text();
                    throw new Error(txt || `Branch failed: ${retryRes.status}`);
                }
                return retryRes.json();
            } catch (e) {
                setAccessToken(null);
                throw e;
            }
        }

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || `Branch failed: ${res.status}`);
        }

        return res.json();
    },

    /**
     * STREAMING ASK
     */
    askStream: ({
        message,
        conversationId,
        overrideModelId = null,
        editNodeId = null,
        regenerateNodeId = null,
        signal: externalSignal = null,
        requestKey = generateUuid(),
        useWebSearch = false,
    }, options = {}) => {
        if (!conversationId) {
            throw new Error("conversationId is required");
        }

        const signal = options?.signal ?? externalSignal;
        const controller = signal ? null : new AbortController();
        const activeSignal = signal ?? controller.signal;
        const token = getAccessToken();

        async function start(onMetadata, onChunk, onReasoning, onReasoningDone, onComplete, retry = true) {
            const url = `${API_BASE_URL}/llm/conversations/${conversationId}/ask`;

            const headers = {
                "Content-Type": "application/json",
                "X-Request-Idempotency-Key": requestKey,
            };

            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            let res;
            try {
                res = await retryWithBackoff(
                    async () => {
                        return fetch(url, {
                            method: "POST",
                            headers,
                            body: JSON.stringify({
                                message,
                                ...(overrideModelId && { overrideModelId }),
                                ...(editNodeId && { editNodeId }),
                                ...(regenerateNodeId && { regenerateNodeId }),
                                ...(requestKey && { requestKey }),
                                useWebSearch,
                            }),
                            signal: activeSignal,
                        });
                    },
                    {
                        maxAttempts: 5,
                        isRetriable: (error) => {
                            if (!error.status) return true;
                            if (error.status === 409) return true;
                            return [500, 502, 503, 504].includes(error.status);
                        }
                    }
                );
            } catch (error) {
                if (error.name === "AbortError") {
                    throw new Error("Request was cancelled");
                }
                throw new Error(`Network error: ${error.message}`);
            }

            if (res.status === 401 && retry) {
                try {
                    const newToken = await refreshAccessToken();
                    setAccessToken(newToken);
                    return start(
                        onMetadata,
                        onChunk,
                        onReasoning,
                        onReasoningDone,
                        onComplete,
                        false
                    );
                } catch (refreshError) {
                    setAccessToken(null);
                    throw new Error("Session expired. Please log in again.");
                }
            }

            if (!res.ok) {
                let body = {};
                try {
                    const txt = await res.text();
                    body = JSON.parse(txt);
                } catch {
                    body = { error: `Stream failed: ${res.status}` };
                }

                const err = new Error(body.error || `Stream failed: ${res.status}`);
                err.status = res.status;
                err.code = body.code || null;
                err.retriable = body.retriable ?? false;
                throw err;
            }

            if (!res.body) {
                throw new Error("Response body is not available");
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let fullText = "";
            let buffer = "";
            let realMessageId = null;
            let pendingChunks = [];

            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    if (value) {
                        buffer += decoder.decode(value, { stream: true });
                        const events = buffer.split('\n\n');
                        buffer = events.pop();

                        for (const evt of events) {
                            const eventTypeMatch = evt.match(/event:\s*(\w+)/);
                            const eventType = eventTypeMatch ? eventTypeMatch[1] : null;
                            const dataParts = evt.split('data: ');
                            const dataBuffer = dataParts.length > 1 ? dataParts[1] : null;

                            if (eventType === 'metadata') {
                                try {
                                    if (dataBuffer) {
                                        const data = JSON.parse(dataBuffer);
                                        realMessageId = data.messageId;

                                        if (onMetadata) {
                                            try {
                                                onMetadata(data);
                                            } catch (err) {
                                                console.error("onMetadata error", err);
                                            }
                                        }

                                        pendingChunks.forEach(chunk => {
                                            fullText += chunk;
                                            if (onChunk) {
                                                try {
                                                    onChunk(chunk);
                                                } catch (err) {
                                                    console.error("onChunk error", err);
                                                }
                                            }
                                        });
                                        pendingChunks = [];
                                    }
                                } catch (e) {
                                    console.error("Error parsing metadata:", e);
                                }
                            }

                            if (eventType === 'chunk') {
                                try {
                                    if (dataBuffer) {
                                        const content = JSON.parse(dataBuffer);

                                        if (!realMessageId) {
                                            pendingChunks.push(content);
                                        } else {
                                            fullText += content;
                                            if (onChunk) {
                                                try {
                                                    onChunk(content);
                                                } catch (err) {
                                                    console.error("onChunk error", err);
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error("Error parsing chunk JSON:", e);
                                }
                            }

                            if (eventType === 'reasoning') {
                                try {
                                    if (dataBuffer) {
                                        const parsed = JSON.parse(dataBuffer);
                                        onReasoning?.(parsed.delta);
                                    }
                                } catch (e) {
                                    console.error("Error parsing reasoning JSON:", e);
                                }
                            }

                            if (eventType === 'reasoning_done') {
                                onReasoningDone?.();
                            }
                        }
                    }
                }

                const cleanText = fullText
                    .replace(/\u3010[^\u3011]*\u3011/g, '')  // strips 【...】
                    .replace(/\[\d+\u2020[^\]]*\]/g, '')      // strips [N†...]
                    .trim();

                if (onComplete) {
                    onComplete(cleanText);
                }
                return cleanText;
            } catch (error) {
                if (error.name === "AbortError") {
                    throw new Error("Streaming was cancelled");
                }
                throw error;
            } finally {
                reader.releaseLock();
            }
        }

        return {
            start,
            cancel: () => controller ? controller.abort() : null
        };
    },
};
