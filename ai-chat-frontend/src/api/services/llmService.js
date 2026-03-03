import api from '../axios';
import { refreshAccessToken } from '../axios'; // axios instance

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
    askStream: ({ message, conversationId }) => {
        if (!conversationId) {
            throw new Error("conversationId is required");
        }

        const controller = new AbortController();
        const signal = controller.signal;

        async function start(onMetadata, onChunk, onComplete, retry = true) {
            const url = `${API_BASE_URL}/llm/conversations/${conversationId}/ask`;
            const token = localStorage.getItem("accessToken");

            const headers = {
                "Content-Type": "application/json",
            };

            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            let res;
            try {
                res = await fetch(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ message }), // ✅ ONLY message
                    signal,
                });

            } catch (error) {
                if (error.name === "AbortError") {
                    throw new Error("Request was cancelled");
                }
                throw new Error(`Network error: ${error.message}`);
            }

            // 🔐 HANDLE EXPIRED TOKEN (BEFORE STREAMING)
            if (res.status === 401 && retry) {
                try {
                    const newToken = await refreshAccessToken();

                    return start(
                        onMetadata,
                        onChunk,
                        onComplete,
                        false // ❗ retry only once
                    );
                } catch (refreshError) {
                    throw new Error("Session expired. Please log in again.");
                }
            }

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Stream failed: ${res.status} ${txt}`);
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
                            if (evt.includes('event: metadata')) {
                                try {
                                    const dataParts = evt.split('data: ');
                                    if (dataParts.length > 1) {
                                        const data = JSON.parse(dataParts[1]);
                                        realMessageId = data.messageId;

                                        if (onMetadata) {
                                            try { onMetadata(realMessageId); } catch (err) { console.error("onMetadata error", err); }
                                        }

                                        // Flush any early chunks
                                        pendingChunks.forEach(chunk => {
                                            fullText += chunk;
                                            if (onChunk) {
                                                try { onChunk(chunk); } catch (err) { console.error("onChunk error", err); }
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
                                                try { onChunk(content); } catch (err) { console.error("onChunk error", err); }
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
                throw error;
            } finally {
                reader.releaseLock();
            }
        }

        return {
            start,
            cancel: () => controller.abort(),
        };
    },
};
