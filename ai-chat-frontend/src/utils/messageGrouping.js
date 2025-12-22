// Utility to group messages by time/date for better visual organization

export const groupMessagesByTime = (messages) => {
  if (!messages || messages.length === 0) return [];

  const grouped = [];
  let currentGroup = null;
  const GROUP_TIME_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

  messages.forEach((msg, index) => {
    const msgTime = new Date(msg.createdAt || msg.timestamp || Date.now());
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const prevMsgTime = prevMsg 
      ? new Date(prevMsg.createdAt || prevMsg.timestamp || Date.now())
      : null;

    // Check if we should start a new group
    const shouldStartNewGroup = 
      !prevMsgTime || 
      (msgTime - prevMsgTime) > GROUP_TIME_THRESHOLD ||
      prevMsg.role !== msg.role;

    if (shouldStartNewGroup) {
      // Save previous group if exists
      if (currentGroup) {
        grouped.push(currentGroup);
      }
      // Start new group
      currentGroup = {
        id: `group-${msg._id || index}`,
        timestamp: msgTime,
        role: msg.role,
        messages: [msg],
      };
    } else {
      // Add to current group
      currentGroup.messages.push(msg);
    }
  });

  // Add last group
  if (currentGroup) {
    grouped.push(currentGroup);
  }

  return grouped;
};

export const formatGroupTime = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  // Less than 1 minute ago
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour ago
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }

  // Today
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  // This week
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (date > weekAgo) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }

  // Older
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
};

