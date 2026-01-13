const mongoose = require("mongoose");

const PromptSettingsSchema = new mongoose.Schema(
    {
        systemPrompt: {
            type: String,
            required: true,
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("PromptSettings", PromptSettingsSchema);
