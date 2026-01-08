// src/validators/llm.validator.js
const { body, param } = require("express-validator");
const mongoose = require("mongoose");

const askValidation = [
  body("message")
    .exists({ checkFalsy: true })
    .withMessage("Message is required")
    .isString()
    .withMessage("Message must be a string")
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage("Message must be between 1 and 10000 characters"),

  param("cid")
    .notEmpty()
    .withMessage("Conversation ID is required")
    .custom((value) => {
      if (!mongoose.isValidObjectId(value)) {
        throw new Error("Invalid conversation ID format");
      }
      return true;
    }),

  // 🔒 Explicitly forbid modelId (architecture guard)
  body("modelId")
    .not()
    .exists()
    .withMessage("modelId must not be provided; model is resolved from conversation"),
];

module.exports = {
  askValidation,
};
