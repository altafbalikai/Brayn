import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
    getMemories as getMemoriesApi,
    toggleMemory as toggleMemoryApi,
    editMemory as editMemoryApi,
    deleteMemory as deleteMemoryApi
} from '../../api/services/memoryService';

/**
 * State Shape:
 * {
 *   memories: [],
 *   loading: false,
 *   error: null,
 *   cardErrors: {} // { [key]: 'Error message' }
 * }
 */

/* ===========================
   Async Thunks
   =========================== */

/**
 * Fetch all memories from the backend.
 */
export const fetchMemories = createAsyncThunk(
    'memory/fetchMemories',
    async (_, { rejectWithValue }) => {
        try {
            return await getMemoriesApi();
        } catch (err) {
            return rejectWithValue(err.response?.data?.error || err.message);
        }
    }
);

/**
 * Optimistic toggle for memory enabled status.
 * Accepts { key, enabled }.
 */
export const toggleMemory = createAsyncThunk(
    'memory/toggleMemory',
    async ({ key, enabled }, { dispatch, getState, rejectWithValue }) => {
        const state = getState();
        const memory = state.memory.memories.find(m => m.key === key);
        const previousEnabled = memory?.enabled ?? true;

        // 1. Dispatch optimistic update
        dispatch(optimisticToggle({ key, enabled }));

        try {
            // 2. API call
            return await toggleMemoryApi(key, enabled);
        } catch (err) {
            // 3. Revert on failure
            dispatch(revertToggle({ key, previousEnabled }));
            dispatch(setCardError({
                key,
                error: 'Toggle failed. Please try again.'
            }));
            return rejectWithValue(err.message);
        }
    }
);

/**
 * Non-optimistic edit for memory value.
 * Accepts { key, newValue }.
 */
export const editMemory = createAsyncThunk(
    'memory/editMemory',
    async ({ key, newValue }, { dispatch, rejectWithValue }) => {
        try {
            const result = await editMemoryApi(key, newValue);
            // Update state on success
            dispatch(updateMemoryValue({
                key,
                value: result.value,
                updatedAt: new Date().toISOString()
            }));
            return result;
        } catch (err) {
            dispatch(setCardError({
                key,
                error: 'Edit failed. Please try again.'
            }));
            return rejectWithValue(err.message);
        }
    }
);

/**
 * Delete memory fact.
 */
export const deleteMemory = createAsyncThunk(
    'memory/deleteMemory',
    async (key, { dispatch, rejectWithValue }) => {
        try {
            const result = await deleteMemoryApi(key);
            dispatch(removeMemory(key));
            return result;
        } catch (err) {
            dispatch(setCardError({
                key,
                error: 'Delete failed. Please try again.'
            }));
            return rejectWithValue(err.message);
        }
    }
);

/* ===========================
   Slice
   =========================== */

const memorySlice = createSlice({
    name: 'memory',
    initialState: {
        memories: [],
        loading: false,
        error: null,
        cardErrors: {}
    },
    reducers: {
        optimisticToggle: (state, action) => {
            const memory = state.memories.find(m => m.key === action.payload.key);
            if (memory) {
                memory.enabled = action.payload.enabled;
            }
        },
        revertToggle: (state, action) => {
            const memory = state.memories.find(m => m.key === action.payload.key);
            if (memory) {
                memory.enabled = action.payload.previousEnabled;
            }
        },
        updateMemoryValue: (state, action) => {
            const memory = state.memories.find(m => m.key === action.payload.key);
            if (memory) {
                memory.value = action.payload.value;
                memory.updatedAt = action.payload.updatedAt;
            }
        },
        removeMemory: (state, action) => {
            state.memories = state.memories.filter(m => m.key !== action.payload);
        },
        setCardError: (state, action) => {
            state.cardErrors[action.payload.key] = action.payload.error;
        },
        clearCardError: (state, action) => {
            delete state.cardErrors[action.payload.key];
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchMemories.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchMemories.fulfilled, (state, action) => {
                state.loading = false;
                state.memories = action.payload;
            })
            .addCase(fetchMemories.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload || action.error.message;
            });
    }
});

/* ===========================
   Selectors
   =========================== */

export const selectMemories = state => state.memory.memories;
export const selectMemoryLoading = state => state.memory.loading;
export const selectMemoryError = state => state.memory.error;
export const selectCardErrors = state => state.memory.cardErrors;

/* ===========================
   Exports
   =========================== */

export const {
    optimisticToggle,
    revertToggle,
    updateMemoryValue,
    removeMemory,
    setCardError,
    clearCardError
} = memorySlice.actions;

export default memorySlice.reducer;
