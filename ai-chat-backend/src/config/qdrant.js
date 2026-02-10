// config/qdrant.js

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_COLLECTION = "message_vectors";
const { fetchWithDns } = require("../utils/fetchWithDns");

// MUST match embedding dimension: all-MiniLM-L6-v2 = 384
const VECTOR_SIZE = 384;

async function ensureQdrantCollection() {
    try {
        if (!QDRANT_URL) {
            console.warn("[Qdrant] QDRANT_URL is not defined — skipping collection setup");
            return;
        }

        console.log("[Qdrant] Ensuring collection:", QDRANT_COLLECTION);

        // First, check if collection already exists
        const checkRes = await fetchWithDns(
            `${QDRANT_URL}/collections/${QDRANT_COLLECTION}`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    ...(QDRANT_API_KEY ? { "api-key": QDRANT_API_KEY } : {})
                }
            }
        );

        if (checkRes.ok) {
            const info = await checkRes.json();
            const existingSize = info?.result?.config?.params?.vectors?.size;
            if (existingSize && existingSize !== VECTOR_SIZE) {
                console.warn(
                    `[Qdrant] Collection exists with size ${existingSize}, expected ${VECTOR_SIZE}. ` +
                    `Delete the collection and restart to fix.`
                );
            } else {
                console.log("[Qdrant] Collection already exists with correct config");
            }
            return;
        }

        // Collection does not exist — create it
        const response = await fetchWithDns(
            `${QDRANT_URL}/collections/${QDRANT_COLLECTION}`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...(QDRANT_API_KEY ? { "api-key": QDRANT_API_KEY } : {})
                },
                body: JSON.stringify({
                    vectors: {
                        size: VECTOR_SIZE,
                        distance: "Cosine"
                    }
                })
            }
        );

        const text = await response.text();

        if (!response.ok) {
            throw new Error(
                `Qdrant collection create failed (${response.status}): ${text}`
            );
        }

        console.log("[Qdrant] Collection created:", QDRANT_COLLECTION);

        // Create payload indexes (required for filtering)
        console.log("[Qdrant] Creating payload indexes...");
        await Promise.all([
            fetchWithDns(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/index`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...(QDRANT_API_KEY ? { "api-key": QDRANT_API_KEY } : {}) },
                body: JSON.stringify({ field_name: "userId", field_schema: "keyword" })
            }),
            fetchWithDns(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/index`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...(QDRANT_API_KEY ? { "api-key": QDRANT_API_KEY } : {}) },
                body: JSON.stringify({ field_name: "conversationId", field_schema: "keyword" })
            })
        ]);
        console.log("[Qdrant] Indexes created.");
    } catch (err) {
        console.error("[Qdrant] ensureQdrantCollection error:", err.message);
    }
}

module.exports = {
    QDRANT_URL,
    QDRANT_API_KEY,
    QDRANT_COLLECTION,
    VECTOR_SIZE,
    ensureQdrantCollection
};
