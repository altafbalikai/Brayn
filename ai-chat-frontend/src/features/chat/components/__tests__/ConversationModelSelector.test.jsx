import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useDispatch, useSelector } from 'react-redux';
import ConversationModelSelector from '../ConversationModelSelector';
import * as interactionSlice from '../../../conversations/conversationSlice';
import * as modelsSlice from '../../../LLM-Models/llm-modelsSlice';

// Mock react-redux
vi.mock('react-redux', () => ({
    useDispatch: vi.fn(),
    useSelector: vi.fn()
}));

// Mock the slices
vi.mock('../../../conversations/conversationSlice', async () => {
    const actual = await vi.importActual('../../../conversations/conversationSlice');
    return {
        ...actual,
        updateConversationModel: vi.fn((payload) => ({ type: 'updateConversationModel', payload }))
    };
});

vi.mock('../../../LLM-Models/llm-modelsSlice', async () => {
    const actual = await vi.importActual('../../../LLM-Models/llm-modelsSlice');
    return {
        ...actual,
        setSelectedModelId: vi.fn((id) => ({ type: 'setSelectedModelId', payload: id }))
    };
});

// Mock ModalPortal to render children directly
vi.mock('../../../../components/ui/ModalPortal', () => ({
    default: ({ children }) => <div>{children}</div>,
    ModalPortal: ({ children }) => <div>{children}</div>
}));

describe('ConversationModelSelector — localStorage behaviour', () => {
    const dispatch = vi.fn();
    const mockModels = [
        { _id: 'm1', displayName: 'Model 1', status: 'active', provider: 'openai', description: 'desc1' },
        { _id: 'm2', displayName: 'Model 2', status: 'active', provider: 'anthropic', description: 'desc2' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        useDispatch.mockReturnValue(dispatch);
        
        // Mock scrollIntoView (not in JSDOM)
        window.HTMLElement.prototype.scrollIntoView = vi.fn();

        // Mock useSelector specifically for isStreaming
        useSelector.mockImplementation((selectorFn) => {
            const state = {
                conversation: {
                    assistantTyping: {}
                }
            };
            return selectorFn(state);
        });

        // Mock localStorage
        vi.stubGlobal('localStorage', {
            setItem: vi.fn(),
            getItem: vi.fn()
        });
    });

    const renderSelector = (props = {}) => {
        const currentConversation = props.currentConversation || null;
        const selectedModelId = currentConversation?.selectedModelId || 'm1';
        
        return render(
            <ConversationModelSelector 
                llmmodels={mockModels}
                selectedModelId={selectedModelId}
                llmsloading={false}
                currentConversation={currentConversation}
                {...props}
            />
        );
    };

    it('should write to localStorage when user manually selects a model on a draft conversation', () => {
        renderSelector({ currentConversation: { isDraft: true } });

        // Open dropdown
        const trigger = screen.getByRole('button');
        fireEvent.click(trigger);

        // Click Model 2
        const model2Option = screen.getByText('Model 2');
        fireEvent.click(model2Option);

        // Assertions
        expect(localStorage.setItem).toHaveBeenCalledWith('selectedModelId', 'm2');
        expect(modelsSlice.setSelectedModelId).toHaveBeenCalledWith('m2');
        expect(dispatch).toHaveBeenCalledWith(modelsSlice.setSelectedModelId('m2'));
    });

    it('should write to localStorage when user manually selects a model on an existing conversation', () => {
        renderSelector({ 
            currentConversation: { _id: 'conv1', isDraft: false, selectedModelId: 'm1' } 
        });

        // Open dropdown
        const trigger = screen.getByRole('button');
        fireEvent.click(trigger);

        // Click Model 2
        const model2Option = screen.getByText('Model 2');
        fireEvent.click(model2Option);

        // Assertions
        expect(localStorage.setItem).toHaveBeenCalledWith('selectedModelId', 'm2');
        expect(interactionSlice.updateConversationModel).toHaveBeenCalledWith({
            conversationId: 'conv1',
            modelId: 'm2'
        });
        expect(dispatch).toHaveBeenCalledWith(interactionSlice.updateConversationModel({
            conversationId: 'conv1',
            modelId: 'm2'
        }));
    });
});
