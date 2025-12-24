import React, { useRef, useEffect, useState, useCallback } from "react";
import MessageItem from "./MessageItem";
import MessageGroup from "./MessageGroup";
import MessageListSkeleton from "./../PageSkeletonLoaders/MessageListSkeleton";

/**
 * Virtualized message list with fallback to regular rendering for small lists.
 * @param {{messages: Array, messagesEndRef: any, containerRef: any, onScroll: function, groupedMessages: Array, isLoadingMore: boolean}} props
 */
function VirtualizedMessageList({
  messages,
  messagesEndRef,
  containerRef,
  onScroll,
  groupedMessages,
  isLoadingMore,
  isLoading,
}) {
  const listRef = useRef(null);
  const sizeMap = useRef({});
  const [containerHeight, setContainerHeight] = useState(600);
  const [VariableSizeList, setVariableSizeList] = useState(null);
  const [loadingVirtual, setLoadingVirtual] = useState(false);

  useEffect(() => {
    if (messages.length >= 50 && !VariableSizeList && !loadingVirtual) {
      setLoadingVirtual(true);
      import("react-window")
        .then((module) => {
          setVariableSizeList(() => module.VariableSizeList);
          setLoadingVirtual(false);
        })
        .catch((err) => {
          console.warn("Failed to load react-window:", err);
          setLoadingVirtual(false);
        });
    }
  }, [messages.length, VariableSizeList, loadingVirtual]);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef?.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef?.current) resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [containerRef]);

  const getItemSize = useCallback(
    (index) => {
      const msg = messages[index];
      if (sizeMap.current[index]) return sizeMap.current[index];
      const estimatedLines = Math.ceil((msg.text?.length || 0) / 50);
      const estimatedHeight = Math.min(
        Math.max(estimatedLines * 20 + 40, 60),
        300
      );
      sizeMap.current[index] = estimatedHeight;
      return estimatedHeight;
    },
    [messages]
  );

  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      setTimeout(
        () => listRef.current?.scrollToItem(messages.length - 1, "end"),
        0
      );
    }
  }, [messages.length]);

  useEffect(() => {
    if (messages.length < 10) sizeMap.current = {};
  }, [messages.length]);

  // 🔹 Initial load skeleton
  if (isLoading && !messages.length) {
    return <MessageListSkeleton />;
  }

  /* ------------------------------------------------------------------ */
  /* NON-VIRTUALIZED                                   */
  /* ------------------------------------------------------------------ */
  if (messages.length < 50 || !VariableSizeList) {
    return (
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-scroll bg-theme-light pb-28 no-scrollbar md:show-scrollbar"
        onScroll={onScroll}
        style={{ overscrollBehavior: "contain" }}
      >
        {/* Centered content column */}
        <div className="mx-auto w-full max-w-4xl px-4 py-6 min-w-0">
          {isLoadingMore && (
            <MessageListSkeleton showTopLoader groupCount={1} />
          )}

          {groupedMessages?.length
            ? groupedMessages.map((group, idx) => (
                <MessageGroup
                  key={group.id}
                  group={group}
                  isFirst={idx === 0}
                />
              ))
            : messages.map((msg) => (
                <MessageItem
                  key={
                    msg._id ||
                    msg.id ||
                    `${msg.role}-${msg.createdAt || Date.now()}`
                  }
                  msg={msg}
                  showTime={false}
                />
              ))}

          <div ref={messagesEndRef} />
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* VIRTUALIZED                                      */
  /* ------------------------------------------------------------------ */
  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-scroll bg-theme-light pb-28 no-scrollbar md:show-scrollbar"
      style={{ overscrollBehavior: "contain" }}
    >
      <VariableSizeList
        ref={listRef}
        height={containerHeight}
        itemCount={messages.length}
        itemSize={getItemSize}
        width="100%"
        style={{ overflowX: "hidden" }}
      >
        {({ index, style }) => {
          const msg = messages[index];
          const isLast = index === messages.length - 1;

          return (
            <div style={style} className="flex justify-center">
              <div className="w-full max-w-3xl px-4 min-w-0">
                <MessageItem msg={msg} />
                {isLast && <div ref={messagesEndRef} />}
              </div>
            </div>
          );
        }}
      </VariableSizeList>
    </div>
  );
}

export default React.memo(VirtualizedMessageList);
