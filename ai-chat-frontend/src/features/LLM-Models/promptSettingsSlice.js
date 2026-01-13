import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
    fetchPromptSettings as fetchPromptSettingsApi,
    updatePromptSettings as updatePromptSettingsApi,
    resetPromptSettings as resetPromptSettingsApi,
} from "../../api/services/promptSettings";


/* =========================
   Async Thunks
   ========================= */

export const fetchPromptSettings = createAsyncThunk(
    "promptSettings/fetch",
    async (_, { rejectWithValue }) => {
        try {
            return await fetchPromptSettingsApi();
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || err.message
            );
        }
    }
);

export const updatePromptSettings = createAsyncThunk(
    "promptSettings/update",
    async (payload, { rejectWithValue }) => {
        try {
            return await updatePromptSettingsApi(payload);
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || err.message
            );
        }
    }
);

export const resetPromptSettings = createAsyncThunk(
    "promptSettings/reset",
    async (_, { rejectWithValue }) => {
        try {
            return await resetPromptSettingsApi();
        } catch (err) {
            return rejectWithValue(
                err.response?.data?.message || err.message
            );
        }
    }
);

/* =========================
   Slice
   ========================= */

const promptSettingsSlice = createSlice({
    name: "promptSettings",
    initialState: {
        systemPrompt: "",
        loading: false,
        error: null,
        lastUpdated: null,
    },
    reducers: {
        clearPromptSettingsError(state) {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            /* FETCH */
            .addCase(fetchPromptSettings.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchPromptSettings.fulfilled, (state, action) => {
                state.loading = false;
                state.systemPrompt = action.payload.systemPrompt || "";
                state.lastUpdated = action.payload.updatedAt || null;
            })
            .addCase(fetchPromptSettings.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            /* UPDATE */
            .addCase(updatePromptSettings.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(updatePromptSettings.fulfilled, (state, action) => {
                state.loading = false;
                state.systemPrompt = action.payload.systemPrompt;
                state.lastUpdated = action.payload.updatedAt;
            })
            .addCase(updatePromptSettings.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            /* RESET */
            .addCase(resetPromptSettings.fulfilled, (state, action) => {
                state.systemPrompt = action.payload.systemPrompt;
                state.lastUpdated = action.payload.updatedAt;
            });
    },
});

export const {
    clearPromptSettingsError,
} = promptSettingsSlice.actions;

export default promptSettingsSlice.reducer;
