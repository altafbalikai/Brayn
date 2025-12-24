const MessageListSkeleton = ({
  groupCount = 3,
  messagesPerGroup = [2, 3, 2],
  showTopLoader = false,
}) => {
  return (
    <div
      className="flex-1 min-h-0 overflow-y-scroll bg-theme-light pb-28 no-scrollbar md:show-scrollbar"
      style={{ overscrollBehavior: "contain" }}
    >
      <div className="mx-auto w-full max-w-4xl px-2 md:px-4 py-6 min-w-0 animate-pulse">
        {/* Optional loading older messages indicator */}
        {showTopLoader && (
          <div className="text-center my-3">
            <div className="mx-auto h-4 w-36 rounded-full bg-theme-secondary/20" />
          </div>
        )}

        {/* Message Groups */}
        {Array.from({ length: groupCount }).map((_, groupIdx) => (
          <div key={groupIdx} className="mb-4">
            {/* Timestamp separator (skip first like real UI) */}
            {groupIdx !== 0 && (
              <div className="text-center my-3">
                <div className="inline-block h-5 w-24 rounded-full bg-theme-secondary/20" />
              </div>
            )}

            {/* Messages inside group */}
            <div className="space-y-1">
              {Array.from({
                length: messagesPerGroup[groupIdx] || 2,
              }).map((_, msgIdx) => {
                const isUser = (groupIdx + msgIdx) % 2 === 0;

                return (
                  <div
                    key={msgIdx}
                    className={`flex w-full min-w-0 ${
                      isUser ? "justify-end" : "justify-start"
                    } px-2 md:px-4 mb-1`}
                  >
                    <div className="flex flex-col min-w-0 max-w-[90%] sm:max-w-[80%] md:max-w-[70%]">
                      {/* Time (only for last message in group) */}
                      {msgIdx === (messagesPerGroup[groupIdx] || 2) - 1 && (
                        <div
                          className={`mb-1 ${
                            isUser ? "text-right" : "text-left"
                          }`}
                        >
                          <div className="h-3 w-12 bg-theme-secondary/20 rounded" />
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={`
                          rounded-lg
                          px-4 py-4
                          min-h-[48px]
                          bg-theme-secondary/30
                          ${
                            isUser
                              ? "self-end"
                              : "self-start bg-theme-accent/30"
                          }
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
