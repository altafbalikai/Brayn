import axios from 'axios';

// Use relative URL when using Vite proxy, or absolute URL if VITE_API_URL is set
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not defined');
}

let _accessToken = null;

function getTokenExpiry(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
}

const REFRESH_BUFFER_SECONDS = 60;
let _refreshTimer = null;

function scheduleTokenRefresh(token) {
    if (_refreshTimer) {
        clearTimeout(_refreshTimer);
        _refreshTimer = null;
    }

    const exp = getTokenExpiry(token);
    if (!exp) return;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const msUntilRefresh = (exp - nowSeconds - REFRESH_BUFFER_SECONDS) * 1000;

    if (msUntilRefresh <= 0) {
        _refreshTimer = setTimeout(() => _doProactiveRefresh(), 0);
        return;
    }

    _refreshTimer = setTimeout(() => _doProactiveRefresh(), msUntilRefresh);
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;

        const token = getAccessToken();
        if (!token) return;

        const exp = getTokenExpiry(token);
        if (!exp) return;

        const nowSeconds = Math.floor(Date.now() / 1000);
        const secondsRemaining = exp - nowSeconds;

        if (secondsRemaining <= REFRESH_BUFFER_SECONDS) {
            if (_refreshTimer) {
                clearTimeout(_refreshTimer);
                _refreshTimer = null;
            }
            _doProactiveRefresh();
        } else {
            scheduleTokenRefresh(token);
        }
    });
}

async function _doProactiveRefresh() {
    _refreshTimer = null;
    try {
        const newToken = await refreshAccessToken();
        setAccessToken(newToken);
        scheduleTokenRefresh(newToken);
    } catch {
        // Silent failure — reactive 401 path handles the fallback.
    }
}

export function clearTokenRefreshTimer() {
    if (_refreshTimer) {
        clearTimeout(_refreshTimer);
        _refreshTimer = null;
    }
}

export function setAccessToken(token) {
    _accessToken = token || null;
    scheduleTokenRefresh(token);
}

export function getAccessToken() {
    return _accessToken;
}

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add access token to requests
api.interceptors.request.use(
    (config) => {
        const token = getAccessToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Handle token refresh on 401
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url.includes('/auth/login') &&
            !originalRequest.url.includes('/auth/signup') &&
            !originalRequest.url.includes('/auth/refresh')
        ) {
            originalRequest._retry = true;

            try {
                const response = await api.post('/auth/refresh', {});
                const { accessToken } = response.data;
                setAccessToken(accessToken);
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                setAccessToken(null);
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);


// fetchClient
//    └── request
//         └── 401?
//              └── call axios refresh
//                   └── retry fetch once
let refreshPromise = null;
export async function refreshAccessToken() {
    if (!refreshPromise) {
        refreshPromise = (async () => {
            try {
                const response = await api.post("/auth/refresh", {});
                const { accessToken } = response.data;
                setAccessToken(accessToken);
                return accessToken;
            } finally {
                refreshPromise = null;
            }
        })();
    }

    return refreshPromise;
}

export default api;
