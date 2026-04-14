let pendingConfirmation = null


const intents = [
    // Greet
    { pattern: /^(hello|hi|hey|good\s*(morning|afternoon|evening|night))(\s+aria)?[!.]?$/i, action: 'GREET' },
    { pattern: /^aria[!.]?$/i, action: 'GREET' },

    // Yes / No — for confirmations
    { pattern: /^(yes|yeah|yep|yup|sure|correct|right|go ahead|do it)\.?$/i, action: 'YES' },
    { pattern: /^(no|nope|nah|cancel|never mind|stop)\.?$/i, action: 'NO' },

    // List commands — exact + all fuzzy mishears
    { pattern: /list\s*(down\s*)?(commands?|things|what you can do|capabilities)/i, action: 'LIST_COMMANDS' },
    { pattern: /what\s+can\s+you\s+do/i, action: 'LIST_COMMANDS' },
    { pattern: /help|show\s+commands/i, action: 'LIST_COMMANDS' },
    { pattern: /l[ie]a?s[et]\s*co[mn]/i, action: 'LIST_COMMANDS' }, // least/list come/comm
    { pattern: /(?:least|lest|list)\s+come/i, action: 'LIST_COMMANDS' },
    { pattern: /don'?t\s+come\s+on/i, action: 'LIST_COMMANDS' },
    { pattern: /at\s+least\s+come/i, action: 'LIST_COMMANDS' },
    { pattern: /less\s+comm/i, action: 'LIST_COMMANDS' },
    { pattern: /which\s+comm/i, action: 'LIST_COMMANDS' },
    { pattern: /what\s+comm/i, action: 'LIST_COMMANDS' },

    // Open apps
    { pattern: /open\s+(chrome|google\s*chrome)/i, action: 'OPEN_CHROME' },
    { pattern: /open\s+notepad/i, action: 'OPEN_NOTEPAD' },
    { pattern: /(?:open|launch|start|run)\s+(.+)/i, action: 'OPEN_APP', extract: m => m[1] },

    // System
    { pattern: /shut\s*down|turn\s*off\s*(pc|computer|laptop|system)?/i, action: 'SHUTDOWN' },
    { pattern: /restart|reboot/i, action: 'RESTART' },
    { pattern: /lock\s*(screen|pc|computer)?/i, action: 'LOCK' },
    { pattern: /sleep|hibernate/i, action: 'SLEEP' },
    { pattern: /cancel|abort|stop\s+shutdown/i, action: 'CANCEL' },

    // Volume
    { pattern: /volume\s*up|increase\s*volume|louder/i, action: 'VOLUME_UP' },
    { pattern: /volume\s*down|decrease\s*volume|quieter/i, action: 'VOLUME_DOWN' },
    { pattern: /\bmute\b|\bunmute\b/i, action: 'MUTE' },

    // Search
    { pattern: /(?:search|google|look\s*up)\s+(?:for\s+)?(.+)/i, action: 'SEARCH', extract: m => m[1] },
    { pattern: /youtube\s+(.+)/i, action: 'YOUTUBE', extract: m => m[1] },
    { pattern: /(?:go\s+to|visit|open\s+website)\s+(.+)/i, action: 'OPEN_URL', extract: m => m[1] },

    // Time & date
    { pattern: /what(?:'s|\s+is)\s+the\s+time|current\s+time|time\s+now/i, action: 'TIME' },
    { pattern: /what(?:'s|\s+is)\s+the\s+date|today(?:'s)?\s+date/i, action: 'DATE' },
    { pattern: /weather/i, action: 'WEATHER' },
]

// Known command keywords — if transcript contains any of these
// fragments, we ask for confirmation instead of saying "I don't know"
const CONFIRM_PATTERNS = [
    { fragments: [/l[ie]a?s[et]/i, /co[mn]/i], confirm: 'LIST_COMMANDS', phrase: 'list commands' },
    { fragments: [/shut/i], confirm: 'SHUTDOWN', phrase: 'shutdown' },
    { fragments: [/restart/i, /reboot/i], confirm: 'RESTART', phrase: 'restart' },
    { fragments: [/lock/i], confirm: 'LOCK', phrase: 'lock screen' },
    { fragments: [/sleep/i], confirm: 'SLEEP', phrase: 'sleep' },
]

function cleanText(text) {
    return text
        .replace(/\bplease\b/gi, '')
        .replace(/\bcan you\b/gi, '')
        .replace(/\bwould you\b/gi, '')
        .replace(/\baria\s*/gi, '')
        .replace(/\bopen up\b/gi, 'open')
        .trim()
        .replace(/\s+/g, ' ')
}

function tryFuzzyConfirm(text) {
    for (const entry of CONFIRM_PATTERNS) {
        const allMatch = entry.fragments.every(f => f.test(text))
        if (allMatch) return entry
    }
    return null
}

function parseCommand(raw) {
    if (!raw || raw.length < 2) return { action: 'EMPTY', param: null, raw }

    const text = cleanText(raw)
    console.log('[PARSER] Input:', raw, '→ Cleaned:', text)

    // ── Handle pending confirmation (YES / NO) ──
    if (pendingConfirmation) {
        const yesMatch = text.match(/^(yes|yeah|yep|yup|sure|correct|right|go ahead|do it)\.?$/i)
        const noMatch = text.match(/^(no|nope|nah|cancel|never mind|stop)\.?$/i)

        if (yesMatch) {
            const confirmedAction = pendingConfirmation
            pendingConfirmation = null
            console.log('[PARSER] Confirmed:', confirmedAction)
            return { action: confirmedAction, param: null, raw, matched: true, confirmed: true }
        }

        if (noMatch) {
            pendingConfirmation = null
            return { action: 'CONFIRM_NO', param: null, raw, matched: true }
        }
    }

    // ── Normal intent matching ──
    for (const intent of intents) {
        const match = text.match(intent.pattern)
        if (match) {
            const result = {
                action: intent.action,
                param: intent.extract ? intent.extract(match).trim() : null,
                raw, matched: true
            }
            console.log('[PARSER] Matched:', result.action, result.param || '')
            return result
        }
    }

    // ── Fuzzy confirmation fallback ──
    const fuzzy = tryFuzzyConfirm(text)
    if (fuzzy) {
        pendingConfirmation = fuzzy.confirm
        console.log('[PARSER] Fuzzy confirm for:', fuzzy.phrase)
        return {
            action: 'ASK_CONFIRM',
            param: fuzzy.phrase,
            raw,
            matched: false
        }
    }

    // ── Full fallback ──
    return { action: 'AI_FALLBACK', param: text, raw, matched: false }
}

module.exports = { parseCommand }