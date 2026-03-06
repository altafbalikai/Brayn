import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDispatch, useSelector } from 'react-redux';
import { useLLMIntegration } from '../useLLMIntegration';
import * as modelsActions from '../../../LLM-Models/llm-modelsSlice';

// Mock react-redux
vi.mock('react-redux', () => ({
    useDispatch: vi.fn(),
    useSelector: vi.fn()
}));

// Mock the models actions
vi.mock('../../../LLM-Models/llm-modelsSlice', async () => {
    const actual = await vi.importActual('../../../LLM-Models/llm-modelsSlice');
    return {
        ...actual,
        getLLMModels: vi.fn(),
        setSelectedModelId: vi.fn((id) => ({ type: 'setSelectedModelId', payload: id }))
    };
});

describe('useLLMIntegration', () => {
    const dispatch = vi.fn();
    const mockState = {
        llmModels: {
            llmmodels: [],
            selectedModelId: null,
            loading: false
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        useDispatch.mockReturnValue(dispatch);
        useSelector.mockImplementation((selectorFn) => selectorFn(mockState));

        // Reset mockState
        mockState.llmModels.llmmodels = [];
        mockState.llmModels.selectedModelId = null;

        // Mock localStorage
        const store = {};
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => store[key] || null),
            setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
            clear: vi.fn(() => { for (const key in store) delete store[key]; })
        });
    });

    describe('CASE 1 — Existing conversation sync', () => {
        it('should dispatch setSelectedModelId with conversation selectedModelId when conversation is open and model is active', () => {
            const llmmodels = [
                { _id: 'm1', status: 'active', displayName: 'Model 1' },
                { _id: 'm2', status: 'active', displayName: 'Model 2' }
            ];
            mockState.llmModels.llmmodels = llmmodels;

            const currentConversation = {
                _id: 'conv1',
                isDraft: false,
                selectedModelId: 'm2'
            };

            renderHook(() => useLLMIntegration(currentConversation));

            expect(modelsActions.setSelectedModelId).toHaveBeenCalledWith('m2');
            expect(dispatch).toHaveBeenCalledWith(modelsActions.setSelectedModelId('m2'));
        });

        it('should fall back to first active model when conversation model is not in active models list', () => {
            const llmmodels = [
                { _id: 'm1', status: 'active', displayName: 'Model 1' },
                { _id: 'm2', status: 'inactive', displayName: 'Model 2' }
            ];
            mockState.llmModels.llmmodels = llmmodels;

            const currentConversation = {
                _id: 'conv1',
                isDraft: false,
                selectedModelId: 'm2' // inactive
            };

            renderHook(() => useLLMIntegration(currentConversation));

            expect(modelsActions.setSelectedModelId).toHaveBeenCalledWith('m1');
        });

        it('should not dispatch if selectedModelId already matches conversation model', () => {
            mockState.llmModels.llmmodels = [{ _id: 'm1', status: 'active', displayName: 'Model 1' }];
            mockState.llmModels.selectedModelId = 'm1';

            const currentConversation = {
                _id: 'conv1',
                isDraft: false,
                selectedModelId: 'm1'
            };

            renderHook(() => useLLMIntegration(currentConversation));

            expect(modelsActions.setSelectedModelId).not.toHaveBeenCalled();
        });
    });

    describe('CASE 2 — Draft / new chat sync', () => {
        it('should use localStorage model when valid and no conversation open', () => {
            const llmmodels = [
                { _id: 'm1', status: 'active' },
                { _id: 'm2', status: 'active' }
            ];
            mockState.llmModels.llmmodels = llmmodels;
            localStorage.setItem('selectedModelId', 'm2');

            const currentConversation = { isDraft: true };

            renderHook(() => useLLMIntegration(currentConversation));

            expect(modelsActions.setSelectedModelId).toHaveBeenCalledWith('m2');
        });

        it('should fall back to first active model when localStorage is empty', () => {
            mockState.llmModels.llmmodels = [{ _id: 'm1', status: 'active' }];
            localStorage.clear();

            const currentConversation = null;

            renderHook(() => useLLMIntegration(currentConversation));

            expect(modelsActions.setSelectedModelId).toHaveBeenCalledWith('m1');
        });

        it('should fall back to first active model when localStorage model is no longer in active models list', () => {
            const llmmodels = [
                { _id: 'm1', status: 'active' }
            ];
            mockState.llmModels.llmmodels = llmmodels;
            localStorage.setItem('selectedModelId', 'deleted-model');

            const currentConversation = null;

            renderHook(() => useLLMIntegration(currentConversation));

            expect(modelsActions.setSelectedModelId).toHaveBeenCalledWith('m1');
        });
    });

    describe('Race condition handling', () => {
        it('should not dispatch when llmmodels is empty (models not yet loaded)', () => {
            mockState.llmModels.llmmodels = [];
            const currentConversation = { _id: 'conv1', selectedModelId: 'm1' };

            renderHook(() => useLLMIntegration(currentConversation));

            expect(modelsActions.setSelectedModelId).not.toHaveBeenCalled();
        });

        it('should sync correctly when models load AFTER conversation is set', () => {
            mockState.llmModels.llmmodels = [];
            const currentConversation = { _id: 'conv1', selectedModelId: 'm1' };

            const { rerender } = renderHook(
                ({ models, conv }) => useLLMIntegration(conv),
                { initialProps: { models: [], conv: currentConversation } }
            );

            expect(modelsActions.setSelectedModelId).not.toHaveBeenCalled();

            // Simulate models loading
            mockState.llmModels.llmmodels = [{ _id: 'm1', status: 'active' }];
            rerender({ models: mockState.llmModels.llmmodels, conv: currentConversation });

            expect(modelsActions.setSelectedModelId).toHaveBeenCalledWith('m1');
        });
    });

    describe('Removed behaviours', () => {
        it('should NOT default to llmmodels[2] (hardcoded index removed)', () => {
            const llmmodels = [
                { _id: 'm1', status: 'active' },
                { _id: 'm2', status: 'active' },
                { _id: 'm3', status: 'active' }
            ];
            mockState.llmModels.llmmodels = llmmodels;
            localStorage.clear();

            const currentConversation = null;

            renderHook(() => useLLMIntegration(currentConversation));

            // Should be m1 (first), not m3 (index 2)
            expect(modelsActions.setSelectedModelId).toHaveBeenCalledWith('m1');
            expect(modelsActions.setSelectedModelId).not.toHaveBeenCalledWith('m3');
        });

        it('should NOT read from localStorage on every render', () => {
            mockState.llmModels.llmmodels = [{ _id: 'm1', status: 'active', displayName: 'M1' }];
            const currentConversation = null;

            const { rerender } = renderHook(() => useLLMIntegration(currentConversation));

            // Clear initial call count
            vi.mocked(localStorage.getItem).mockClear();

            rerender();
            rerender();

            // After initial mount, it should not call again if deps are stable
            expect(localStorage.getItem).not.toHaveBeenCalled();
        });
    });
});
