// utils/promptAssembler.js

function assemblePrompt({
    systemPrompt,
    retrievedMemory,
    recentMessages,
    userInput
}) {
    let prompt = `${systemPrompt}\n\n`;

    if (retrievedMemory && retrievedMemory.length) {
        prompt += "Relevant past context:\n";
        for (const item of retrievedMemory) {
            // Payload stores "text", not "content"
            prompt += `- ${item.payload.role}: ${item.payload.text || ""}\n`;
        }
        prompt += "\n";
    }

    prompt += "Recent conversation:\n";
    for (const msg of recentMessages) {
        prompt += `${msg.role}: ${msg.content || msg.text || ""}\n`;
    }

    prompt += `\nUser: ${userInput}\nAssistant:`;

    return prompt;
}

module.exports = { assemblePrompt };
