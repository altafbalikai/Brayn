// services/memoryRead.service.js
const { generateEmbedding } = require("./embeddings.service");
const { QDRANT_URL, QDRANT_COLLECTION } = require("../config/qdrant");
const { fetchWithDns } = require("../utils/fetchWithDns");

async function readRelevantMemory({
    userId,
    conversationId,
    query,
    limit = 5
}) {
    try {
        // Guard: skip if Qdrant is not configured
        if (!QDRANT_URL) return [];

        // Guard: need a real query to search
        if (!query || typeof query !== "string" || query.trim().length < 5) return [];

        // Guard: must have userId for filtering
        if (!userId) {
            console.warn("[VectorRead] No userId provided, skipping search");
            return [];
        }

        const vector = await generateEmbedding(query.trim());

        if (!Array.isArray(vector) || vector.length === 0) {
            console.warn("[VectorRead] Failed to embed query, skipping search");
            return [];
        }

        const body = {
            vector,
            limit,
            with_payload: true,
            filter: {
                must: [
                    { key: "userId", match: { value: userId.toString() } },
                    { key: "conversationId", match: { value: conversationId.toString() } }
                ]
            }
        };

        const response = await fetchWithDns(
            `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": process.env.QDRANT_API_KEY
                },
                body: JSON.stringify(body)
            }
        );

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`[VectorRead] Qdrant search failed (${response.status}):`, errBody);
            return [];
        }

        const data = await response.json();
        const results = data.result || [];

        console.log(`[VectorRead] Found ${results.length} relevant memory items`);
        return results;
    } catch (err) {
        console.warn("[VectorRead] Failed:", err.message);
        return [];
    }
}

module.exports = { readRelevantMemory };
