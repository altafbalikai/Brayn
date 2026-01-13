const express = require("express");
const router = express.Router();
const {
    updatePromptSettingsValidation,
    resetPromptSettingsValidation,
} = require("../validators/promptSettings.validator");

const auth = require('../middlewares/auth.middleware');
const {
    getPrompt,
    updatePrompt,
    resetPrompt,
} = require("../controllers/promptSettings.controller");

router.get("/", getPrompt);

router.put(
    "/",
    updatePromptSettingsValidation,
    auth,
    updatePrompt
);

router.post(
    "/reset",
    resetPromptSettingsValidation,
    auth,
    resetPrompt
);

module.exports = router;
