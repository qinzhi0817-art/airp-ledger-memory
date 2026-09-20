import { CONTINUATION_PATTERNS, FACT_KINDS, INFERENCE_PATTERNS } from './constants.js';
import { hasExactKeys } from './schema.js';
import { normalizeText } from './utils.js';

const FACT_KEYS = ['kind', 'subject', 'predicate', 'object', 'previous', 'time', 'location', 'importance', 'participants', 'evidence'];
const GROWTH_KEYS = ['character', 'dimension', 'direction', 'observation', 'strength', 'evidence'];
const EVIDENCE_KEYS = ['messageId', 'quote'];
const GROWTH_DIMENSIONS = new Set(['habit', 'attitude', 'trust', 'tolerance', 'interaction_style', 'preference', 'boundary']);
const GROWTH_DIRECTIONS = new Set(['increase', 'decrease', 'emerge', 'fade', 'shift']);

function isCleanText(value, maxLength) {
    if (typeof value !== 'string') return false;
    const text = normalizeText(value);
    if (!text || text.length > maxLength) return false;
    return ![...INFERENCE_PATTERNS, ...CONTINUATION_PATTERNS].some(pattern => pattern.test(text));
}

function messageById(messages, id) {
    return messages.find(message => String(message.id) === String(id));
}

function validateEvidence(evidence, messages) {
    if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 4) return false;
    return evidence.every(item => {
        if (!hasExactKeys(item, EVIDENCE_KEYS) || !isCleanText(item.quote, 240)) return false;
        const source = messageById(messages, item.messageId);
        if (!source) return false;
        return normalizeText(source.text).includes(normalizeText(item.quote));
    });
}

function validateFact(fact, messages) {
    return hasExactKeys(fact, FACT_KEYS)
        && FACT_KINDS.includes(fact.kind)
        && isCleanText(fact.subject, 80)
        && isCleanText(fact.predicate, 80)
        && isCleanText(fact.object, 240)
        && (fact.previous === null || isCleanText(fact.previous, 240))
        && (fact.time === null || isCleanText(fact.time, 120))
        && (fact.location === null || isCleanText(fact.location, 120))
        && Number.isInteger(fact.importance) && fact.importance >= 1 && fact.importance <= 5
        && Array.isArray(fact.participants) && fact.participants.length <= 12
        && fact.participants.every(value => isCleanText(value, 80))
        && validateEvidence(fact.evidence, messages);
}

function validateGrowth(item, messages) {
    return hasExactKeys(item, GROWTH_KEYS)
        && isCleanText(item.character, 80)
        && GROWTH_DIMENSIONS.has(item.dimension)
        && GROWTH_DIRECTIONS.has(item.direction)
        && isCleanText(item.observation, 240)
        && Number.isInteger(item.strength) && item.strength >= 1 && item.strength <= 3
        && validateEvidence(item.evidence, messages);
}

export function validateExtraction(payload, messages, maxFacts = 8) {
    if (!hasExactKeys(payload, ['facts', 'growthEvidence'])) {
        return { ok: false, error: 'Root object contains missing or unknown fields.' };
    }
    if (!Array.isArray(payload.facts) || payload.facts.length > maxFacts || !Array.isArray(payload.growthEvidence)) {
        return { ok: false, error: 'Invalid collection shape.' };
    }
    const rejectedFacts = payload.facts.filter(fact => !validateFact(fact, messages));
    const rejectedGrowth = payload.growthEvidence.filter(item => !validateGrowth(item, messages));
    return {
        ok: true,
        value: {
            facts: payload.facts.filter(fact => validateFact(fact, messages)),
            growthEvidence: payload.growthEvidence.filter(item => validateGrowth(item, messages)),
        },
        rejected: rejectedFacts.length + rejectedGrowth.length,
    };
}
