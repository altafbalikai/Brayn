// import api from '../axios';

// export const authService = {
//     signup: async (email, password, name) => {
//         const response = await api.post('/auth/signup', { email, password, name });
//         return response.data;
//     },

//     login: async (email, password) => {
//         try {
//             const response = await api.post('/auth/login', { email, password });
//             const { user, accessToken } = response.data;
//             if (!accessToken) {
//                 throw new Error('No access token received');
//             }
//             localStorage.setItem('accessToken', accessToken);
//             return { user, accessToken };
//         } catch (error) {
//             console.error('Auth service login error:', error);
//             throw error;
//         }
//     },

//     logout: async () => {
//         try {
//             await api.post('/auth/logout', {});
//         } finally {
//             localStorage.removeItem('accessToken');
//         }
//     },

//     refresh: async () => {
//         const response = await api.post('/auth/refresh', {});
//         const { user, accessToken } = response.data;
//         localStorage.setItem('accessToken', accessToken);
//         return { user, accessToken };
//     },

//     changePassword: async (oldPassword, newPassword) => {
//         const response = await api.post('/auth/change-password', { oldPassword, newPassword });
//         return response.data;
//     },

//     getProfile: async () => {
//         const response = await api.get('/auth/me');
//         return response.data;
//     },
// };

import api from '../axios';

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

        // Token persistence (OK here, or move to thunk)
        localStorage.setItem('accessToken', accessToken);

        return { user, accessToken };
    },

    logout: async () => {
        try {
            await api.post('/auth/logout', {});
        } finally {
            localStorage.removeItem('accessToken');
        }
    },

    // 🔑 Refresh token = ONLY token
    refresh: async () => {
        const response = await api.post('/auth/refresh', {});
        const { accessToken } = response.data;

        if (!accessToken) {
            throw new Error('No access token received on refresh');
        }

        localStorage.setItem('accessToken', accessToken);
        return accessToken;
    },

    // 🔑 Identity always comes from /me
    getProfile: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    },

    changePassword: async (oldPassword, newPassword) => {
        const response = await api.post('/auth/change-password', {
            oldPassword,
            newPassword,
        });
        return response.data;
    },
};
