import { renderExtensionTemplateAsync } from '../../../extensions.js';
import {
    eventSource,
    event_types,
    extension_prompt_types,
    extension_settings,
    saveSettingsDebounced,
    setExtensionPrompt,
} from '../../../../script.js';
import { getContext } from '../../../st-context.js';
import { ConnectionManagerRequestService } from '../../shared.js';
import { DEFAULT_SETTINGS, EXTENSION_KEY, PROMPT_KEY } from './core/constants.js';
import { extractTurn } from './core/extractor.js';
import { deriveCharacterStates } from './core/growth.js';
import { appendExtraction, getActiveFacts } from './core/ledger.js';
import { buildMemoryPrompt, retrieveMemories } from './core/retrieval.js';
import { loadLedger, peekLedger, saveLedger } from './core/storage.js';
import { clampInt, normalizeText } from './core/utils.js';
import { ensureManager, openManager } from './ui/manager.js';

const EXTENSION_FOLDER = 'third-party/airp-ledger-memory';
let initialized = false;
let activeScopeId = '';
let extractionQueue = Promise.resolve();

function settings() {
    extension_settings[EXTENSION_KEY] = { ...DEFAULT_SETTINGS, ...(extension_settings[EXTENSION_KEY] || {}) };
    return extension_settings[EXTENSION_KEY];
}

function notify(level, message) {
    const toast = globalThis.toastr?.[level];
    if (typeof toast === 'function') toast(message, 'AIRP Ledger Memory');
    else console[level === 'error' ? 'error' : 'log'](`[AIRP Ledger Memory] ${message}`);
}

function getScopeId() {
    const context = getContext();
    const chatId = context.chatId || context.getCurrentChatId?.() || context.chatMetadata?.chat_id || 'no-chat';
    const owner = context.groupId || context.characterId || context.name2 || 'unknown-character';
    return `${owner}:${chatId}`;
}

function normalizeMessages(chat = getContext().chat || []) {
    return chat.map((message, index) => ({
        id: message.id ?? message.extra?.message_id ?? index,
        floor: index,
        role: message.is_user ? 'user' : (message.is_system ? 'system' : 'assistant'),
        name: message.name || (message.is_user ? getContext().name1 : getContext().name2) || '',
        text: String(message.mes ?? message.text ?? ''),
        timestamp: message.send_date || null,
    })).filter(message => message.text.trim());
}

function findTurn(messages, includeLatestAssistant = false) {
    let assistantIndex = -1;
    if (includeLatestAssistant) {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            if (messages[i].role === 'assistant') { assistantIndex = i; break; }
        }
    } else {
        let latestUser = -1;
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            if (messages[i].role === 'user') { latestUser = i; break; }
        }
        for (let i = latestUser - 1; i >= 0; i -= 1) {
            if (messages[i].role === 'assistant') { assistantIndex = i; break; }
        }
    }
    if (assistantIndex < 0) return null;
    let userIndex = -1;
    for (let i = assistantIndex - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'user') { userIndex = i; break; }
    }
    if (userIndex < 0) return null;
    return [messages[userIndex], messages[assistantIndex]];
}

function turnKey(turn) {
    const assistant = turn[1];
    return `${assistant.id}:${assistant.text.length}:${assistant.timestamp || ''}`;
}

function activeStateHints(ledger) {
    return getActiveFacts(ledger)
        .filter(fact => ['state_transition', 'relationship', 'location', 'possession'].includes(fact.kind))
        .slice(-20)
        .map(fact => ({ subject: fact.subject, predicate: fact.predicate, value: fact.object, factId: fact.id }));
}

async function processTurn(turn, scopeId, manual = false) {
    const config = settings();
    if (!config.enabled || !config.profileId || !turn) return { skipped: true };
    const key = turnKey(turn);
    const ledger = await loadLedger(scopeId);
    if (ledger.lastProcessedTurn === key) return { skipped: true };
    const validated = await extractTurn({
        messages: turn,
        activeStates: activeStateHints(ledger),
        profileId: config.profileId,
        maxTokens: config.extractionMaxTokens,
        temperature: config.extractionTemperature,
        requestService: ConnectionManagerRequestService,
        maxFacts: config.maxFactsPerTurn,
    });
    if (getScopeId() !== scopeId && !manual) return { skipped: true };
    const updated = await appendExtraction(ledger, validated.value, turn, { scopeId, turnKey: key });
    await saveLedger(scopeId, updated);
    updateStatus(updated, validated.rejected);
    return { facts: validated.value.facts.length, growth: validated.value.growthEvidence.length, rejected: validated.rejected };
}

function queueConfirmedTurn() {
    const scopeId = getScopeId();
    const turn = findTurn(normalizeMessages(), false);
    extractionQueue = extractionQueue
        .then(() => processTurn(turn, scopeId, false))
        .catch(error => {
            console.warn('[AIRP Ledger Memory] Background extraction failed:', error);
            updateStatus(peekLedger(scopeId), 0, error.message);
        });
}

async function extractLatestNow() {
    const scopeId = getScopeId();
    const turn = findTurn(normalizeMessages(), true);
    if (!turn) return notify('warning', '当前聊天还没有完整的一轮用户与角色消息。');
    try {
        const result = await processTurn(turn, scopeId, true);
        if (result.skipped) notify('info', '这一轮已经处理过，或尚未配置专用连接。');
        else notify('success', `写入 ${result.facts} 条事实、${result.growth} 条成长证据；拒绝 ${result.rejected} 条。`);
    } catch (error) {
        notify('error', `提取失败：${error.message}`);
    }
}

