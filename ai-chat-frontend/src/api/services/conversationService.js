import api from '../api/axios';

export const conversationService = {
    createConversation: async (agentId, title) => {
        const response = await api.post('/conversations', { agentId, title });
        return response.data;
    },

    listConversations: async (agent, page = 1, limit = 50) => {
        const params = { page, limit };
        if (agent) params.agent = agent;
        const response = await api.get('/conversations/my', { params });
        return response.data;
    },

    getMessages: async (conversationId, page = 1, limit = 50) => {
        const response = await api.get(`/conversations/${conversationId}/messages`, {
            params: { page, limit },
        });
        return response.data;
    },

    addMessage: async (conversationId, role, text) => {
        const response = await api.post(`/conversations/${conversationId}/messages`, {
            role,
            text,
        });
        return response.data;
    },

    updateConversationTitle: async (conversationId, title) => {
        const response = await api.patch(`/conversations/${conversationId}`, {
            title,
        });
        return response.data;
    },
};
