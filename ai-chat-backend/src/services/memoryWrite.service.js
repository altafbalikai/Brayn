// services/memoryWrite.service.js
const crypto = require("crypto");
const { generateEmbedding } = require("./embeddings.service");
const { QDRANT_URL, QDRANT_COLLECTION } = require("../config/qdrant");
const { fetchWithDns } = require("../utils/fetchWithDns");
const { objectIdToUuid } = require("../utils/uuid.utils");

async function writeMessageToMemory(message) {
    try {
        // Guard: skip if Qdrant is not configured
        if (!QDRANT_URL) return;

        // Guard: skip system messages — they're not user knowledge
        if (message.role === "system") return;

        // Guard: ensure text exists and is a string BEFORE accessing .length
        // This prevents "Cannot read properties of undefined (reading 'length')"
        if (!message?.text || typeof message.text !== "string") return;

        const cleanText = message.text.trim();

        // Guard: skip trivial/short messages
        if (cleanText.length < 10) return;

        // Guard: skip very short assistant replies (e.g. "OK", "Yes")
        if (message.role === "assistant" && cleanText.length < 20) return;

        console.log("[VectorWrite] Embedding message:", message._id?.toString());

        const embedding = await generateEmbedding(cleanText);

        // Guard: embedding must be a real numeric array
        if (!Array.isArray(embedding) || embedding.length === 0) {
            console.warn("[VectorWrite] Embedding returned null/empty, skipping write");
            return;
        }

        const pointId = objectIdToUuid(message._id.toString());

        const response = await fetchWithDns(
            `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": process.env.QDRANT_API_KEY
                },
                body: JSON.stringify({
                    points: [
                        {
                            id: pointId,
                            vector: embedding,
                            payload: {
                                userId: message.userId?.toString() || "",
                                conversationId: message.conversationId?.toString() || "",
                                role: message.role,
                                text: cleanText,
                                importance: message.importance || 0,
                                createdAt: message.createdAt
                                    ? new Date(message.createdAt).toISOString()
                                    : new Date().toISOString()
                            }
                        }
                    ]
                })
            }
        );

        // CRITICAL: always check the response from Qdrant
        if (!response.ok) {
            const body = await response.text();
            console.error(`[VectorWrite] Qdrant PUT failed (${response.status}):`, body);
            return;
        }

        console.log("[VectorWrite] Success for point:", pointId);
    } catch (err) {
        // Fire-and-forget: never crash the app
        console.warn("[VectorWrite] Failed:", err.message);
    }
}

module.exports = { writeMessageToMemory };
