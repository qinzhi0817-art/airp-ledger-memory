import { SCHEMA_VERSION } from './constants.js';
import { deepClone, makeId, normalizeText, sha256 } from './utils.js';

export function createEmptyLedger(scopeId = '') {
    return {
        schemaVersion: SCHEMA_VERSION,
        scopeId,
        revision: 0,
        facts: [],
        growthEvidence: [],
        sources: [],
        lastProcessedTurn: null,
        updatedAt: null,
    };
}

function activeFactFor(ledger, subject, predicate) {
    const replaced = new Set(ledger.facts.flatMap(fact => fact.supersedes || []));
    return [...ledger.facts].reverse().find(fact => !fact.deletedAt
        && !replaced.has(fact.id)
        && normalizeText(fact.subject) === normalizeText(subject)
        && normalizeText(fact.predicate) === normalizeText(predicate));
}

async function sourceRecord(message, scopeId) {
    const text = String(message.text ?? '');
    return {
        id: makeId('source'),
        scopeId,
        messageId: message.id,
        displayFloor: message.floor ?? message.id,
        role: message.role,
        name: message.name || '',
        text,
        contentHash: await sha256(text),
        capturedAt: new Date().toISOString(),
    };
}

export async function appendExtraction(ledgerInput, extraction, messages, options = {}) {
    const ledger = deepClone(ledgerInput || createEmptyLedger(options.scopeId));
    const now = new Date().toISOString();
    const existingSourceKeys = new Set(ledger.sources.map(item => `${item.messageId}:${item.contentHash}`));
    for (const message of messages) {
        const source = await sourceRecord(message, ledger.scopeId);
        const key = `${source.messageId}:${source.contentHash}`;
        if (!existingSourceKeys.has(key)) {
            ledger.sources.push(source);
            existingSourceKeys.add(key);
        }
    }

    for (const proposed of extraction.facts) {
        const current = activeFactFor(ledger, proposed.subject, proposed.predicate);
        if (current && normalizeText(current.object) === normalizeText(proposed.object)) continue;
        const supersedes = [];
        let status = 'active';
        if (current?.locked) {
            status = 'disputed';
        } else if (current && proposed.previous !== null) {
            if (normalizeText(current.object) === normalizeText(proposed.previous)) supersedes.push(current.id);
            else status = 'disputed';
        }
        ledger.facts.push({
            id: makeId('fact'),
            ...deepClone(proposed),
            status,
            supersedes,
            locked: false,
            userEdited: false,
            createdAt: now,
            deletedAt: null,
            extractorVersion: options.extractorVersion || '0.1.0',
        });
    }

    for (const proposed of extraction.growthEvidence) {
        ledger.growthEvidence.push({
            id: makeId('growth'),
            ...deepClone(proposed),
            locked: false,
            episodeKey: options.turnKey || null,
            createdAt: now,
            deletedAt: null,
        });
    }

    ledger.revision += 1;
    ledger.updatedAt = now;
    ledger.lastProcessedTurn = options.turnKey || ledger.lastProcessedTurn;
    return ledger;
}

export function reviseFact(ledgerInput, factId, changes, mode = 'edit') {
    const ledger = deepClone(ledgerInput);
    const index = ledger.facts.findIndex(item => item.id === factId);
    if (index < 0) throw new Error('Memory not found.');
    const original = ledger.facts[index];
    const now = new Date().toISOString();
    if (mode === 'lock') {
        original.locked = Boolean(changes.locked);
    } else if (mode === 'delete') {
        original.deletedAt = now;
    } else {
        original.status = 'revised';
        ledger.facts.push({
            ...original,
            ...deepClone(changes),
            id: makeId('fact_manual'),
            supersedes: [original.id],
            locked: Boolean(changes.locked ?? original.locked),
            userEdited: true,
            status: 'active',
            createdAt: now,
            deletedAt: null,
        });
    }
    ledger.revision += 1;
    ledger.updatedAt = now;
    return ledger;
}

export function getActiveFacts(ledger) {
    const replaced = new Set(ledger.facts.flatMap(item => item.deletedAt ? [] : (item.supersedes || [])));
    return ledger.facts.filter(item => !item.deletedAt && !replaced.has(item.id) && item.status !== 'revised');
}
