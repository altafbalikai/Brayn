import api from '../axios';
import { setAccessToken, getAccessToken } from '../axios';

export const authService = {
    signup: async (email, password, name) => {
        const response = await api.post('/auth/signup', { email, password, name });
        return response.data;
    },

    login: async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        const { user, accessToken } = response.data;

        if (!accessToken) {
            throw new Error('No access token received');
        }

        setAccessToken(accessToken);

        return { user, accessToken };
    },

    logout: async () => {
        try {
            await api.post('/auth/logout', {});
        } finally {
            setAccessToken(null);
        }
    },

    forgotPassword: async (email) => {
        await api.post("/auth/forgot-password", { email });
    },

    resetPassword: async ({ token, newPassword }) => {
        await api.post("/auth/reset-password", {
            token,
            newPassword,
        });
    },

    // 🔑 Refresh token = ONLY token
    refresh: async () => {
        const response = await api.post('/auth/refresh', {});
        const { accessToken } = response.data;

        if (!accessToken) {
            throw new Error('No access token received on refresh');
        }

        setAccessToken(accessToken);
        return accessToken;
    },

    // 🔑 Identity always comes from /me
    getProfile: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    },

    changePassword: async (currentPassword, newPassword) => {
        const token = getAccessToken();

        if (!token) {
            throw new Error("Not authenticated");
        }

        try {
            const response = await api.post(
                "/auth/change-password",
                { currentPassword, newPassword },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            return response.data;
        } catch (err) {
            throw err;
        }
    },
};
