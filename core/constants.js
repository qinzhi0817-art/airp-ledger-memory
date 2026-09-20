export const EXTENSION_KEY = 'airpLedgerMemory';
export const PROMPT_KEY = 'airp-ledger-memory';
export const STORAGE_PREFIX = 'airp-ledger-memory:v1:';
export const SCHEMA_VERSION = 1;

export const FACT_KINDS = Object.freeze([
    'event',
    'state_transition',
    'promise',
    'relationship',
    'secret',
    'preference',
    'possession',
    'location',
    'identity',
]);

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    profileId: '',
    extractionMaxTokens: 650,
    extractionTemperature: 0,
    maxFactsPerTurn: 8,
    maxInjectedFacts: 6,
    maxInjectedChars: 4200,
    promptDepth: 1,
    minGrowthEpisodes: 2,
    preserveRecentMessages: 12,
    debug: false,
});

export const INFERENCE_PATTERNS = Object.freeze([
    /(?:内心深处|潜意识|其实.{0,8}(?:想|爱|恨|害怕)|嘴硬心软|不愿承认|隐藏动机|真正的动机|暗自认为)/u,
    /(?:seems? to|probably|secretly (?:wants?|loves?|hates?)|subconsciously|deep down|unspoken motive)/iu,
]);

export const CONTINUATION_PATTERNS = Object.freeze([
    /^(?:assistant|user|system|角色|用户|助手)\s*[:：]/iu,
    /(?:接下来|随后她|随后他|下一刻|未完待续|to be continued)/iu,
]);
