import test from 'node:test';
import assert from 'node:assert/strict';
import { appendExtraction, createEmptyLedger, getActiveFacts, reviseFact } from '../core/ledger.js';

const messages = [
    { id: 1, floor: 1, role: 'user', name: 'Yao', text: '我们现在搬去旧城区公寓。' },
    { id: 2, floor: 2, role: 'assistant', name: '林夏', text: '林夏把箱子搬进了旧城区公寓。' },
];

function extraction(object, previous = null) {
    return {
        facts: [{
            kind: 'state_transition', subject: '林夏', predicate: '居住地点', object, previous,
            time: null, location: '旧城区公寓',
            importance: 3, participants: ['林夏'], evidence: [{ messageId: 2, quote: '旧城区公寓' }],
        }],
        growthEvidence: [],
    };
}

test('state transitions append and supersede without deleting history', async () => {
    let ledger = createEmptyLedger('test');
    ledger = await appendExtraction(ledger, extraction('学校宿舍'), messages, { turnKey: 'a' });
    const firstId = ledger.facts[0].id;
    ledger = await appendExtraction(ledger, extraction('旧城区公寓', '学校宿舍'), messages, { turnKey: 'b' });
    assert.equal(ledger.facts.length, 2);
    assert.deepEqual(ledger.facts[1].supersedes, [firstId]);
    assert.equal(getActiveFacts(ledger)[0].object, '旧城区公寓');
});

test('an inconsistent previous value creates a disputed branch', async () => {
    let ledger = await appendExtraction(createEmptyLedger('test'), extraction('学校宿舍'), messages, { turnKey: 'a' });
    ledger = await appendExtraction(ledger, extraction('旧城区公寓', '海边别墅'), messages, { turnKey: 'b' });
    assert.equal(ledger.facts[1].status, 'disputed');
    assert.deepEqual(ledger.facts[1].supersedes, []);
});

test('manual edits create a revision and preserve the old record', async () => {
    let ledger = await appendExtraction(createEmptyLedger('test'), extraction('学校宿舍'), messages, { turnKey: 'a' });
    const originalId = ledger.facts[0].id;
    ledger = reviseFact(ledger, originalId, { object: '旧城区公寓' }, 'edit');
    assert.equal(ledger.facts.length, 2);
    assert.equal(ledger.facts[0].status, 'revised');
    assert.deepEqual(ledger.facts[1].supersedes, [originalId]);
});

test('automatic transitions cannot supersede a locked fact', async () => {
    let ledger = await appendExtraction(createEmptyLedger('test'), extraction('学校宿舍'), messages, { turnKey: 'a' });
    ledger = reviseFact(ledger, ledger.facts[0].id, { locked: true }, 'lock');
    ledger = await appendExtraction(ledger, extraction('旧城区公寓', '学校宿舍'), messages, { turnKey: 'b' });
    assert.equal(ledger.facts[1].status, 'disputed');
    assert.deepEqual(ledger.facts[1].supersedes, []);
    assert.equal(getActiveFacts(ledger).length, 2);
});

test('exact duplicate facts are not appended again', async () => {
    let ledger = await appendExtraction(createEmptyLedger('test'), extraction('学校宿舍'), messages, { turnKey: 'a' });
    ledger = await appendExtraction(ledger, extraction('学校宿舍'), messages, { turnKey: 'b' });
    assert.equal(ledger.facts.length, 1);
    assert.equal(ledger.sources.length, 2);
});
