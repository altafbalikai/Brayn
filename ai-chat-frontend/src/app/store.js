import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import conversationReducer from '../features/conversations/conversationSlice';
import llmModelsReducer from '../features/LLM-Models/llm-modelsSlice'

export const store = configureStore({
    reducer: {
        auth: authReducer,
        conversation: conversationReducer,
        llmModels: llmModelsReducer,
    },
});
