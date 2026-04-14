import { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { logout } from '../../auth/authSlice';
import {
    createConversation,
    sendMessage,
    setCurrentConversation,
    renameConversationTitle,
    deleteConversation,
    clearMessages,
    clearCurrentConversation
} from '../../conversations/conversationSlice';
import { selectCurrentPersonaId } from '../../persona/personaSlice';

export const useChatActions = (currentConversation, selectedModelId) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { conversationId } = useParams();
    const titleUpdatedRef = useRef(false);

    // Selectors for loading states
    const sending = useSelector((state) => state.conversation.sending);
    const assistantTyping = useSelector(
        (state) =>
            state.conversation.assistantTyping?.[currentConversation?._id] ?? false
    );
    const selectedPersonaId = useSelector(selectCurrentPersonaId);

    const handleSelectConversation = useCallback(
        (conv) => {
            dispatch(setCurrentConversation(conv));
        },
        [dispatch]
    );

    const handleRenameConversation = useCallback(
        (convId, title) => {
            dispatch(renameConversationTitle({ conversationId: convId, title }));
        },
        [dispatch]
    );

    const handleDeleteConversation = useCallback(
        async (convId) => {
            if (convId === conversationId) {
                await dispatch(clearCurrentConversation());
                await dispatch(deleteConversation(convId));
                navigate("/chat");
            } else {
                await dispatch(deleteConversation(convId));
            }
        },
        [dispatch, conversationId, navigate]
    );

    const handleNewChat = useCallback(() => {
        dispatch(
            setCurrentConversation({
                _id: null,
                isDraft: true,
                agentId: "default",
                title: "New Chat",
                messages: [],
            })
        );
        titleUpdatedRef.current = false;
    }, [dispatch]);

    const handleLogout = useCallback(async () => {
        await dispatch(logout());
        // State reset is handled by conversationSlice extraReducer listening to logout.fulfilled
        navigate("/login", { replace: true });
    }, [dispatch, navigate]);

    const handleSendMessage = useCallback(
        async (message) => {
            if (!message?.trim() || !currentConversation) return;
            const convo_title = message.trim();
            let conversationId = currentConversation._id;

            if (currentConversation.isDraft) {
                const MAX_TITLE_LENGTH = 40;
                let title =
                    convo_title.length > MAX_TITLE_LENGTH
                        ? convo_title.slice(0, MAX_TITLE_LENGTH).trim() + "…"
                        : convo_title;

                const createResult = await dispatch(
                    createConversation({
                        agentId: currentConversation.agentId,
                        title,
                        modelId: selectedModelId,
                        personaId: selectedPersonaId, // Optional: backend will use default if missing
                    })
                );

                if (!createConversation.fulfilled.match(createResult)) {
                    return;
                }

                const realConversation = createResult.payload;
                // dispatch(setCurrentConversation(realConversation)); // Removed: URL drives state
                conversationId = realConversation._id;

                // Navigate to the new conversation URL
                navigate(`/chat/${conversationId}`);
            }

            const tempAssistantId = `temp-assistant-${Date.now()}`;

            await dispatch(
                sendMessage({
                    message: convo_title,
                    conversationId,
                    tempAssistantId,
                })
            );
        },
        [dispatch, currentConversation, selectedModelId, navigate, selectedPersonaId]
    );

    const handlePromptClick = useCallback(
        async (prompt) => {
            if (!prompt?.trim()) return;

            const convo_title = prompt.trim();
            const MAX_TITLE_LENGTH = 40;

            const title =
                convo_title.length > MAX_TITLE_LENGTH
                    ? convo_title.slice(0, MAX_TITLE_LENGTH).trim() + "…"
                    : convo_title;

            const createResult = await dispatch(
                createConversation({
                    agentId: "default",
                    title,
                    modelId: selectedModelId,
                })
            );

            if (!createConversation.fulfilled.match(createResult)) {
                return;
            }

            const realConversation = createResult.payload;

            // dispatch(setCurrentConversation(realConversation)); // Removed
            titleUpdatedRef.current = true;

            // Navigate to new URL
            navigate(`/chat/${realConversation._id}`);

            const tempAssistantId = `temp-assistant-${Date.now()}`;

            await dispatch(
                sendMessage({
                    message: convo_title,
                    conversationId: realConversation._id,
                    tempAssistantId,
                })
            );
        },
        [dispatch, selectedModelId, navigate]
    );

    return {
        sending,
        assistantTyping,
        handleSelectConversation,
        handleRenameConversation,
        handleDeleteConversation,
        handleNewChat,
        handleLogout,
        handleSendMessage,
        handlePromptClick,
        titleUpdatedRef,
    };
};
