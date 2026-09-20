import { deriveCharacterStates } from '../core/growth.js';
import { getActiveFacts, reviseFact } from '../core/ledger.js';
import { escapeHtml } from '../core/utils.js';

let saveHandler = null;

export function ensureManager(onSave) {
    saveHandler = onSave;
    if (document.getElementById('alm_manager')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <dialog id="alm_manager" class="alm-dialog">
            <div class="alm-dialog-head">
                <h3>AIRP 记忆账本</h3>
                <button type="button" class="menu_button" data-alm-action="close">关闭</button>
            </div>
            <div class="alm-tabs">
                <button type="button" class="menu_button alm-tab active" data-tab="facts">事实</button>
                <button type="button" class="menu_button alm-tab" data-tab="growth">人物状态</button>
                <button type="button" class="menu_button alm-tab" data-tab="sources">来源</button>
            </div>
            <input id="alm_search" class="text_pole" type="search" placeholder="搜索人物、事件、地点、来源楼层……">
            <div id="alm_manager_body" class="alm-manager-body"></div>
        </dialog>`);
    const dialog = document.getElementById('alm_manager');
    dialog.addEventListener('click', event => {
        const action = event.target.closest('[data-alm-action]')?.dataset.almAction;
        if (action === 'close') dialog.close();
    });
}

function factCard(fact) {
    const sources = fact.evidence.map(item => `#${escapeHtml(item.messageId)}「${escapeHtml(item.quote)}」`).join('<br>');
    return `<article class="alm-card ${fact.locked ? 'is-locked' : ''}" data-fact-id="${escapeHtml(fact.id)}">
        <div class="alm-card-title"><span>${escapeHtml(fact.subject)} · ${escapeHtml(fact.predicate)}</span><span>重要度 ${fact.importance}</span></div>
        <div class="alm-object">${escapeHtml(fact.previous ? `${fact.previous} → ${fact.object}` : fact.object)}</div>
        <div class="alm-meta">${escapeHtml(fact.kind)} · ${escapeHtml(fact.status)}${fact.time ? ` · ${escapeHtml(fact.time)}` : ''}${fact.location ? ` · ${escapeHtml(fact.location)}` : ''} · ${escapeHtml(fact.createdAt)}</div>
        <details><summary>来源</summary><div class="alm-evidence">${sources}</div></details>
        <div class="alm-actions">
            <button type="button" class="menu_button" data-card-action="edit">编辑</button>
            <button type="button" class="menu_button" data-card-action="lock">${fact.locked ? '解锁' : '锁定'}</button>
            <button type="button" class="menu_button redWarningBG" data-card-action="delete">删除</button>
        </div>
    </article>`;
}

function renderFacts(ledger, query) {
    const normalized = query.toLowerCase();
    const facts = getActiveFacts(ledger).filter(fact => JSON.stringify(fact).toLowerCase().includes(normalized));
    return facts.length ? facts.slice().reverse().map(factCard).join('') : '<p class="alm-empty">没有匹配的事实记忆。</p>';
}

function renderGrowth(ledger, minEpisodes, query) {
    const states = deriveCharacterStates(ledger, minEpisodes)
        .filter(item => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));
    return states.length ? states.map(state => `<article class="alm-card">
        <div class="alm-card-title"><span>${escapeHtml(state.character)} · ${escapeHtml(state.dimension)}</span><span>${Math.round(state.confidence * 100)}%</span></div>
        <div class="alm-object">${escapeHtml(state.observation)}</div>
        <div class="alm-meta">方向：${escapeHtml(state.direction)} · 来源楼层：${state.sourceMessageIds.map(escapeHtml).join(', ')}</div>
    </article>`).join('') : '<p class="alm-empty">尚无达到证据阈值的人物变化。</p>';
}

function renderSources(ledger, query) {
    const sources = ledger.sources.filter(item => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));
    return sources.length ? sources.slice().reverse().map(source => `<article class="alm-card">
        <div class="alm-card-title"><span>#${escapeHtml(source.displayFloor)} · ${escapeHtml(source.name || source.role)}</span><span>${escapeHtml(source.contentHash.slice(0, 10))}</span></div>
        <div class="alm-source-text">${escapeHtml(source.text)}</div>
    </article>`).join('') : '<p class="alm-empty">没有匹配的来源快照。</p>';
}

export function openManager(ledger, settings) {
    ensureManager(saveHandler);
    const dialog = document.getElementById('alm_manager');
    const body = dialog.querySelector('#alm_manager_body');
    const search = dialog.querySelector('#alm_search');
    let activeTab = 'facts';
    let currentLedger = ledger;

    const render = () => {
        if (activeTab === 'facts') body.innerHTML = renderFacts(currentLedger, search.value);
        if (activeTab === 'growth') body.innerHTML = renderGrowth(currentLedger, settings.minGrowthEpisodes, search.value);
        if (activeTab === 'sources') body.innerHTML = renderSources(currentLedger, search.value);
    };
    dialog.querySelectorAll('.alm-tab').forEach(button => {
        button.onclick = () => {
            activeTab = button.dataset.tab;
            dialog.querySelectorAll('.alm-tab').forEach(item => item.classList.toggle('active', item === button));
            render();
        };
    });
    search.oninput = render;
    body.onclick = async event => {
        const action = event.target.closest('[data-card-action]')?.dataset.cardAction;
        const factId = event.target.closest('[data-fact-id]')?.dataset.factId;
        if (!action || !factId) return;
        const fact = currentLedger.facts.find(item => item.id === factId);
        if (!fact) return;
        if (action === 'lock') currentLedger = reviseFact(currentLedger, factId, { locked: !fact.locked }, 'lock');
        if (action === 'delete' && confirm('软删除这条记忆？原始审计记录仍会保留。')) currentLedger = reviseFact(currentLedger, factId, {}, 'delete');
        if (action === 'edit') {
            const next = prompt('修改事实内容。旧版本仍保留在审计记录中。', fact.object);
            if (next !== null && next.trim()) currentLedger = reviseFact(currentLedger, factId, { object: next.trim() }, 'edit');
        }
        await saveHandler(currentLedger);
        render();
    };
    search.value = '';
    render();
    dialog.showModal();
}
