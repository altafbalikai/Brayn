import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MessageItem from '../MessageItem';
import api from '../../../../api/axios';
import conversationReducer, { 
    cancelEditing, 
    switchToBranch
} from '../../../conversations/conversationSlice';
import personaReducer from '../../../persona/personaSlice';

// Mocks for functional components that are heavy/unnecessary for strict branch test
vi.mock('react-markdown', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('remark-gfm', () => ({ default: () => {} }));
vi.mock('rehype-highlight', () => ({ default: () => {} }));
vi.mock('remark-breaks', () => ({ default: () => {} }));
vi.mock('../MessageActions', () => ({ MessageActions: () => <div data-testid="message-actions" /> }));
vi.mock('../MessageVersions', () => ({ MessageVersions: () => <div data-testid="message-versions" /> }));
vi.mock('../../../../api/axios', () => ({
    default: {
        get: vi.fn()
    }
}));

const mockDispatch = vi.fn();
const mockNavigate = vi.fn();
vi.mock('react-redux', async () => {
    const originalModule = await vi.importActual('react-redux');
    return {
        ...originalModule,
        useDispatch: () => mockDispatch
    };
});
vi.mock('react-router-dom', async () => {
    const originalModule = await vi.importActual('react-router-dom');
    return {
        ...originalModule,
        useNavigate: () => mockNavigate
    };
});

const MSG_ID_1 = '507f1f77bcf86cd799439011';
const MSG_ID_2 = '507f1f77bcf86cd799439012';

// Setup mock state factory
const setupStore = (preloadedState) => {
    return configureStore({
        reducer: {
            conversation: conversationReducer,
            persona: personaReducer,
        },
        preloadedState: {
            conversation: {
                currentConversation: null,
                conversations: [],
                sending: false,
                editingMessageId: null,
                branchMap: {},
                ...preloadedState.conversation,
                // merging preloaded root if directly passed properties instead of nested
                ...preloadedState
            },
            persona: { defaultPersonas: [], customPersonas: [] }
        }
    });
};

const renderWithProviders = (ui, { preloadedState = {} } = {}) => {
    const store = setupStore(preloadedState);
    return render(<Provider store={store}>{ui}</Provider>);
};

const hoverMessageRow = (text = 'Hello') => {
    const row = screen.getByText(text).closest('.group');
    if (row) {
        fireEvent.mouseEnter(row);
    }
    return row;
};

const expectVersionLabel = (label) => {
    const matches = screen.getAllByText((_, element) =>
        element?.textContent?.replace(/\s+/g, ' ').trim() === label
    );
    const target = matches.find(
        (el) => el.tagName === 'SPAN' && el.className.includes('text-[12px]')
    );
    expect(target).toBeInTheDocument();
};

describe('MessageItem — edit mode', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigate.mockReset();
        mockDispatch.mockImplementation((action) => {
            if (typeof action === 'function') {
                return {
                    unwrap: () => Promise.resolve({ items: [] })
                };
            }
            return action;
        });
    });

    it('shows pencil icon on hover for user messages', async () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Hello' };
        renderWithProviders(<MessageItem msg={msg} conversationId="c1" editingMessageId={null} branchMap={{}} currentConversationId="c1" />);

        hoverMessageRow('Hello');
        const pencilBtn = screen.getByTitle('Edit message');
        expect(pencilBtn).toBeInTheDocument();
    });

    it('does NOT show pencil icon on assistant messages', () => {
        const msg = { _id: MSG_ID_1, role: 'assistant', text: 'Reply' };
        renderWithProviders(<MessageItem msg={msg} conversationId="c1" editingMessageId={null} branchMap={{}} currentConversationId="c1" />);
        expect(screen.queryByTitle('Edit message')).not.toBeInTheDocument();
    });

    it('renders textarea pre-filled with message text when editingMessageId matches', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Edit this' };
        renderWithProviders(<MessageItem msg={msg} conversationId="c1" editingMessageId={MSG_ID_1} branchMap={{}} currentConversationId="c1" />, {
            preloadedState: { editingMessageId: MSG_ID_1 }
        });
        
        const textarea = screen.getByRole('textbox');
        expect(textarea).toBeInTheDocument();
        expect(textarea.value).toBe('Edit this');
    });

    it('does not render textarea when editingMessageId is a different message', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Edit this' };
        renderWithProviders(<MessageItem msg={msg} conversationId="c1" editingMessageId={MSG_ID_2} branchMap={{}} currentConversationId="c1" />);
        
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByText('Edit this')).toBeInTheDocument();
    });

    it('dispatches cancelEditing when Cancel button is clicked', async () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'text' };
        renderWithProviders(<MessageItem msg={msg} conversationId="c1" editingMessageId={MSG_ID_1} branchMap={{}} currentConversationId="c1" />);
        
        fireEvent.click(screen.getByText('Cancel'));
        expect(mockDispatch).toHaveBeenCalledWith(cancelEditing());
    });

    it('dispatches editMessage thunk when Update is clicked', async () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'text', conversationId: 'c1' };
        renderWithProviders(<MessageItem msg={msg} conversationId="c1" editingMessageId={MSG_ID_1} branchMap={{}} currentConversationId="c1" />);
        
        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'New text' } });
        
        fireEvent.click(screen.getByText('Update'));
        
        expect(mockDispatch).toHaveBeenCalled();
    });

    it('Update and Cancel buttons are disabled when sending is true', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'text' };
        renderWithProviders(
            <MessageItem msg={msg} conversationId="c1" editingMessageId={MSG_ID_1} branchMap={{}} currentConversationId="c1" />, 
            { preloadedState: { sending: true } }
        );
        
        expect(screen.getByText('Cancel')).toBeDisabled();
        expect(screen.getByText('Update')).toBeDisabled();
    });

});

