require('dotenv').config();
const mongoose = require('mongoose');
const UserMemory = require('./src/models/UserMemory');
const { getUserMemories } = require('./src/services/userMemory.service');

const TEST_USER_ID = "65d5f1e9c9a2a7b3c4d5e6f7";

async function test() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    try {
        console.log('Calling getUserMemories...');
        const res = await getUserMemories(TEST_USER_ID);
        console.log('Result:', res);
        console.log('Is Array?', Array.isArray(res));
    } catch (err) {
        console.error('Caught error:', err);
    } finally {
        await mongoose.connection.close();
    }
}

test();
