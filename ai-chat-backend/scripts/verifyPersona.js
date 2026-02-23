const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

async function verify() {
    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        console.log('Connecting to:', mongoUri.substring(0, 20) + '...');
        await mongoose.connect(mongoUri);
        console.log('Connected to DB');

        const ConversationService = require(path.join(process.cwd(), 'src/services/conversation.service.js'));
        const LLMService = require(path.join(process.cwd(), 'src/services/llm.service.js'));
        const Conversation = require(path.join(process.cwd(), 'src/models/Conversation.js'));
        const Message = require(path.join(process.cwd(), 'src/models/Message.js'));
        const Persona = require(path.join(process.cwd(), 'src/models/Persona.js'));

        const userId = new mongoose.Types.ObjectId().toString();

        // 1. Test Conversation Creation
        console.log('\n--- 1. Testing Conversation Creation ---');
        const conv = await ConversationService.createConversation(userId, 'test-agent', 'Persona Test');
        console.log('Conversation created:', conv._id);
        console.log('Default Persona ID:', conv.currentPersonaId);

        // 2. Test Message Addition (User)
        console.log('\n--- 2. Testing User Message ---');
        const userMsg = await ConversationService.addMessage(userId, conv._id.toString(), { role: 'user', text: 'Hello' });
        console.log('User Message saved, PersonaId:', userMsg.personaId);

        // 3. Test Message Addition (Assistant)
        console.log('\n--- 3. Testing Assistant Message ---');
        const assistantMsg = await ConversationService.addMessage(userId, conv._id.toString(), { role: 'assistant', text: 'Hi there' });
        console.log('Assistant Message saved, PersonaId:', assistantMsg.personaId);

        // 4. Test Prompt Assembly
        console.log('\n--- 4. Testing Prompt Assembly ---');
        const prompt = await LLMService.assembleSystemPrompt(userId, conv._id.toString());
        console.log('Assembled Prompt (first 100 chars):', prompt.substring(0, 100).replace(/\n/g, ' ') + '...');

        // 5. Test Persona Switch
        console.log('\n--- 5. Testing Persona Switch ---');
        const legalPersona = await Persona.findOne({ slug: 'legal-expert' });
        await ConversationService.switchPersona(userId, conv._id.toString(), legalPersona.id);
        const updatedConv = await Conversation.findById(conv._id);
        console.log('Updated Persona ID:', updatedConv.currentPersonaId);

        console.log('\n✅ ALL VERIFICATION CHECKS PASSED');

        // Cleanup
        await Conversation.deleteOne({ _id: conv._id });
        await Message.deleteMany({ conversationId: conv._id });

        mongoose.connection.close();
    } catch (err) {
        console.error('\n❌ VERIFICATION FAILED!');
        console.error('Error Message:', err.message);
        console.error('Stack Trace:', err.stack);
        if (mongoose.connection.readyState !== 0) mongoose.connection.close();
        process.exit(1);
    }
}

verify();
