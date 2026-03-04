/**
 * src/api/utils/modelFailover.js
 * 
 * Utility to classify errors and orchestrate individual model attempts.
 */

/**
 * Executes a stream attempt and classifies the failure.
 * 
 * @param {string} modelId - Model to try
 * @param {Function} streamFn - Function that returns a stream object (retryMessageStream)
 * @returns {Promise<Object>} The started stream result
 * @throws {Object} Classified error { status, code, isUnavailable, isRetriable }
 */
export async function tryModel(modelId, streamFn) {
    try {
        const stream = streamFn(modelId);
        // This won't actually "start" until .start() is called, 
        // but retryMessageStream is expected to return the object.
        return stream;
    } catch (error) {
        throw classifyError(error);
    }
}

/**
 * Classifies an error to determine failover behavior.
 */
export function classifyError(error) {
    const { status, code } = error;
    const message = error.message || "";

    // 1. Model Unavailable (400 + specific message/code if available)
    // Backend returns 400 with "Selected LLM model is unavailable"
    const isUnavailable = status === 400 && (
        code === 'MODEL_UNAVAILABLE' ||
        (typeof message === 'string' && (
            message.includes("unavailable") ||
            message.includes("MODEL_UNAVAILABLE")
        ))
    );

    // 2. Retriable (5xx, Network, 409)
    const isRetriable = [500, 502, 503, 504, 409].includes(status) ||
        message.includes("Network error");

    return {
        originalError: error,
        message,
        status,
        code: code || null,
        isUnavailable,
        isRetriable,
        isFatal: !isUnavailable && !isRetriable
    };
}
