import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { authService } from "../../api/services/authService";

/* =========================
   Async thunks
========================= */

export const login = createAsyncThunk(
    "auth/login",
    async ({ email, password }, { rejectWithValue }) => {
        try {
            const data = await authService.login(email, password);
            localStorage.setItem("accessToken", data.accessToken);
            return data;
        } catch (error) {
            const status = error.response?.status;

            let message = "Login failed";

            if (status === 401) {
                message = "Invalid email or password";
            } else if (status === 429) {
                message = "Too many attempts. Please try again later.";
            } else if (error.message === "Network Error") {
                message = "Unable to connect. Check your internet.";
            }

            return rejectWithValue({ message, status });
        }
    }
);


export const signup = createAsyncThunk(
    "auth/signup",
    async ({ email, password, name }, { rejectWithValue }) => {
        try {
            await authService.signup(email, password, name);

            const data = await authService.login(email, password);
            localStorage.setItem("accessToken", data.accessToken);

            return data;
        } catch (error) {
            const status = error.response?.status;
            const message =
                status === 409
                    ? "User already exists. Please log in."
                    : error.response?.data?.error || "Signup failed";

            return rejectWithValue({ message, status });
        }
    }
);


export const logout = createAsyncThunk(
    "auth/logout",
    async (_, { dispatch }) => {
        // Clear client state FIRST
        localStorage.removeItem("accessToken");

        // Fire-and-forget server logout
        authService.logout().catch(() => {
            // optional: log error, but DO NOT block logout
            console.warn("Server logout failed");
        });

        // No await needed
        return;
    }
);


/**
 * 🔑 AUTH INITIALIZATION (CRITICAL)
 * Runs once on app startup
 */
export const initializeAuth = createAsyncThunk(
    "auth/initializeAuth",
    async (_, { rejectWithValue }) => {
        try {
            const token = localStorage.getItem("accessToken");

            if (!token) {
                return { user: null, accessToken: null };
            }

            const user = await authService.getProfile();
            return { user, accessToken: token };
        } catch (error) {
            localStorage.removeItem("accessToken");
            return rejectWithValue("Auth initialization failed");
        }
    }
);

/* =========================
   Initial State
========================= */

const initialState = {
    user: null,
    accessToken: null,
    isAuthenticated: false,
    initialized: false,
    loading: false,
    error: null,
};

/* =========================
   Slice
========================= */

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        clearError: (state) => {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            /* -------- Initialize Auth -------- */
            .addCase(initializeAuth.pending, (state) => {
                state.loading = true;
            })
            .addCase(initializeAuth.fulfilled, (state, action) => {
                state.loading = false;
                state.user = action.payload.user;
                state.accessToken = action.payload.accessToken;
                state.isAuthenticated = !!action.payload.user;
                state.initialized = true;
            })
            .addCase(initializeAuth.rejected, (state) => {
                state.loading = false;
                state.user = null;
                state.accessToken = null;
                state.isAuthenticated = false;
                state.initialized = true;
            })

            /* -------- Login -------- */
            .addCase(login.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(login.fulfilled, (state, action) => {
                state.loading = false;
                state.user = action.payload.user;
                state.accessToken = action.payload.accessToken;
                state.isAuthenticated = true;
                state.initialized = true;
            })
            .addCase(login.rejected, (state, action) => {
                state.loading = false;
                state.user = null;
                state.accessToken = null;
                state.isAuthenticated = false;
                state.error = action.payload?.message || "Login failed";
            })

            /* -------- Signup -------- */
            .addCase(signup.pending, (state) => {
                state.loading = true;
                state.error = null;
            })

            .addCase(signup.fulfilled, (state, action) => {
                state.loading = false;
                state.user = action.payload.user;
                state.accessToken = action.payload.accessToken;
                state.isAuthenticated = true;
                state.initialized = true;
            })

            .addCase(signup.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload?.message || "Signup failed";
            })

            /* -------- Logout -------- */
            .addCase(logout.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(logout.fulfilled, (state) => {
                state.loading = false;
                state.user = null;
                state.accessToken = null;
                state.isAuthenticated = false;
                state.initialized = true;
            });
    },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
