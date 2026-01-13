const { body } = require("express-validator");

/**
 * UPDATE / UPSERT Prompt Settings
 * Admin-only (auth handled elsewhere)
 */
const updatePromptSettingsValidation = [
    body("systemPrompt")
        .exists({ checkFalsy: true })
        .withMessage("systemPrompt is required")
        .isString()
        .withMessage("systemPrompt must be a string")
        .trim()
        .isLength({ min: 1, max: 50000 })
        .withMessage("systemPrompt must be between 1 and 50,000 characters"),

    // 🔒 Architecture guard — forbid future misuse
    body("modelId")
        .not()
        .exists()
        .withMessage(
            "modelId must not be provided; prompt settings are global"
        ),

    body("messages")
        .not()
        .exists()
        .withMessage(
            "messages must not be provided; only systemPrompt is allowed"
        ),
];

/**
 * RESET Prompt Settings
 * No body allowed
 */
const resetPromptSettingsValidation = [
    body()
        .custom((value, { req }) => {
            if (Object.keys(req.body || {}).length > 0) {
                throw new Error("Request body must be empty");
            }
            return true;
        }),
];

module.exports = {
    updatePromptSettingsValidation,
    resetPromptSettingsValidation,
};
