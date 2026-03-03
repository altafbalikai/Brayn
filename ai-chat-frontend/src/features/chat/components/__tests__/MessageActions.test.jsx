import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDispatch, useSelector } from 'react-redux';
import { MessageActions } from '../MessageActions';
import * as interactionSlice from '../../../messages/messageInteractionsSlice';

// Mock Redux hooks
vi.mock('react-redux', () => ({
    useDispatch: vi.fn(),
    useSelector: vi.fn()
}));

// Mock the slice and service
vi.mock('../../../messages/messageInteractionsSlice', async () => {
    const actual = await vi.importActual('../../../messages/messageInteractionsSlice');
    return {
        ...actual,
        submitFeedback: vi.fn(),
        retryMessage: vi.fn(),
        markMessageCopied: vi.fn(),
        selectUserFeedback: vi.fn(),
        selectFeedbackSubmitting: vi.fn(),
        selectIsRetrying: vi.fn()
    };
});

describe('MessageActions Component', () => {
    const dispatch = vi.fn();
    const mockProps = {
        messageId: 'msg123',
        conversationId: 'conv456',
        content: 'Hello world',
        isAssistant: true,
        isLoading: false
    };

    beforeEach(() => {
        vi.clearAllMocks();
        useDispatch.mockReturnValue(dispatch);
        
        // Mock useSelector to execute the selector function with a dummy state
        useSelector.mockImplementation((selectorFn) => selectorFn({}));
        
        // Default selector returns
        vi.mocked(interactionSlice.selectUserFeedback).mockReturnValue(null);
        vi.mocked(interactionSlice.selectFeedbackSubmitting).mockReturnValue(false);
        vi.mocked(interactionSlice.selectIsRetrying).mockReturnValue(false);

        // Mock clipboard
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockImplementation(() => Promise.resolve()),
            },
        });

        // Mock window.confirm
        vi.stubGlobal('confirm', vi.fn(() => true));
    });

    it('renders nothing if not an assistant message', () => {
        render(<MessageActions {...mockProps} isAssistant={false} />);
        expect(screen.queryByTitle(/Copy/i)).toBeNull();
    });

    it('renders actions for assistant messages', () => {
        render(<MessageActions {...mockProps} />);
        expect(screen.getByTitle(/Copy to clipboard/i)).toBeInTheDocument();
        expect(screen.getByTitle(/^Helpful$/i)).toBeInTheDocument();
        expect(screen.getByTitle(/^Not helpful$/i)).toBeInTheDocument();
        expect(screen.getByTitle(/Regenerate response/i)).toBeInTheDocument();
    });

    it('handles copy click', async () => {
        render(<MessageActions {...mockProps} />);
        const copyBtn = screen.getByTitle(/Copy to clipboard/i);
        
        await fireEvent.click(copyBtn);
        
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello world');
        expect(dispatch).toHaveBeenCalled(); // markMessageCopied
    });

    it('dispatches submitFeedback on like click', () => {
        render(<MessageActions {...mockProps} />);
        const likeBtn = screen.getByTitle(/^Helpful$/i);
        
        fireEvent.click(likeBtn);
        
        expect(dispatch).toHaveBeenCalled();
        expect(interactionSlice.submitFeedback).toHaveBeenCalledWith({
            messageId: 'msg123',
            feedbackType: 'positive',
            conversationId: 'conv456'
        });
    });

    it('dispatches retryMessage on retry click', () => {
        render(<MessageActions {...mockProps} />);
        const retryBtn = screen.getByTitle(/Regenerate response/i);
        
        fireEvent.click(retryBtn);
        
        expect(dispatch).toHaveBeenCalled();
        expect(interactionSlice.retryMessage).toHaveBeenCalledWith({
            messageId: 'msg123',
            conversationId: 'conv456'
        });
    });

    it('shows loading state when retrying', () => {
        vi.mocked(interactionSlice.selectIsRetrying).mockReturnValue(true);

        render(<MessageActions {...mockProps} />);
        expect(screen.getByText(/Regenerating.../i)).toBeInTheDocument();
        expect(screen.getByTitle(/Regenerate response/i)).toBeDisabled();
    });
});
