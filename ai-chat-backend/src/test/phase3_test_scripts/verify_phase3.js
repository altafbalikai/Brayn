const mongoose = require('mongoose');
const UserMemory = require('./src/models/UserMemory');
const UserMemoryAuditLog = require('./src/models/UserMemoryAuditLog');
const { extractMemoryCandidate } = require('./src/utils/memoryExtraction.utils');
const { classifyMemory, KEY_TAXONOMY } = require('./src/utils/memoryClassification.utils');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function test(name, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${name}`);
    } catch (err) {
        console.log(`❌ FAIL: ${name} - ${err.message}`);
    }
}

console.log('--- Phase 3.1 & 3.2 Rigorous Verification Script ---\n');

// ─── Phase 3.1: Models ──────────────────────────────────────────

test('P3.1-T1: UserMemory category enum enforcement', () => {
    const mem = new UserMemory({
        userId: new mongoose.Types.ObjectId(),
        key: 'preferred_language',
        value: 'Rust',
        category: 'invalid_category',
        sourceConversationId: new mongoose.Types.ObjectId()
    });
    const err = mem.validateSync();
    assert(err && err.errors.category, "Mongoose should have rejected 'invalid_category'");
});

test('P3.1-T2: UserMemory importance bounds (0-10)', () => {
    const mem = new UserMemory({
        userId: new mongoose.Types.ObjectId(),
        category: 'preference',
        importance: 11
    });
    let err = mem.validateSync();
    assert(err && err.errors.importance, "Should reject importance 11");

    mem.importance = -1;
    err = mem.validateSync();
    assert(err && err.errors.importance, "Should reject importance -1");
});

test('P3.1-T3: UserMemory confidence bounds (0.0-1.0)', () => {
    const mem = new UserMemory({
        userId: new mongoose.Types.ObjectId(),
        category: 'preference',
        confidence: 1.1
    });
    let err = mem.validateSync();
    assert(err && err.errors.confidence, "Should reject confidence 1.1");

    mem.confidence = -0.1;
    err = mem.validateSync();
    assert(err && err.errors.confidence, "Should reject confidence -0.1");
});

test('P3.1-T4: UserMemory value length (2-50)', () => {
    const mem = new UserMemory({
        userId: new mongoose.Types.ObjectId(),
        category: 'preference',
        value: 'A'
    });
    let err = mem.validateSync();
    assert(err && err.errors.value, "Should reject value length 1");

    mem.value = 'A'.repeat(51);
    err = mem.validateSync();
    assert(err && err.errors.value, "Should reject value length 51");
});

test('P3.1-T5: UserMemoryAuditLog action enum enforcement', () => {
    const log = new UserMemoryAuditLog({
        userId: new mongoose.Types.ObjectId(),
        action: 'INVALID_ACTION'
    });
    const err = log.validateSync();
    assert(err && err.errors.action, "Should reject 'INVALID_ACTION'");
});

// ─── Phase 3.2a: Extraction ──────────────────────────────────────

test('P3.2a-T1: Basic happy path', () => {
    const res = extractMemoryCandidate("My preference is Rust", "user");
    assert(res.triggerPhrase === "my preference is", "Wrong trigger");
    assert(res.extractedValue === "Rust", "Wrong value");
    assert(res.signalType === "preference", "Wrong signal");
});

test('P3.2a-T2: Role short-circuit', () => {
    const res = extractMemoryCandidate("My preference is Rust", "assistant");
    assert(res === null, "Assistant should return null");
});

test('P3.2a-T3: Hedging word rejection', () => {
    const res = extractMemoryCandidate("I am a bit confused about everything", "user");
    assert(res === null, "Should reject hedging 'a bit'");
});

test('P3.2a-T4: Question mark rejection', () => {
    const res = extractMemoryCandidate("My preference is maybe Rust?", "user");
    assert(res === null, "Should reject 'maybe' and '?'");
});

test('P3.2a-T7: Stop character behavior', () => {
    const res = extractMemoryCandidate("My preference is Rust. I have been using it for years.", "user");
    assert(res.extractedValue === "Rust", `Actually got: "${res.extractedValue}"`);
});

test('P3.2a-T11: Word boundary correctness', () => {
    const res = extractMemoryCandidate("I am afraid of heights", "user");
    assert(res === null, "Should not match 'i am a' against 'I am afraid'");
});

test('P3.2a-T12: Contraction trigger', () => {
    const res = extractMemoryCandidate("I'm a backend engineer", "user");
    assert(res && res.triggerPhrase === "i'm a", "Should match contraction i'm a");
});

// ─── Phase 3.2b: Classification ─────────────────────────────────

test('P3.2b-T1: Direct mapping, profession', () => {
    const cand = { triggerPhrase: "i work as", extractedValue: "backend engineer", signalType: "trait" };
    const res = classifyMemory(cand);
    assert(res.key === "profession", "Wrong key");
    assert(res.value === "Backend engineer", `Wrong value: ${res.value}`);
    assert(res.category === "trait", "Wrong category");
});

test('P3.2b-T3: Keyword hint, preferred_language', () => {
    const cand = { triggerPhrase: "my preference is", extractedValue: "Rust as my language", signalType: "preference" };
    const res = classifyMemory(cand);
    assert(res.key === "preferred_language", "Should have mapped 'language' hint");
});

test('P3.2b-T4: Keyword hint, no match', () => {
    const cand = { triggerPhrase: "my preference is", extractedValue: "something vague", signalType: "preference" };
    const res = classifyMemory(cand);
    assert(res.key === null && res.logReason === "EXTRACTION_UNMAPPED", "Should be unmapped");
});

test('P3.2b-T6: Value normalization', () => {
    const cand = { triggerPhrase: "i work as", extractedValue: "  RUST!  ", signalType: "trait" };
    const res = classifyMemory(cand);
    assert(res.value === "Rust", `Instead got: "${res.value}"`);
});

test('P3.2b-T7: Value truncation at 50', () => {
    const cand = { triggerPhrase: "i work as", extractedValue: "A".repeat(60), signalType: "trait" };
    const res = classifyMemory(cand);
    assert(res.value.length === 50, "Should truncate to 50");
});

test('P3.2b-T9: "remember that" requires hint match', () => {
    const cand = { triggerPhrase: "remember that", extractedValue: "I prefer concise replies", signalType: "any" };
    const res = classifyMemory(cand);
    assert(res.key === "preferred_response_length", `Expect preferred_response_length, got ${res.key}`);
});

console.log('\n--- Extraction & Classification - Comprehensive Coverage ---');
const triggers = [
    'my preference is', 'my preferred', 'i work as', 'i am a', "i'm a",
    'my goal is', "i'm currently", 'remember that', 'my primary',
    'i mainly use', 'i always use'
];
triggers.forEach(t => {
    const demoText = `${t} testing logic.`;
    const cand = extractMemoryCandidate(demoText, 'user');
    if (cand) {
        const classif = classifyMemory(cand);
        const status = classif.key ? `Mapped to: ${classif.key}` : `Unmapped (${classif.logReason})`;
        console.log(`✅ Trigger: "${t}" -> ${status}`);
    } else {
        console.log(`❌ Trigger: "${t}" failed extraction`);
    }
});

console.log('\n--- Verification Script Finished ---');
