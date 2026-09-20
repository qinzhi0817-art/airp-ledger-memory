export function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .replace(/[\t ]+/g, ' ')
        .trim();
}

export function clampInt(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
}

export function makeId(prefix = 'id') {
    if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function sha256(text) {
    const data = new TextEncoder().encode(String(text ?? ''));
    if (globalThis.crypto?.subtle) {
        const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(data).digest('hex');
}

export function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
}
