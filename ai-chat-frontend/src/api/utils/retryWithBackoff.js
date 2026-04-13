/**
 * Generic retry utility with exponential backoff + jitter
 * Used for retrying failed fetch requests (streaming endpoints)
 * 
 * Features:
 * - Exponential backoff: baseDelay * 2^(attempt-1)
 * - Random jitter to prevent thundering herd
 * - Configurable max delay cap
 * - Customizable retriability logic
 * - Special handling for 409 (duplicate in-flight) with 1.5x multiplier
 */

export async function retryWithBackoff(fn, {
    maxAttempts = 5,
    baseDelayMs = 500,
    maxDelayMs = 30000,
    jitterFactor = 0.1,
    isRetriable = (err) => {
        // Network errors → always retriable
        if (!err.status) return true;

        // 409 Conflict (duplicate in-flight) → retriable with backoff
        if (err.status === 409) return true;

        // Server errors → retriable
        if ([500, 502, 503, 504].includes(err.status)) return true;

        // Everything else (400, 401, 403, 404, etc.) → not retriable
        return false;
    }
} = {}) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (error.name === 'AbortError' || error instanceof DOMException && error.code === DOMException.ABORT_ERR) {
                throw error; // do not retry — this was a deliberate cancellation
            }

            lastError = error;

            // Check if this error is retriable
            if (!isRetriable(error) || attempt === maxAttempts) {
                // Fatal error or last attempt reached
                throw error;
            }

            // ✅ Calculate backoff delay with special handling for 409
            let exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);

            // For 409, add extra delay (1.5x multiplier)
            // This gives the in-flight request time to complete
            if (error.status === 409) {
                exponentialDelay *= 1.5;
            }

            // Add random jitter to prevent thundering herd
            const jitter = exponentialDelay * jitterFactor * Math.random();
            const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

            // Log retry attempt
            const reason = error.status === 409
                ? 'request in progress'
                : (error.status ? `server error ${error.status}` : 'network error');

            console.warn(
                `[Retry ${attempt}/${maxAttempts}] ${reason} - waiting ${Math.round(delay)}ms before retry`,
                error
            );

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // All retries exhausted
    throw lastError;
}

/**
 * Generate a UUID for request idempotency tracking
 * Used to ensure same request key across all retry attempts
 */
export function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
