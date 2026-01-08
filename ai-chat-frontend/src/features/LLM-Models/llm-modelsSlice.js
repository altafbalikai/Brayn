import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
    fetchLLMModels,
    fetchLLMModelById,
    createLLMModel,
    updateLLMModel,
    deleteLLMModel,
} from '../../api/services/llmModelsService';

/* ===========================
   Async Thunks
   =========================== */

/**
 * GET /llm-models
 */
export const getLLMModels = createAsyncThunk(
    "llmModels/getAll",
    async (filters = {}, { rejectWithValue }) => {
        try {
            return await fetchLLMModels(filters);
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

/**
 * GET /llm-models/:id
 */
export const getLLMModel = createAsyncThunk(
    "llmModels/getOne",
    async (id, { rejectWithValue }) => {
        try {
            return await fetchLLMModelById(id);
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

/**
 * POST /llm-models
 */
export const addLLMModel = createAsyncThunk(
    "llmModels/create",
    async (payload, { rejectWithValue }) => {
        try {
            return await createLLMModel(payload);
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

/**
 * PATCH /llm-models/:id
 */
export const editLLMModel = createAsyncThunk(
    "llmModels/update",
    async ({ id, payload }, { rejectWithValue }) => {
        try {
            return await updateLLMModel(id, payload);
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

/**
 * DELETE /llm-models/:id
 */
export const removeLLMModel = createAsyncThunk(
    "llmModels/delete",
    async (id, { rejectWithValue }) => {
        try {
            await deleteLLMModel(id);
            return id;
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

/* ===========================
   Slice
   =========================== */

const llmModelsSlice = createSlice({
    name: "llmModels",
    initialState: {
        llmmodels: [],
        selected: null,
        selectedModelId: null,
        loading: false,
        error: null,
    },
    reducers: {
        clearLLMModelError(state) {
            state.error = null;
        },
        clearSelectedLLMModel(state) {
            state.selected = null;
        },
        // NEW: user selects model before chat starts
        setSelectedModelId(state, action) {
            state.selectedModelId = action.payload;
            localStorage.setItem("selectedModelId", action.payload);
        },
    },
    extraReducers: (builder) => {
        builder
            /* ---- GET ALL ---- */
            .addCase(getLLMModels.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getLLMModels.fulfilled, (state, action) => {
                state.loading = false;
                state.llmmodels = action.payload;

                // Set default model ONLY if none selected yet
                if (!state.selectedModelId && action.payload.length > 0) {
                    state.selectedModelId = action.payload[0]._id;
                }
            })
            .addCase(getLLMModels.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            /* ---- GET ONE ---- */
            .addCase(getLLMModel.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getLLMModel.fulfilled, (state, action) => {
                state.loading = false;
                state.selected = action.payload;
            })
            .addCase(getLLMModel.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            /* ---- CREATE ---- */
            .addCase(addLLMModel.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(addLLMModel.fulfilled, (state, action) => {
                state.loading = false;
                state.llmmodels.unshift(action.payload);
            })
            .addCase(addLLMModel.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            /* ---- UPDATE ---- */
            .addCase(editLLMModel.fulfilled, (state, action) => {
                state.llmmodels = state.llmmodels.map((m) =>
                    m._id === action.payload._id ? action.payload : m
                );
                if (state.selected?._id === action.payload._id) {
                    state.selected = action.payload;
                }
            })

            /* ---- DELETE (SOFT) ---- */
            .addCase(removeLLMModel.fulfilled, (state, action) => {
                state.llmmodels = state.llmmodels.filter((m) => m._id !== action.payload);
            });
    },
});

/* ===========================
   Exports
   =========================== */

export const {
    clearLLMModelError,
    clearSelectedLLMModel,
    setSelectedModelId,
} = llmModelsSlice.actions;

export default llmModelsSlice.reducer;