describe('MessageItem — branch navigator', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigate.mockReset();
        mockDispatch.mockImplementation((action) => {
            if (typeof action === 'function') {
                return {
                    unwrap: () => Promise.resolve({ items: [] })
                };
            }
            return action;
        });
    });

    it('does not render navigator when branchMap has no entry for this message', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Hello', conversationId: 'c1' };
        renderWithProviders(<MessageItem msg={msg} conversationId="c1" editingMessageId={null} branchMap={{}} currentConversationId="c1" />);
        
        // Assert absence of "1 / X" text
        expect(screen.queryByText(/1 \//)).not.toBeInTheDocument();
    });

    it('renders navigator when branchMap has branches for this message', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Hello', conversationId: 'c1' };
        const branchMap = {
            'c1': [{ branchConvId: 'c2', editedMessageId: MSG_ID_1, branchedFromMessageId: MSG_ID_1 }]
        };

        renderWithProviders(
            <MessageItem msg={msg} conversationId="c1" editingMessageId={null} branchMap={branchMap} currentConversationId="c1" />, 
            {
                preloadedState: { 
                    currentConversation: { _id: 'c1', parentConversationId: null },
                    branchMap 
                }
            }
        );

        hoverMessageRow('Hello');
        expectVersionLabel('1 / 2');
    });

    it('shows correct current index when on root conversation', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Hello', conversationId: 'root' };
        const branchMap = {
            'root': [
                { branchConvId: 'b1', editedMessageId: MSG_ID_1, branchedFromMessageId: MSG_ID_1 },
                { branchConvId: 'b2', editedMessageId: MSG_ID_1, branchedFromMessageId: MSG_ID_1 }
            ]
        };

        renderWithProviders(
            <MessageItem msg={msg} conversationId="root" editingMessageId={null} branchMap={branchMap} currentConversationId="root" />, 
            {
                preloadedState: { 
                    currentConversation: { _id: 'root' },
                    branchMap 
                }
            }
        );

        hoverMessageRow('Hello');
        expectVersionLabel('1 / 3');
    });

    it('shows correct current index when on branch conversation', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Hello', conversationId: 'root' };
        const branchMap = {
            'root': [
                { branchConvId: 'b1', editedMessageId: MSG_ID_1, branchedFromMessageId: MSG_ID_1 },
                { branchConvId: 'b2', editedMessageId: MSG_ID_1, branchedFromMessageId: MSG_ID_1 }
            ]
        };

        renderWithProviders(
            <MessageItem msg={msg} conversationId="root" editingMessageId={null} branchMap={branchMap} currentConversationId="b2" />, 
            {
                preloadedState: { 
                    currentConversation: { _id: 'b2', parentConversationId: 'root' },
                    branchMap 
                }
            }
        );

        hoverMessageRow('Hello');
        expectVersionLabel('3 / 3');
    });

    it('dispatches switchToBranch after fetching target branch on arrow click', async () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Hello', conversationId: 'root' };
        const branchMap = {
            'root': [
                { branchConvId: 'b1', editedMessageId: MSG_ID_1, branchedFromMessageId: MSG_ID_1 }
            ]
        };
        api.get.mockResolvedValue({
            data: { _id: 'b1', title: 'Branch 1', parentConversationId: 'root' }
        });

        renderWithProviders(
            <MessageItem msg={msg} conversationId="root" editingMessageId={null} branchMap={branchMap} currentConversationId="root" />, 
            {
                preloadedState: { 
                    currentConversation: { _id: 'root' },
                    branchMap 
                }
            }
        );

        hoverMessageRow('Hello');
        // Find Right Arrow (the button without disabled if we are at 1/2)
        const buttons = screen.getAllByRole('button');
        // The last button is the right arrow
        const rightArrow = buttons[buttons.length - 1];
        fireEvent.click(rightArrow);

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/conversations/b1');
            expect(mockDispatch).toHaveBeenCalledWith(
                switchToBranch({
                    conversation: { _id: 'b1', title: 'Branch 1', parentConversationId: 'root' },
                    messages: []
                })
            );
            expect(mockNavigate).toHaveBeenCalledWith('/chat/b1');
        });
    });

    it('left arrow is visually disabled at index 0 (first entry)', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Hello', conversationId: 'root' };
        const branchMap = { 'root': [{ branchConvId: 'b1', editedMessageId: MSG_ID_1, branchedFromMessageId: MSG_ID_1 }] };

        renderWithProviders(
            <MessageItem msg={msg} conversationId="root" editingMessageId={null} branchMap={branchMap} currentConversationId="root" />
        );

        hoverMessageRow('Hello');
        const buttons = screen.getAllByRole('button');
        const leftArrow = buttons[buttons.length - 2]; 
        expect(leftArrow).toBeDisabled();
    });

    it('right arrow is visually disabled at last index', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Hello', conversationId: 'root' };
        const branchMap = { 'root': [{ branchConvId: 'b1', editedMessageId: MSG_ID_1, branchedFromMessageId: MSG_ID_1 }] };

        renderWithProviders(
            <MessageItem msg={msg} conversationId="root" editingMessageId={null} branchMap={branchMap} currentConversationId="b1" />,
            { preloadedState: { currentConversation: { _id: 'b1', parentConversationId: 'root' } } }
        );

        hoverMessageRow('Hello');
        const buttons = screen.getAllByRole('button');
        const rightArrow = buttons[buttons.length - 1]; 
        expect(rightArrow).toBeDisabled();
    });

    it('rootId resolves to parentConversationId when viewing a branch', () => {
        const msg = { _id: MSG_ID_1, role: 'user', text: 'Hello', conversationId: 'root' };
        const branchMap = { 'root': [{ branchConvId: 'b1', editedMessageId: MSG_ID_1, branchedFromMessageId: MSG_ID_1 }] };

        // Test relies on mapping to root even with currentConversationId='b1'
        renderWithProviders(
            <MessageItem msg={msg} conversationId="root" editingMessageId={null} branchMap={branchMap} currentConversationId="b1" />,
            { preloadedState: { currentConversation: { _id: 'b1', parentConversationId: 'root' } } }
        );

        hoverMessageRow('Hello');
        // Expect navigator to successfully render since it resolves via 'root'
        expectVersionLabel('2 / 2');
    });

});
