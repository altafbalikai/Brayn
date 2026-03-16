import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { authService } from "../../api/services/authService";

/* =========================
   Async thunks
========================= */

export const login = createAsyncThunk(
    "auth/login",
    async ({ email, password }, { rejectWithValue }) => {
        try {
            return await authService.login(email, password);
        } catch (error) {
            const status = error.response?.status;
            let message = "Login failed";

            if (status === 401) message = "Invalid email or password";
            else if (status === 429)
                message = "Too many attempts. Please try again later.";
            else if (error.message === "Network Error")
                message = "Unable to connect. Check your internet.";

            return rejectWithValue({ message, status });
        }
    }
);

export const signup = createAsyncThunk(
    "auth/signup",
    async ({ email, password, name }, { rejectWithValue }) => {
        try {
            await authService.signup(email, password, name);
            return await authService.login(email, password);
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
    async () => {

        // Fire-and-forget server logout
        authService.logout().catch(() => {
            // optional: log error, but DO NOT block logout
            console.warn("Server logout failed");
        });

        // No await needed
        return;
    });

export const forgotPassword = createAsyncThunk(
    "auth/forgotPassword",
    async ({ email }, { rejectWithValue }) => {
        try {
            await authService.forgotPassword(email);
            return true;
        } catch {
            return rejectWithValue("Unable to send reset email");
        }
    }
);

export const resetPassword = createAsyncThunk(
    "auth/resetPassword",
    async ({ token, newPassword }, { rejectWithValue }) => {
        try {
            await authService.resetPassword({ token, newPassword });
            return true;
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.error || "Password reset failed"
            );
        }
    }
);

export const initializeAuth = createAsyncThunk(
    "auth/initializeAuth",
    async (_, { rejectWithValue }) => {
        try {
            // Ensure we have a fresh access token in memory (refresh cookie → access token)
            await authService.refresh();
            const user = await authService.getProfile();
            return { user };
        } catch {
            return rejectWithValue("Auth initialization failed");
        }
    }
);

/* =========================
   Initial State
========================= */

const initialState = {
    user: null,
    isAuthenticated: false,
    initialized: false,
    loading: false,
    error: null,
    forgotPasswordSuccess: false,
    resetPasswordSuccess: false,
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
        clearPasswordFlags: (state) => {
            state.forgotPasswordSuccess = false;
            state.resetPasswordSuccess = false;
        },
    },
    extraReducers: (builder) => {
        builder
            /* -------- Initialize -------- */
            .addCase(initializeAuth.fulfilled, (state, action) => {
                state.user = action.payload.user;
                state.isAuthenticated = !!action.payload.user;
                state.initialized = true;
            })
            .addCase(initializeAuth.rejected, (state) => {
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
                state.isAuthenticated = true;
            })
            .addCase(login.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload?.message;
            })

            /* -------- Signup -------- */
            .addCase(signup.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(signup.fulfilled, (state, action) => {
                state.loading = false;
                state.user = action.payload.user;
                state.isAuthenticated = true;
            })
            .addCase(signup.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload?.message;
            })

            /* -------- Logout -------- */
            .addCase(logout.fulfilled, (state) => {
                state.user = null;
                state.isAuthenticated = false;
            })

            /* -------- Forgot Password -------- */
            .addCase(forgotPassword.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(forgotPassword.fulfilled, (state) => {
                state.loading = false;
                state.forgotPasswordSuccess = true;
            })
            .addCase(forgotPassword.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            /* -------- Reset Password -------- */
            .addCase(resetPassword.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(resetPassword.fulfilled, (state) => {
                state.loading = false;
                state.resetPasswordSuccess = true;
            })
            .addCase(resetPassword.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export const { clearError, clearPasswordFlags } = authSlice.actions;
export default authSlice.reducer;
