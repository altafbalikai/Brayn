import api from '../axios';

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

    renameConversationTitle: async (conversationId, title) => {
        const response = await api.patch(`/conversations/${conversationId}/rename`, {
            title,
        });
        return response.data;
    },

    deleteConversation: async (conversationId) => {
        const response = await api.delete(`/conversations/${conversationId}`);
        return response.data;
    }
};
