// scripts/migrate-set-agentId.js
const mongoose = require('mongoose');
const Conversation = require('../src/models/Conversation');
const MONGO = process.env.MIGRATION_MONGO_URI || process.env.MONGO_URI;

if (!MONGO) {
  console.error('MIGRATION_MONGO_URI or MONGO_URI env var is required');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(MONGO);
    console.log('✅ Connected to MongoDB');

    const cursor = Conversation.find().cursor();
    let count = 0;

    for await (const doc of cursor) {
      if (!doc.agentId && doc.title) {
        // Extract first two words from title (before ":")
        let baseTitle = doc.title.split(':')[0].trim(); // e.g. "Technical Guide"
        const words = baseTitle.split(/\s+/);
        const agentId = words.slice(0, 2).join(' '); // first two words

        if (agentId) {
          doc.agentId = agentId; // assign e.g. "Technical Guide"
          await doc.save();
          count++;
          console.log(`✅ Updated ${doc._id} → agentId: "${agentId}"`);
        }
      }
    }

    console.log(`🎯 Migration complete. Updated ${count} documents.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
})();
