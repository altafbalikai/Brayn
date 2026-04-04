import React from "react";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { Provider, useSelector } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import conversationReducer, {
  fetchMessages,
} from "./src/features/conversations/conversationSlice";
import personaReducer from "./src/features/persona/personaSlice";
import MessageItem from "./src/features/chat/components/MessageItem";
import { conversationService } from "./src/api/services/conversationService";

vi.mock("react-markdown", () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));
vi.mock("rehype-highlight", () => ({ default: () => {} }));
vi.mock("remark-breaks", () => ({ default: () => {} }));
vi.mock("./src/features/chat/components/MessageActions", () => ({
  MessageActions: () => <div data-testid="message-actions" />,
}));
vi.mock("./src/api/services/conversationService", () => ({
  conversationService: {
    activateNode: vi.fn(),
  },
}));

const convId = "69cdbeef0000000000000001";
const helloId = "69cdbeef0000000000000011";
const helloAstId = "69cdbeef0000000000000012";
const hiGirlId = "69cdbeef0000000000000013";
const hiGirlAstId = "69cdbeef0000000000000014";
const hiBoyId = "69cdbeef0000000000000015";
const hiBoyAstId = "69cdbeef0000000000000016";
const hiManId = "69cdbeef0000000000000017";
const hiManAstId = "69cdbeef0000000000000018";

const rootSiblingIds = [helloId, hiGirlId, hiBoyId, hiManId];

function makeUserMessage(id, text, createdAt, activeChildId) {
  return {
    _id: id,
    id,
    role: "user",
    text,
    conversationId: convId,
    parentMessageId: null,
    activeChildId,
    createdAt,
    status: "sent",
  };
}

function makeAssistantMessage(id, text, createdAt, parentMessageId) {
  return {
    _id: id,
    id,
    role: "assistant",
    text,
    conversationId: convId,
    parentMessageId,
    activeChildId: null,
    createdAt,
    status: "sent",
  };
}

function makeFetchPayload(userId, userText, userPosition, assistantId, assistantText) {
  return {
    conversationId: convId,
    items: [
      makeUserMessage(userId, userText, "2026-04-02T00:00:00.000Z", assistantId),
      makeAssistantMessage(
        assistantId,
        assistantText,
        "2026-04-02T00:00:01.000Z",
        userId,
      ),
    ],
    page: 1,
    append: false,
    hasMore: false,
    siblingCounts: {
      [userId]: {
        total: 4,
        position: userPosition,
        siblingIds: rootSiblingIds,
      },
      [assistantId]: {
        total: 1,
        position: 0,
        siblingIds: [assistantId],
      },
    },
  };
}

const activateResponses = [
  {
    activatedNodeId: hiBoyId,
    updatedPath: [
      makeUserMessage(hiBoyId, "Hi Boy", "2026-04-02T00:00:02.000Z", hiBoyAstId),
      makeAssistantMessage(
        hiBoyAstId,
        "Assistant for Hi Boy",
        "2026-04-02T00:00:03.000Z",
        hiBoyId,
      ),
    ],
    siblingCounts: {
      [hiBoyId]: {
        total: 4,
        position: 2,
        siblingIds: rootSiblingIds,
      },
      [hiBoyAstId]: {
        total: 1,
        position: 0,
        siblingIds: [hiBoyAstId],
      },
    },
  },
  {
    activatedNodeId: hiGirlId,
    updatedPath: [
      makeUserMessage(hiGirlId, "Hi Girl", "2026-04-02T00:00:04.000Z", hiGirlAstId),
      makeAssistantMessage(
        hiGirlAstId,
        "Assistant for Hi Girl",
        "2026-04-02T00:00:05.000Z",
        hiGirlId,
      ),
    ],
    siblingCounts: {
      [hiGirlId]: {
        total: 4,
        position: 1,
        siblingIds: rootSiblingIds,
      },
      [hiGirlAstId]: {
        total: 1,
        position: 0,
        siblingIds: [hiGirlAstId],
      },
    },
  },
  {
    activatedNodeId: helloId,
    updatedPath: [
      makeUserMessage(helloId, "Hello", "2026-04-02T00:00:06.000Z", helloAstId),
      makeAssistantMessage(
        helloAstId,
        "Assistant for Hello",
        "2026-04-02T00:00:07.000Z",
        helloId,
      ),
    ],
    siblingCounts: {
      [helloId]: {
        total: 4,
        position: 0,
        siblingIds: rootSiblingIds,
      },
      [helloAstId]: {
        total: 1,
        position: 0,
        siblingIds: [helloAstId],
      },
    },
  },
  {
    activatedNodeId: hiGirlId,
    updatedPath: [
      makeUserMessage(hiGirlId, "Hi Girl", "2026-04-02T00:00:08.000Z", hiGirlAstId),
      makeAssistantMessage(
        hiGirlAstId,
        "Assistant for Hi Girl",
        "2026-04-02T00:00:09.000Z",
        hiGirlId,
      ),
    ],
    siblingCounts: {
      [hiGirlId]: {
        total: 4,
        position: 1,
        siblingIds: rootSiblingIds,
      },
      [hiGirlAstId]: {
        total: 1,
        position: 0,
        siblingIds: [hiGirlAstId],
      },
    },
  },
  {
    activatedNodeId: hiBoyId,
    updatedPath: [
      makeUserMessage(hiBoyId, "Hi Boy", "2026-04-02T00:00:10.000Z", hiBoyAstId),
      makeAssistantMessage(
        hiBoyAstId,
        "Assistant for Hi Boy",
        "2026-04-02T00:00:11.000Z",
        hiBoyId,
      ),
    ],
    siblingCounts: {
      [hiBoyId]: {
        total: 4,
        position: 2,
        siblingIds: rootSiblingIds,
      },
      [hiBoyAstId]: {
        total: 1,
        position: 0,
        siblingIds: [hiBoyAstId],
      },
    },
  },
  {
    activatedNodeId: hiManId,
    updatedPath: [
      makeUserMessage(hiManId, "Hi Man", "2026-04-02T00:00:12.000Z", hiManAstId),
      makeAssistantMessage(
        hiManAstId,
        "Assistant for Hi Man",
        "2026-04-02T00:00:13.000Z",
        hiManId,
      ),
    ],
    siblingCounts: {
      [hiManId]: {
        total: 4,
        position: 3,
        siblingIds: rootSiblingIds,
      },
      [hiManAstId]: {
        total: 1,
        position: 0,
        siblingIds: [hiManAstId],
      },
    },
  },
];

