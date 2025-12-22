import api from '../api/axios';

export const llmService = {
    ask: async (message, conversationId) => {
        const response = await api.post('/llm/ask', { message, conversationId });
        return response.data;
    },
    askStream: ({ message, conversationId }) => {
        const controller = new AbortController();
        const signal = controller.signal;

        async function start(onChunk) {
            const url = '/api/llm/ask';
            const token = localStorage.getItem('accessToken');
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ message, conversationId }),
                signal,
            });

            if (!res.ok || !res.body) {
                const txt = await res.text();
                throw new Error(`Stream failed: ${res.status} ${txt}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let full = '';

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    const chunk = decoder.decode(value, { stream: !done });
                    full += chunk;
                    try {
                        onChunk(chunk);
                    } catch (err) {
                        console.error('onChunk handler error', err);
                    }
                }
            }

            return full;
        }

        return {
            start,
            cancel: () => controller.abort(),
        };
    }
};
