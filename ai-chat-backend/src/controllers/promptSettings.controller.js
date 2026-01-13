const {
    getPromptSettings,
    upsertPromptSettings,
    resetPromptSettings,
} = require("../services/promptSettings.service");

/**
 * GET /api/prompt-settings
 * Public (or authenticated) – read-only
 */
async function getPrompt(req, res, next) {
    try {
        const data = await getPromptSettings();
        res.status(200).json(data);
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/prompt-settings
 * Admin only – create or update global prompt
 */
async function updatePrompt(req, res, next) {
    try {
        const data = await upsertPromptSettings(
            req.body,
            req.user?.id // injected by auth middleware
        );

        res.status(200).json(data);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/prompt-settings/reset
 * Admin only – reset system prompt
 */
async function resetPrompt(req, res, next) {
    try {
        const data = await resetPromptSettings(req.user?.id);
        res.status(200).json(data);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getPrompt,
    updatePrompt,
    resetPrompt,
};