export async function runGenerationInterceptor(chat = [], _contextSize, _abort, type) {
    const config = settings();
    if (!config.enabled || type === 'quiet') {
        if (!config.enabled) setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.IN_CHAT, config.promptDepth, false, 0);
        return;
    }
    if (!type || type === 'normal') queueConfirmedTurn();
    const scopeId = getScopeId();
    const ledger = await loadLedger(scopeId);
    const messages = normalizeMessages(chat);
    const query = messages.slice(-4).map(message => `${message.name}: ${message.text}`).join('\n');
    const facts = retrieveMemories(ledger, query, { maxFacts: config.maxInjectedFacts });
    const names = new Set(messages.slice(-4).map(message => normalizeText(message.name)).filter(Boolean));
    const states = deriveCharacterStates(ledger, config.minGrowthEpisodes)
        .filter(state => !names.size || names.has(normalizeText(state.character)))
        .slice(0, 4);
    const prompt = buildMemoryPrompt(facts, states, config.maxInjectedChars);
    setExtensionPrompt(PROMPT_KEY, prompt, extension_prompt_types.IN_CHAT, config.promptDepth, false, 0);
    if (config.debug) console.debug('[AIRP Ledger Memory] retrieval', { query, facts, states, prompt });
}

function updateStatus(ledger = peekLedger(activeScopeId), rejected = 0, error = '') {
    const target = document.getElementById('alm_status');
    if (!target) return;
    const activeFacts = getActiveFacts(ledger).length;
    const states = deriveCharacterStates(ledger, settings().minGrowthEpisodes).length;
    target.textContent = error
        ? `后台错误：${error}`
        : `有效事实 ${activeFacts} 条 · 来源快照 ${ledger.sources.length} 条 · 人物状态 ${states} 条${rejected ? ` · 本次拒绝 ${rejected} 条` : ''}`;
}

function updateSetting(key, value) {
    settings()[key] = value;
    saveSettingsDebounced();
}

function bindUi() {
    const config = settings();
    $('#alm_enabled').prop('checked', config.enabled).off('change').on('change', function () {
        updateSetting('enabled', Boolean($(this).prop('checked')));
    });
    const numeric = [
        ['#alm_max_facts', 'maxFactsPerTurn', 1, 8],
        ['#alm_injected_facts', 'maxInjectedFacts', 1, 12],
        ['#alm_injected_chars', 'maxInjectedChars', 500, 12000],
        ['#alm_growth_threshold', 'minGrowthEpisodes', 2, 8],
    ];
    for (const [selector, key, min, max] of numeric) {
        $(selector).val(config[key]).off('change').on('change', function () {
            updateSetting(key, clampInt($(this).val(), min, max, DEFAULT_SETTINGS[key]));
            $(this).val(settings()[key]);
            updateStatus();
        });
    }
    try {
        ConnectionManagerRequestService.handleDropdown('#alm_profile', config.profileId, profile => {
            updateSetting('profileId', profile?.id || '');
        });
    } catch (error) {
        $('#alm_profile').append($('<option>').text('Connection Manager 不可用'));
        console.warn('[AIRP Ledger Memory]', error);
    }
    $('#alm_test').off('click').on('click', async () => {
        try {
            if (!settings().profileId) throw new Error('请先选择专用 Connection Profile。');
            await ConnectionManagerRequestService.sendRequest(
                settings().profileId,
                [{ role: 'system', content: 'Reply with exactly OK.' }, { role: 'user', content: 'Connection test.' }],
                8,
                { stream: false, extractData: true, includePreset: false, includeInstruct: false },
                { temperature: 0 },
            );
            notify('success', '专用 API 连接成功。');
        } catch (error) { notify('error', `连接失败：${error.message}`); }
    });
    $('#alm_extract_now').off('click').on('click', extractLatestNow);
    $('#alm_manage').off('click').on('click', async () => {
        const scopeId = getScopeId();
        const ledger = await loadLedger(scopeId);
        ensureManager(async updated => {
            await saveLedger(scopeId, updated);
            if (getScopeId() === scopeId) updateStatus(updated);
        });
        openManager(ledger, settings());
    });
    $('#alm_export').off('click').on('click', async () => {
        const ledger = await loadLedger(getScopeId());
        const blob = new Blob([JSON.stringify(ledger, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `airp-memory-${Date.now()}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    });
}

function bindEvents() {
    if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, queueConfirmedTurn);
    eventSource.on(event_types.CHAT_CHANGED, async () => {
        activeScopeId = getScopeId();
        const ledger = await loadLedger(activeScopeId);
        updateStatus(ledger);
    });
}

export async function init() {
    if (initialized) return;
    initialized = true;
    settings();
    if (!document.getElementById('airp_ledger_memory_settings')) {
        const html = await renderExtensionTemplateAsync(EXTENSION_FOLDER, 'settings');
        $('#extensions_settings').append(html);
    }
    activeScopeId = getScopeId();
    const ledger = await loadLedger(activeScopeId);
    ensureManager(async updated => {
        await saveLedger(getScopeId(), updated);
        updateStatus(updated);
    });
    bindUi();
    bindEvents();
    updateStatus(ledger);
    globalThis.AirpLedgerMemory = { extractLatestNow, getLedger: () => peekLedger(getScopeId()), openManager: () => openManager(peekLedger(getScopeId()), settings()) };
}

if (typeof window !== 'undefined') {
    window.airp_ledger_memory_intercept = (...args) => runGenerationInterceptor(...args);
}

jQuery(async () => init());
