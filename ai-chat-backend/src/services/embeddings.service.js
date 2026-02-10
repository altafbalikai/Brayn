// services/embeddings.service.js
const { fetchWithDns } = require("../utils/fetchWithDns");

async function generateEmbedding(text) {
    if (typeof text !== "string" || !text.trim()) return null;

    // Skip trivially short text — not worth embedding
    const cleaned = text.trim();
    if (cleaned.length < 10) return null;

    try {
        const response = await fetchWithDns(
            process.env.EMBEDDING_API_URL,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HF_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    inputs: cleaned
                })
            }
        );

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`HF API ${response.status}: ${err}`);
        }

        const data = await response.json();

        // HF feature-extraction returns number[] or number[][] depending on model
        const embedding = Array.isArray(data)
            ? (Array.isArray(data[0]) ? data[0] : data)
            : null;

        // Validate the embedding is a real numeric array
        if (
            !Array.isArray(embedding) ||
            embedding.length === 0 ||
            typeof embedding[0] !== "number"
        ) {
            console.warn("HF embedding: unexpected shape", typeof data, Array.isArray(data) ? data.length : "N/A");
            return null;
        }

        return embedding;
    } catch (err) {
        console.warn("HF embedding error:", err.message);
        return null;
    }
}

module.exports = { generateEmbedding };
