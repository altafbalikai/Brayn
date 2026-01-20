import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    getLLMModels,
    setSelectedModelId,
} from '../../LLM-Models/llm-modelsSlice';

export const useLLMIntegration = () => {
    const dispatch = useDispatch();

    const {
        llmmodels,
        selectedModelId,
        loading: llmsloading,
    } = useSelector((state) => state.llmModels);

    // Memoize models
    const memoizedLLMModels = useMemo(() => llmmodels, [llmmodels]);

    // Load LLM models
    useEffect(() => {
        dispatch(getLLMModels({ capability: "text" }));
    }, [dispatch]);

    // Set default model
    useEffect(() => {
        if (!selectedModelId && llmmodels.length > 0) {
            dispatch(setSelectedModelId(llmmodels[2]._id));
        }
    }, [llmmodels.length, selectedModelId, dispatch, llmmodels]);

    // Load from localStorage
    const hasLoadedFromStorage = useRef(false);
    useEffect(() => {
        if (!hasLoadedFromStorage.current && llmmodels.length > 0) {
            hasLoadedFromStorage.current = true;
            const savedModelId = localStorage.getItem("selectedModelId");

            if (savedModelId && llmmodels.some((m) => m._id === savedModelId)) {
                dispatch(setSelectedModelId(savedModelId));
            }
        }
    }, [llmmodels.length, dispatch, llmmodels]);

    return {
        llmmodels,
        selectedModelId,
        llmsloading,
        memoizedLLMModels,
    };
};
