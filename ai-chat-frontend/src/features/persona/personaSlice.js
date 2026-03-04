import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
    getPersonas,
    switchPersona,
    savePersonaPreference,
} from '../../api/services/personaService';

// Async Thunks
export const fetchPersonas = createAsyncThunk(
    'persona/fetchPersonas',
    async (_, { rejectWithValue }) => {
        try {
            return await getPersonas();
        } catch (error) {
            return rejectWithValue(
                error?.message || 'Failed to fetch personas'
            );
        }
    }
);

export const switchPersonaThunk = createAsyncThunk(
    'persona/switchPersona',
    async ({ conversationId, personaId }, { rejectWithValue }) => {
        try {
            const result = await switchPersona(conversationId, personaId);
            return { conversationId, personaId, result };
        } catch (error) {
            return rejectWithValue(
                error?.message || 'Failed to switch persona'
            );
        }
    }
);

export const savePersonaPreferenceThunk = createAsyncThunk(
    'persona/savePreference',
    async (personaId, { rejectWithValue }) => {
        try {
            return await savePersonaPreference(personaId);
        } catch (error) {
            return rejectWithValue(
                error?.message || 'Failed to save preference'
            );
        }
    }
);

const initialState = {
    personas: [],
    currentPersonaId: null,
    lastUsedPersonaId: null,
    loading: false,
    error: null,
    cardErrors: {},
};

const personaSlice = createSlice({
    name: 'persona',
    initialState,
    reducers: {
        setCurrentPersona: (state, action) => {
            state.currentPersonaId = action.payload;
            state.error = null;
        },
        initializePersonaForConversation: (state, action) => {
            // Priority 1: Use persona ID from the conversation
            // Priority 2: Use lastUsedPersonaId (if available)
            // Priority 3: Fallback to General Assistant (if loaded)

            const conversationPersonaId = action.payload;

            if (conversationPersonaId) {
                state.currentPersonaId = conversationPersonaId;
            } else if (state.lastUsedPersonaId) {
                state.currentPersonaId = state.lastUsedPersonaId;
            } else {
                const generalAssistant = state.personas.find(p => p.slug === 'general-assistant');
                if (generalAssistant) {
                    state.currentPersonaId = generalAssistant.id;
                }
            }
        },
        clearError: (state) => {
            state.error = null;
        },
        clearCardError: (state, action) => {
            delete state.cardErrors[action.payload];
        },
    },
    extraReducers: (builder) => {
        // Fetch Personas
        builder
            .addCase(fetchPersonas.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchPersonas.fulfilled, (state, action) => {
                state.loading = false;
                state.personas = action.payload;
            })
            .addCase(fetchPersonas.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });

        // Switch Persona
        builder
            .addCase(switchPersonaThunk.pending, (state) => {
                state.error = null;
                // console.log('🟡 Switching persona (pending)...');
            })
            .addCase(switchPersonaThunk.fulfilled, (state, action) => {
                // console.log('✅ Persona switched (fulfilled):', action.payload.personaId);
                state.currentPersonaId = action.payload.personaId;
                state.lastUsedPersonaId = action.payload.personaId;
            })
            .addCase(switchPersonaThunk.rejected, (state, action) => {
                console.error('❌ Persona switch (rejected):', action.payload);
                state.cardErrors['switch'] = action.payload;
            });

        // Save Preference
        builder
            .addCase(savePersonaPreferenceThunk.fulfilled, (state, action) => {
                state.lastUsedPersonaId = action.payload.personaId;
            });
    },
});

// Selectors
export const selectPersonas = (state) => state.persona.personas;
export const selectCurrentPersonaId = (state) => state.persona.currentPersonaId;
export const selectCurrentPersona = (state) => {
    const currentId = state.persona.currentPersonaId;
    return state.persona.personas.find((p) => p.id === currentId);
};
export const selectPersonaLoading = (state) => state.persona.loading;
export const selectPersonaError = (state) => state.persona.error;
export const selectCardErrors = (state) => state.persona.cardErrors;

export const {
    setCurrentPersona,
    initializePersonaForConversation,
    clearError,
    clearCardError
} = personaSlice.actions;
export default personaSlice.reducer;
