import { describe, it, expect, vi, beforeEach } from 'vitest';
import reducer, {
    setSelectedModelId,
    getLLMModels
} from '../llm-modelsSlice';

describe('llm-modelsSlice', () => {
    const initialState = {
        llmmodels: [],
        selectedModelId: null,
        loading: false,
        error: null
    };

    describe('getLLMModels.fulfilled', () => {
        it('should populate llmmodels array from payload', () => {
            const models = [
                { _id: 'm1', name: 'Model 1', status: 'active' },
                { _id: 'm2', name: 'Model 2', status: 'active' }
            ];
            const action = { type: getLLMModels.fulfilled.type, payload: models };
            const state = reducer(initialState, action);

            expect(state.llmmodels).toEqual(models);
            expect(state.loading).toBe(false);
        });

        it('should NOT set selectedModelId to first model automatically', () => {
            const models = [
                { _id: 'm1', name: 'Model 1', status: 'active' }
            ];
            const action = { type: getLLMModels.fulfilled.type, payload: models };
            const state = reducer(initialState, action);

            expect(state.selectedModelId).toBeNull();
            // This confirms the aggressive default was removed from the slice
        });

        it('should preserve existing selectedModelId when models load', () => {
            const stateWithSelection = {
                ...initialState,
                selectedModelId: 'm2'
            };
            const models = [
                { _id: 'm1', name: 'Model 1', status: 'active' },
                { _id: 'm2', name: 'Model 2', status: 'active' }
            ];
            const action = { type: getLLMModels.fulfilled.type, payload: models };
            const state = reducer(stateWithSelection, action);

            expect(state.selectedModelId).toBe('m2');
        });
    });

    describe('setSelectedModelId', () => {
        beforeEach(() => {
            vi.container = { localStorage: window.localStorage };
            vi.spyOn(window.localStorage, 'setItem');
        });

        it('should update selectedModelId in state', () => {
            const state = reducer(initialState, setSelectedModelId('model-abc'));
            expect(state.selectedModelId).toBe('model-abc');
        });

        it('should NOT write to localStorage', () => {
            const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
            reducer(initialState, setSelectedModelId('model-abc'));

            // This confirms the localStorage write was removed from the reducer
            expect(setItemSpy).not.toHaveBeenCalled();
            setItemSpy.mockRestore();
        });
    });
});
