const mongoose = require('mongoose');
const fs = require('fs');

const uri = 'mongodb+srv://altafbalikai03_db_user:y78PtkLdDCV4TNfO@cluster0.4ldk606.mongodb.net/test';
const userId = '6938a899a922cb2e8157b1ee';
const outputFile = 'C:\\Users\\hussa\\Projects_ai\\ai-chat\\ai-chat-backend\\tmp\\query_results.json';
const conversationIdId = '69cd8a90f3a698f8493211f2';

async function run() {
  await mongoose.connect(uri);
  try {
    // 1. Find latest conversation
    const conversation = await mongoose.connection.db.collection('conversations')
      .findOne({ userId: new mongoose.Types.ObjectId(userId) }, { sort: { createdAt: -1 } });

    if (!conversation) {
      fs.writeFileSync(outputFile, JSON.stringify({ error: 'No conversation found for userId ' + userId }));
      process.exit(0);
    }

    // 2. Fetch messages
    const messages = await mongoose.connection.db.collection('messages')
      .find({ conversationId: conversation._id })
      .project({
        _id: 1,
        role: 1,
        text: 1,
        parentMessageId: 1,
        activeChildId: 1,
        status: 1,
        createdAt: 1
      })
      .sort({ createdAt: 1 })
      .toArray();

    const result = {
      conversation: {
        _id: conversation._id,
        rootMessageId: conversation.rootMessageId,
        createdAt: conversation.createdAt
      },
      messages
    };

    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    fs.writeFileSync(outputFile, err.stack || err.message);
    process.exit(1);
  }
}

run();
