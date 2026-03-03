const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Conversation = require('./src/models/Conversation');
const Message = require('./src/models/Message');

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai-chat');
        console.log('Connected');

        const cid = '69a59fc220b3823a10ff8cbb';
        const mid = '69a59fd020b3823a10ff8ce0';

        const conv = await Conversation.findById(cid);
        const msg = await Message.findById(mid);

        console.log('Conversation:', conv ? 'Found' : 'Not Found', conv ? conv._id : '');
        console.log('Message:', msg ? 'Found' : 'Not Found', msg ? msg._id : '');

        if (msg) {
            console.log('Message conversationId:', msg.conversationId);
            console.log('Message role:', msg.role);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
