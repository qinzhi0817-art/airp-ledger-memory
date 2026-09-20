import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExtraction } from '../core/validation.js';

const messages = [
    { id: 10, role: 'user', name: 'Yao', text: '我把钥匙交给了沈言，说：“以后你可以直接进来。”' },
    { id: 11, role: 'assistant', name: '沈言', text: '沈言接过钥匙，放进外套内袋。' },
];

function validPayload() {
    return {
        facts: [{
            kind: 'possession', subject: '沈言', predicate: '持有物', object: 'Yao家的钥匙', previous: null,
            time: null, location: null,
            importance: 4, participants: ['Yao', '沈言'], evidence: [{ messageId: 11, quote: '沈言接过钥匙' }],
        }],
        growthEvidence: [],
    };
}

test('accepts a strictly shaped fact with an exact source quote', () => {
    const result = validateExtraction(validPayload(), messages, 8);
    assert.equal(result.ok, true);
    assert.equal(result.value.facts.length, 1);
    assert.equal(result.rejected, 0);
});

test('rejects a fabricated quote without rejecting valid root JSON', () => {
    const payload = validPayload();
    payload.facts[0].evidence[0].quote = '沈言高兴地接过了钥匙';
    const result = validateExtraction(payload, messages, 8);
    assert.equal(result.ok, true);
    assert.equal(result.value.facts.length, 0);
    assert.equal(result.rejected, 1);
});

test('rejects hidden-psychology inference', () => {
    const payload = validPayload();
    payload.facts[0].object = '其实已经爱上Yao';
    const result = validateExtraction(payload, messages, 8);
    assert.equal(result.value.facts.length, 0);
});

test('rejects unknown root fields', () => {
    const payload = { ...validPayload(), narration: '随后他走出了门。' };
    const result = validateExtraction(payload, messages, 8);
    assert.equal(result.ok, false);
});