function setupStore() {
  return configureStore({
    reducer: {
      conversation: conversationReducer,
      persona: personaReducer,
    },
  });
}

function CurrentRootMessage() {
  const msg = useSelector((state) => state.conversation.messages[convId]?.[0]);
  const siblingCounts = useSelector((state) => state.conversation.siblingCounts);

  if (!msg) return null;

  return (
    <MessageItem
      msg={msg}
      conversationId={convId}
      editingMessageId={null}
      siblingCounts={siblingCounts}
      currentConversationId={convId}
    />
  );
}

function expectVersionLabel(label) {
  const matches = screen.getAllByText(
    (_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === label,
  );
  const target = matches.find(
    (element) =>
      element?.tagName === "SPAN" &&
      element?.className.includes("text-[12px]"),
  );
  expect(target).toBeInTheDocument();
}

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe("Prompt 3 full sequence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", `/chat/${convId}`);
    activateResponses.forEach((response) => {
      conversationService.activateNode.mockResolvedValueOnce(response);
    });
  });

  it("navigates 4/4 down to 1/4 and back without changing the URL, then refreshes to 2/4", async () => {
    const store = setupStore();

    store.dispatch(
      fetchMessages.fulfilled(
        makeFetchPayload(
          hiManId,
          "Hi Man",
          3,
          hiManAstId,
          "Assistant for Hi Man",
        ),
        "req-initial",
        { conversationId: convId, page: 1, append: false },
      ),
    );

    render(
      <Provider store={store}>
        <CurrentRootMessage />
      </Provider>,
    );

    expect(screen.getByText("Hi Man")).toBeInTheDocument();
    expectVersionLabel("4 / 4");
    expect(window.location.pathname).toBe(`/chat/${convId}`);

    fireEvent.click(screen.getByTitle("Previous version"));
    await waitFor(() => {
      expect(screen.getByText("Hi Boy")).toBeInTheDocument();
      expectVersionLabel("3 / 4");
      expect(window.location.pathname).toBe(`/chat/${convId}`);
    });

    fireEvent.click(screen.getByTitle("Previous version"));
    await waitFor(() => {
      expect(screen.getByText("Hi Girl")).toBeInTheDocument();
      expectVersionLabel("2 / 4");
      expect(window.location.pathname).toBe(`/chat/${convId}`);
    });

    fireEvent.click(screen.getByTitle("Previous version"));
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
      expectVersionLabel("1 / 4");
      expect(window.location.pathname).toBe(`/chat/${convId}`);
    });

    fireEvent.click(screen.getByTitle("Next version"));
    await waitFor(() => {
      expect(screen.getByText("Hi Girl")).toBeInTheDocument();
      expectVersionLabel("2 / 4");
      expect(window.location.pathname).toBe(`/chat/${convId}`);
    });

    fireEvent.click(screen.getByTitle("Next version"));
    await waitFor(() => {
      expect(screen.getByText("Hi Boy")).toBeInTheDocument();
      expectVersionLabel("3 / 4");
      expect(window.location.pathname).toBe(`/chat/${convId}`);
    });

    fireEvent.click(screen.getByTitle("Next version"));
    await waitFor(() => {
      expect(screen.getByText("Hi Man")).toBeInTheDocument();
      expectVersionLabel("4 / 4");
      expect(window.location.pathname).toBe(`/chat/${convId}`);
    });

    store.dispatch(
      fetchMessages.fulfilled(
        makeFetchPayload(
          hiGirlId,
          "Hi Girl",
          1,
          hiGirlAstId,
          "Assistant for Hi Girl",
        ),
        "req-refresh",
        { conversationId: convId, page: 1, append: false },
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("Hi Girl")).toBeInTheDocument();
      expectVersionLabel("2 / 4");
    });

    expect(conversationService.activateNode).toHaveBeenCalledTimes(6);
  });
});
