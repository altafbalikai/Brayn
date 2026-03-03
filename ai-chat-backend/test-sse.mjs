import jwt from 'jsonwebtoken';

const API_URL = 'http://localhost:4000/api';
const JWT_SECRET = 'very_strong_access_token_secret';

import mongoose from 'mongoose';
const MONGO_URI = 'mongodb+srv://altafbalikai03_db_user:y78PtkLdDCV4TNfO@cluster0.4ldk606.mongodb.net/test';

async function testAskSSE() {
    console.log('Connecting to DB to fetch a real user...');
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;

    const userDoc = await db.collection('users').findOne({});
    if (!userDoc) {
        console.error("No users found in database!");
        process.exit(1);
    }

    console.log(`Found user: ${userDoc.email} (${userDoc._id.toString()})`);

    const token = jwt.sign(
        { id: userDoc._id.toString(), email: userDoc.email, name: userDoc.name, role: userDoc.role, tokenVersion: userDoc.tokenVersion },
        JWT_SECRET,
        { expiresIn: '15m' }
    );

    const convRes = await fetch(`${API_URL}/conversations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: 'SSE Test' })
    });
    const conv = await convRes.json();
    const convId = conv._id;

    console.log('\n--- STARTING SSE STREAM ---');
    const res = await fetch(`${API_URL}/llm/conversations/${convId}/ask`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: 'Hello, please reply with just the word "World".' })
    });

    console.log(`Status: ${res.status}`);
    console.log(`Content-Type: ${res.headers.get('content-type')}`);
    console.log(`Content-Length: ${res.headers.get('content-length')}`);

    if (res.headers.get('content-type')?.includes('application/json')) {
        const text = await res.text();
        console.log(`JSON Response Body [length ${text.length}]:`, text);
        process.exit(0);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        console.log(`Read step -> done: ${done}, value length: ${value ? value.length : 0}`);

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const evt of events) {
            console.log("Raw Frame ->", JSON.stringify(evt));
        }
    }

    console.log('--- STREAM COMPLETE ---');
    console.log('Final Buffer Remainder: ', JSON.stringify(buffer));
    process.exit(0);
}

testAskSSE().catch(e => {
    console.error(e);
    process.exit(1);
});
