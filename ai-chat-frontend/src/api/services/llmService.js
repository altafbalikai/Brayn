import api from '../axios';

export const llmService = {
    ask: async (message, conversationId) => {
        const response = await api.post('/llm/ask', { message, conversationId });
        return response.data;
    },


    askStream: ({ message, conversationId }) => {
        const controller = new AbortController();
        const signal = controller.signal;

        async function start(onChunk, onComplete) {
            const url = `${import.meta.env.VITE_API_BASE_URL}/llm/ask`;
            const token = localStorage.getItem('accessToken');

            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            let res;
            try {
                res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ message, conversationId }),
                    signal,
                });
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw new Error('Request was cancelled');
                }
                throw new Error(`Network error: ${error.message}`);
            }

            // Handle non-OK responses
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Stream failed: ${res.status} ${txt}`);
            }

            if (!res.body) {
                throw new Error('Response body is not available');
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullText = '';

            try {
                while (true) {
                    const { value, done } = await reader.read();

                    if (done) break;

                    if (value) {
                        // Decode chunk and send IMMEDIATELY for real-time display
                        const chunk = decoder.decode(value, { stream: true });

                        if (chunk) {
                            fullText += chunk;

                            try {
                                // Call onChunk with raw decoded text
                                onChunk(chunk);
                            } catch (err) {
                                console.error('onChunk handler error', err);
                                // Continue streaming even if handler fails
                            }
                        }
                    }
                }

                // Call onComplete callback if provided
                if (onComplete) {
                    onComplete(fullText);
                }

                return fullText;
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw new Error('Streaming was cancelled');
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
    }
};