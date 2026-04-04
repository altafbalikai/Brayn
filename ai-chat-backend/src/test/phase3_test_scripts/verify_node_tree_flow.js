const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
// We look for .env in the root project dir
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Force node tree mode
process.env.USE_NODE_TREE = 'true';

const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const User = require('../../models/User');
const ConversationService = require('../../services/conversation.service');
const llmService = require('../../services/llm.service');

const TEST_USER_ID = "68f6dc2a964fe62655059e38"; // Real user from DB
const TEST_MODEL_ID = "69a5258920b3823a10ff8a70"; // Real model from DB

async function runTest() {
  console.log('--- NODE TREE ARCHITECTURE VERIFICATION ---\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Cleanup previous test data for this user to have a clean state
    await Conversation.deleteMany({ userId: TEST_USER_ID, title: 'Node Tree Test' });
    
    let convId;
    let userMsg1Id;
    let assistantMsg1Id;
    let userMsg2Id;
    let assistantMsg2Id;

    // =========================================================================
    // STEP 1: Create a new conversation
    // =========================================================================
    console.log('\nSTEP 1: Create a new conversation');
    const convNode = await ConversationService.createConversation(
      TEST_USER_ID,
      'default',
      'Node Tree Test',
      TEST_MODEL_ID
    );
    convId = convNode._id.toString();
    
    const dbConv1 = await Conversation.findById(convId).lean();
    console.log('STEP 1 raw Conversation Document:', JSON.stringify(dbConv1, null, 2));

    let step1Assertion = dbConv1._id && dbConv1.rootMessageId;
    if (step1Assertion) {
      console.log('PASS: conversation._id exists AND rootMessageId is set');
    } else {
      console.log('FAIL: rootMessageId is null or missing (Actual architecture sets it on first message)');
    }

    // =========================================================================
    // STEP 2: Send message "Hello"
    // =========================================================================
    console.log('\nSTEP 2: Send message "Hello"');
    const step2Context = await llmService.prepareAskContextNodeTree(
      TEST_USER_ID,
      convId,
      'Hello',
      TEST_MODEL_ID
    );

    userMsg1Id = step2Context.userMsg._id;
    assistantMsg1Id = step2Context.assistantMsg._id;

    const dbUserMsg1 = await Message.findById(userMsg1Id).lean();
    const dbConv2 = await Conversation.findById(convId).lean();
    
    console.log('STEP 2 raw user Message node:', JSON.stringify(dbUserMsg1, null, 2));
    console.log('STEP 2 raw Conversation rootMessageId:', dbConv2.rootMessageId);

    const step2Assertion = 
      dbUserMsg1.role === 'user' && 
      dbUserMsg1.text === 'Hello' &&
      (String(dbConv2.rootMessageId) === String(userMsg1Id));

    if (step2Assertion) {
      console.log('PASS: user Message node exists with role="user", text="Hello"');
      console.log('PASS: Conversation rootMessageId updated to point to this node');
    } else {
      console.log('FAIL: rootMessageId not set correctly');
    }

    // =========================================================================
    // STEP 3: Receive assistant response
    // =========================================================================
    console.log('\nSTEP 3: Receive assistant response');
    await llmService.handlePostStreamTasksNodeTree(
      TEST_USER_ID,
      convId,
      'Hi there!',
      step2Context.userMsg,
      step2Context.assistantMsg
    );

    const dbAssistantMsg1 = await Message.findById(assistantMsg1Id).lean();
    const dbUserMsg1Updated = await Message.findById(userMsg1Id).lean();

    console.log('STEP 3 raw assistant Message node:', JSON.stringify(dbAssistantMsg1, null, 2));
    console.log('STEP 3 raw user node activeChildId:', dbUserMsg1Updated.activeChildId);

    const step3Assertion = 
      dbAssistantMsg1.role === 'assistant' &&
      String(dbAssistantMsg1.parentMessageId) === String(userMsg1Id) &&
      String(dbUserMsg1Updated.activeChildId) === String(assistantMsg1Id);

    if (step3Assertion) {
      console.log('PASS: assistant Message node correctly linked to user node');
    } else {
      console.log('FAIL: hierarchy links incorrect in Step 3');
    }

    // =========================================================================
    // STEP 4: GET /api/conversations/:cid/messages
    // =========================================================================
    console.log('\nSTEP 4: GET /api/conversations/:cid/messages');
    const pathResponse = await ConversationService.getMessagesNodeTree(TEST_USER_ID, convId);
    
    console.log('STEP 4 raw response array:', JSON.stringify(pathResponse.items, null, 2));

    const step4Assertion = 
      pathResponse.items.length === 2 &&
      String(pathResponse.items[0]._id) === String(userMsg1Id) &&
      String(pathResponse.items[1]._id) === String(assistantMsg1Id);

    if (step4Assertion) {
      console.log('PASS: active path returns [user message, assistant message] in order');
    } else {
      console.log('FAIL: active path incorrect');
    }

    // =========================================================================
    // STEP 5: Send a second message "How are you?"
    // =========================================================================
    console.log('\nSTEP 5: Send a second message "How are you?"');
    const step5Context = await llmService.prepareAskContextNodeTree(
      TEST_USER_ID,
      convId,
      'How are you?',
      TEST_MODEL_ID
    );

    userMsg2Id = step5Context.userMsg._id;
    assistantMsg2Id = step5Context.assistantMsg._id;

    await llmService.handlePostStreamTasksNodeTree(
      TEST_USER_ID,
      convId,
      'I am doing great, thank you!',
      step5Context.userMsg,
      step5Context.assistantMsg
    );

    const allNodes = await Message.find({ conversationId: convId }).sort({ createdAt: 1 }).lean();
    console.log('STEP 5 raw Messages (All nodes):', JSON.stringify(allNodes, null, 2));

    const n1 = allNodes.find(n => String(n._id) === String(userMsg1Id));
    const n2 = allNodes.find(n => String(n._id) === String(assistantMsg1Id));
    const n3 = allNodes.find(n => String(n._id) === String(userMsg2Id));
    const n4 = allNodes.find(n => String(n._id) === String(assistantMsg2Id));

    const step5Assertion = 
      String(dbConv2.rootMessageId) === String(userMsg1Id) &&
      String(n1.activeChildId) === String(n2._id) &&
      String(n2.activeChildId) === String(n3._id) &&
      String(n3.activeChildId) === String(n4._id) &&
      n4.activeChildId === null &&
      n1.parentMessageId === null &&
      String(n2.parentMessageId) === String(n1._id) &&
      String(n3.parentMessageId) === String(n2._id) &&
      String(n4.parentMessageId) === String(n3._id);

    if (step5Assertion) {
      console.log('PASS: 4 nodes exist total, chained correctly root → userMsg1 → assistantMsg1 → userMsg2 → assistantMsg2');
    } else {
      console.log('FAIL: chain sequence or parent/child IDs incorrect');
    }

    console.log('\nFinal Tree Diagram:');
    console.log(`root (${userMsg1Id}) \n  ↓ \n userMsg1 ("Hello") \n  ↓ \n assistantMsg1 ("Hi there!") \n  ↓ \n userMsg2 ("How are you?") \n  ↓ \n assistantMsg2 ("I am doing great...")`);

  } catch (err) {
    console.error('ERROR during verification:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\n--- VERIFICATION FINISHED ---');
  }
}

runTest();
