/**
 * Convert a MongoDB ObjectId hex string to a valid UUID v5-style string.
 * Qdrant requires point IDs to be UUIDs or unsigned integers.
 */
function objectIdToUuid(objectIdStr) {
    if (!objectIdStr) return null;
    const str = typeof objectIdStr === 'string' ? objectIdStr : objectIdStr.toString();
    // Pad the 24-char hex ObjectId to 32 chars, then format as UUID
    const hex = str.padEnd(32, "0");
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
    ].join("-");
}

module.exports = { objectIdToUuid };
