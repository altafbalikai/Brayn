/**
 * Safely executes an async or sync function in the background.
 * Prevents errors from bubbling up to the main request cycle.
 * @param {Function} task - The function to execute.
 */
function safeFireAndForget(task) {
    Promise.resolve()
        .then(() => {
            const result = task();
            if (result instanceof Promise) {
                return result;
            }
        })
        .catch(err => {
            console.error('[safeFireAndForget] Background task failed:', err);
        });
}

module.exports = { safeFireAndForget };
