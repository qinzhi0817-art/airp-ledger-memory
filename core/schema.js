import { FACT_KINDS } from './constants.js';

const evidenceSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['messageId', 'quote'],
    properties: {
        messageId: { type: ['integer', 'string'] },
        quote: { type: 'string', minLength: 1, maxLength: 240 },
    },
};

export const EXTRACTION_JSON_SCHEMA = {
    name: 'airp_memory_extraction',
    strict: true,
    value: {
        type: 'object',
        additionalProperties: false,
        required: ['facts', 'growthEvidence'],
        properties: {
            facts: {
                type: 'array',
                maxItems: 8,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kind', 'subject', 'predicate', 'object', 'previous', 'time', 'location', 'importance', 'participants', 'evidence'],
                    properties: {
                        kind: { type: 'string', enum: FACT_KINDS },
                        subject: { type: 'string', minLength: 1, maxLength: 80 },
                        predicate: { type: 'string', minLength: 1, maxLength: 80 },
                        object: { type: 'string', minLength: 1, maxLength: 240 },
                        previous: { type: ['string', 'null'], maxLength: 240 },
                        time: { type: ['string', 'null'], maxLength: 120 },
                        location: { type: ['string', 'null'], maxLength: 120 },
                        importance: { type: 'integer', minimum: 1, maximum: 5 },
                        participants: {
                            type: 'array', maxItems: 12,
                            items: { type: 'string', minLength: 1, maxLength: 80 },
                        },
                        evidence: { type: 'array', minItems: 1, maxItems: 4, items: evidenceSchema },
                    },
                },
            },
            growthEvidence: {
                type: 'array',
                maxItems: 6,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['character', 'dimension', 'direction', 'observation', 'strength', 'evidence'],
                    properties: {
                        character: { type: 'string', minLength: 1, maxLength: 80 },
                        dimension: {
                            type: 'string',
                            enum: ['habit', 'attitude', 'trust', 'tolerance', 'interaction_style', 'preference', 'boundary'],
                        },
                        direction: { type: 'string', enum: ['increase', 'decrease', 'emerge', 'fade', 'shift'] },
                        observation: { type: 'string', minLength: 1, maxLength: 240 },
                        strength: { type: 'integer', minimum: 1, maximum: 3 },
                        evidence: { type: 'array', minItems: 1, maxItems: 4, items: evidenceSchema },
                    },
                },
            },
        },
    },
};

export function hasExactKeys(object, required) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
    const actual = Object.keys(object).sort();
    const expected = [...required].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
