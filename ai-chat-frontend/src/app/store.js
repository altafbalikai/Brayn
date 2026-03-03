import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import conversationReducer from '../features/conversations/conversationSlice';
import llmModelsReducer from '../features/LLM-Models/llm-modelsSlice'
import promptSettingsReducer from '../features/LLM-Models/promptSettingsSlice'
import memoryReducer from '../features/memory/memorySlice';
import personaReducer from '../features/persona/personaSlice';
import messageInteractionsReducer from '../features/messages/messageInteractionsSlice';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        conversation: conversationReducer,
        llmModels: llmModelsReducer,
        promptSettings: promptSettingsReducer,
        memory: memoryReducer,
        persona: personaReducer,
        messageInteractions: messageInteractionsReducer
    },
});
