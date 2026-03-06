import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    getLLMModels,
    setSelectedModelId,
} from '../../LLM-Models/llm-modelsSlice';

export const useLLMIntegration = (currentConversation) => {
    const dispatch = useDispatch();

    const {
        llmmodels,
        selectedModelId,
        loading: llmsloading,
    } = useSelector((state) => state.llmModels);

    const selectedModelIdRef = useRef(selectedModelId);
    useEffect(() => {
        selectedModelIdRef.current = selectedModelId;
    }, [selectedModelId]);

    // Memoize models
    const memoizedLLMModels = useMemo(() => llmmodels, [llmmodels]);

    // Load LLM models
    useEffect(() => {
        dispatch(getLLMModels({ capability: "text" }));
    }, [dispatch]);

    // Model Sync Logic: Source of Truth is currentConversation or Fallbacks
    useEffect(() => {
        if (llmmodels.length === 0) return;

        const activeModels = llmmodels.filter(m => m.status === 'active');
        if (activeModels.length === 0) return;

        const defaultModelId = activeModels[0]._id;
        const savedModelId = localStorage.getItem("selectedModelId");
        const validSavedModel = savedModelId && activeModels.some(m => m._id === savedModelId);

        // CASE 1: Existing Conversation
        if (currentConversation && !currentConversation.isDraft && currentConversation._id) {
            const convModelId = currentConversation.selectedModelId;
            const isModelValid = convModelId && activeModels.some(m => m._id === convModelId);

            const targetId = isModelValid ? convModelId : defaultModelId;

            if (selectedModelIdRef.current !== targetId) {
                dispatch(setSelectedModelId(targetId));
            }
        }
        // CASE 2: New Chat / Draft (Handles initial LocalStorage load)
        else {
            const targetId = validSavedModel ? savedModelId : defaultModelId;

            if (selectedModelIdRef.current !== targetId) {
                dispatch(setSelectedModelId(targetId));
            }
        }
    }, [
        currentConversation?._id,
        currentConversation?.selectedModelId,
        llmmodels,
        dispatch
        // selectedModelId intentionally omitted to prevent infinite loop. Guard inside handles it.
    ]);

    return {
        llmmodels,
        selectedModelId,
        llmsloading,
        memoizedLLMModels,
    };
};
