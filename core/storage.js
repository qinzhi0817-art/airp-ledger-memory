import { STORAGE_PREFIX } from './constants.js';
import { createEmptyLedger } from './ledger.js';

const cache = new Map();
let store = null;

function getStore() {
    if (store) return store;
    const localforage = globalThis.SillyTavern?.libs?.localforage || globalThis.localforage;
    if (!localforage) throw new Error('SillyTavern localForage is unavailable.');
    store = typeof localforage.createInstance === 'function'
        ? localforage.createInstance({ name: 'SillyTavern', storeName: 'airp_ledger_memory' })
        : localforage;
    return store;
}

function key(scopeId) {
    return `${STORAGE_PREFIX}${scopeId}`;
}

export async function loadLedger(scopeId) {
    if (!scopeId) return createEmptyLedger('');
    if (cache.has(scopeId)) return cache.get(scopeId);
    const value = await getStore().getItem(key(scopeId));
    const ledger = value || createEmptyLedger(scopeId);
    cache.set(scopeId, ledger);
    return ledger;
}

export async function saveLedger(scopeId, ledger) {
    cache.set(scopeId, ledger);
    await getStore().setItem(key(scopeId), ledger);
    return ledger;
}

export function peekLedger(scopeId) {
    return cache.get(scopeId) || createEmptyLedger(scopeId);
}

export function clearLedgerCache(scopeId) {
    if (scopeId) cache.delete(scopeId);
    else cache.clear();
}
