const MessageListSkeleton = ({
  groupCount = 3,
  messagesPerGroup = [2, 3, 2],
  showTopLoader = false,
}) => {
  return (
    <div
      className="
        flex-1
        min-h-0
        overflow-y-scroll
        bg-transparent
        pb-28
        no-scrollbar
        md:show-scrollbar
      "
      style={{ overscrollBehavior: "contain" }}
    >
      <div className="mx-auto w-full max-w-4xl px-2 md:px-4 py-6 min-w-0">
        {/* Optional loading older messages indicator */}
        {showTopLoader && (
          <div className="text-center my-3">
            <div className="mx-auto h-4 w-36 rounded-full shimmer" />
          </div>
        )}

        {/* Message Groups */}
        {Array.from({ length: groupCount }).map((_, groupIdx) => (
          <div key={groupIdx} className="mb-6">
            {/* Timestamp separator */}
            {groupIdx !== 0 && (
              <div className="text-center my-4">
                <div className="inline-block h-5 w-24 rounded-full shimmer" />
              </div>
            )}

            {/* Messages */}
            <div className="space-y-2">
              {Array.from({
                length: messagesPerGroup[groupIdx] || 2,
              }).map((_, msgIdx) => {
                const isUser = (groupIdx + msgIdx) % 2 === 0;

                return (
                  <div
                    key={msgIdx}
                    className={`flex w-full min-w-0 ${
                      isUser ? "justify-end" : "justify-start"
                    } px-2 md:px-4`}
                  >
                    <div className="flex flex-col min-w-0 max-w-[90%] sm:max-w-[80%] md:max-w-[70%]">
                      {/* Time */}
                      {msgIdx === (messagesPerGroup[groupIdx] || 2) - 1 && (
                        <div
                          className={`mb-1 ${
                            isUser ? "text-right" : "text-left"
                          }`}
                        >
                          <div className="h-3 w-12 rounded shimmer" />
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={`
                          rounded-lg
                          px-4 py-4
                          min-h-[48px]
                          shimmer
                          ${isUser ? "self-end" : "self-start"}
                        `}
                        style={{
                          width: isUser ? "220px" : "280px",
                          maxWidth: "100%",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MessageListSkeleton;
