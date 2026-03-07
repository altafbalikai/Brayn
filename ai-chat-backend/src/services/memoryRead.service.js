// services/memoryRead.service.js
const { generateEmbedding } = require("./embeddings.service");
const { QDRANT_URL, QDRANT_COLLECTION } = require("../config/qdrant");
const { fetchWithDns } = require("../utils/fetchWithDns");
const { objectIdToUuid } = require("../utils/uuid.utils");
const Conversation = require("../models/Conversation");

// ─── Phase 2 Configuration ─────────────────────────────────────
const RETRIEVAL_CANDIDATE_COUNT = 15; // fetch more candidates for re-ranking
const RETRIEVAL_FINAL_COUNT = 5;      // number of memories to inject into prompt
const DECAY_LAMBDA = 0.02;            // controls temporal decay speed
const MAX_IMPORTANCE = 10;            // must match importance.utils.js

/**
 * Hybrid retrieval with re-ranking.
 * Fetches 15 candidates by similarity, then applies weighted scoring:
 * Final Score = (Sim * 0.7) + (Importance * 0.2) + (Temporal Decay * 0.1)
 */
async function readRelevantMemory({
    userId,
    conversationId,
    parentConversationId = undefined,
    query,
    limit = RETRIEVAL_FINAL_COUNT,
    excludeIds = []
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

        // Map excludeIds to UUIDs
        const mustNotIds = (excludeIds || []).map(id => objectIdToUuid(id)).filter(Boolean);

        const conversationIds = [conversationId.toString()];

        // If parentConversationId is explicitly provided by caller, avoid extra DB lookup.
        if (typeof parentConversationId !== 'undefined') {
            if (parentConversationId) {
                conversationIds.push(parentConversationId.toString());
            }
        } else {
            // Fallback for existing callers: resolve branch scope from conversation document.
            const convForRag = await Conversation.findById(conversationId)
                .select('parentConversationId')
                .lean();

            if (convForRag?.parentConversationId) {
                conversationIds.push(convForRag.parentConversationId.toString());
            }
        }

        // Phase 2: fetch more candidates (15) to allow re-ranking room
        const body = {
            vector,
            limit: RETRIEVAL_CANDIDATE_COUNT,
            with_payload: true,
            filter: {
                must: [
                    { key: "userId", match: { value: userId.toString() } },
                    { key: "conversationId", match: { any: conversationIds } }
                ],
                ...(mustNotIds.length > 0 && {
                    must_not: [
                        { has_id: mustNotIds }
                    ]
                })
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
        const candidates = data.result || [];

        if (candidates.length === 0) return [];

        // ─── Hybrid Re-ranking ──────────────────────────────────────
        try {
            const now = Date.now();
            const reRanked = candidates.map(item => {
                const payload = item.payload || {};

                // 1. Similarity Score (Qdrant score is 0-1 cosine similarity)
                let similarityScore = item.score;
                // Clamp defensively
                similarityScore = Math.max(0, Math.min(1, similarityScore));

                // 2. Importance Score (Weight: 0.2)
                const importance = Number(payload.importance) || 0;
                const normalizedImportance = Math.max(0, Math.min(1, importance / MAX_IMPORTANCE));

                // 3. Temporal Decay (Weight: 0.1)
                let timeWeight = 1.0;
                if (payload.createdAt) {
                    const createdAt = new Date(payload.createdAt).getTime();
                    if (!isNaN(createdAt)) {
                        const ageInDays = (now - createdAt) / (1000 * 60 * 60 * 24);
                        // exp(-lambda * days)
                        timeWeight = Math.exp(-DECAY_LAMBDA * Math.max(0, ageInDays));
                    }
                }

                const finalScore = (similarityScore * 0.7) + (normalizedImportance * 0.2) + (timeWeight * 0.1);

                return { ...item, finalScore };
            });

            // Sort by finalScore descending
            reRanked.sort((a, b) => b.finalScore - a.finalScore);

            const finalResults = reRanked.slice(0, limit);
            console.log(`[VectorRead] Re-ranked ${candidates.length} candidates → Top ${finalResults.length} selected`);
            return finalResults;

        } catch (reRankErr) {
            console.warn('[VectorRead] Re-ranking failed, falling back to similarity order:', reRankErr.message);
            return candidates.slice(0, limit);
        }

    } catch (err) {
        console.warn("[VectorRead] Failed:", err.message);
        return [];
    }
}

module.exports = { readRelevantMemory };
