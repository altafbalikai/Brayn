import api from '../axios';
import { refreshAccessToken } from '../axios'; // axios instance
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
     * STREAMING ASK
     */
    askStream: ({
        message,
        conversationId,
        overrideModelId = null,
        signal: externalSignal = null,
        requestKey = generateUuid()
    }) => {
        if (!conversationId) {
            throw new Error("conversationId is required");
        }

        const controller = externalSignal ? null : new AbortController();
        const signal = externalSignal ?? controller.signal;
        const token = localStorage.getItem("accessToken");

        async function start(onMetadata, onChunk, onComplete, retry = true) {
            const url = `${API_BASE_URL}/llm/conversations/${conversationId}/ask`;

            const headers = {
                "Content-Type": "application/json",
                "X-Request-Idempotency-Key": requestKey, // ✅ NEW: Idempotency key
            };

            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            // ✅ NEW: Wrap fetch in retry logic (not streaming loop)
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
                                ...(requestKey && { requestKey })
                            }),
                            signal,
                        });
                    },
                    {
                        maxAttempts: 5,
                        isRetriable: (error) => {
                            // Network error
                            if (!error.status) return true;
                            // 409 duplicate in-flight
                            if (error.status === 409) return true;
                            // Server errors
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

            // ✅ Fetch succeeded → response received
            // ❌ DO NOT RETRY AFTER THIS POINT

            // Handle 401 BEFORE streaming
            if (res.status === 401 && retry) {
                try {
                    const newToken = await refreshAccessToken();
                    return start(
                        onMetadata,
                        onChunk,
                        onComplete,
                        false // Only retry refresh once
                    );
                } catch (refreshError) {
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

            // ✅ STREAMING LOOP - Errors here NOT retriable
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    if (value) {
                        buffer += decoder.decode(value, { stream: true });
                        const events = buffer.split('\n\n');
                        buffer = events.pop();

                        for (const evt of events) {
                            if (evt.includes('event: metadata')) {
                                try {
                                    const dataParts = evt.split('data: ');
                                    if (dataParts.length > 1) {
                                        const data = JSON.parse(dataParts[1]);
                                        realMessageId = data.messageId;

                                        if (onMetadata) {
                                            try {
                                                onMetadata(realMessageId);
                                            } catch (err) {
                                                console.error("onMetadata error", err);
                                            }
                                        }

                                        // Flush early chunks
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

                            if (evt.includes('event: chunk')) {
                                try {
                                    const dataParts = evt.split('data: ');
                                    if (dataParts.length > 1) {
                                        const content = JSON.parse(dataParts[1]);

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
                        }
                    }
                }

                if (onComplete) {
                    onComplete(fullText);
                }
                return fullText;
            } catch (error) {
                if (error.name === "AbortError") {
                    throw new Error("Streaming was cancelled");
                }
                // Stream error → don't retry
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
