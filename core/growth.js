import { normalizeText } from './utils.js';

export function deriveCharacterStates(ledger, minEpisodes = 2) {
    const groups = new Map();
    for (const item of ledger.growthEvidence || []) {
        if (item.deletedAt) continue;
        const key = `${normalizeText(item.character)}\u0000${item.dimension}\u0000${item.direction}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    const states = [];
    for (const evidence of groups.values()) {
        const episodes = new Set(evidence.map(item => item.episodeKey
            || item.evidence.map(ref => String(ref.messageId)).sort().join(',')));
        if (episodes.size < minEpisodes) continue;
        const latest = evidence[evidence.length - 1];
        states.push({
            character: latest.character,
            dimension: latest.dimension,
            direction: latest.direction,
            observation: latest.observation,
            confidence: Math.min(1, 0.35 + episodes.size * 0.2),
            evidenceIds: evidence.map(item => item.id),
            sourceMessageIds: [...new Set(evidence.flatMap(item => item.evidence.map(ref => String(ref.messageId))))],
        });
    }
    return states.sort((a, b) => b.confidence - a.confidence);
}
