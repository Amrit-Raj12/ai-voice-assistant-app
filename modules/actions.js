const { exec } = require('child_process')
const { speak } = require('./tts')

const APP_ALIASES = {
    'chrome': 'chrome',
    'google chrome': 'chrome',
    'brave': 'brave',
    'brave browser': 'brave',
    'firefox': 'firefox',
    'edge': 'msedge',
    'microsoft edge': 'msedge',
    'notepad': 'notepad',
    'calculator': 'calc',
    'calc': 'calc',
    'paint': 'mspaint',
    'cmd': 'cmd',
    'command prompt': 'cmd',
    'terminal': 'wt',
    'windows terminal': 'wt',
    'explorer': 'explorer',
    'file explorer': 'explorer',
    'task manager': 'taskmgr',
    'control panel': 'control',
    'settings': 'ms-settings:',
    'word': 'winword',
    'excel': 'excel',
    'powerpoint': 'powerpnt',
    'outlook': 'outlook',
    'vlc': 'vlc',
    'spotify': 'spotify',
    'vs code': 'code',
    'vscode': 'code',
    'visual studio code': 'code',
    'postman': 'postman',
    'discord': 'discord',
    'telegram': 'telegram',
    'whatsapp': 'whatsapp',
    'zoom': 'zoom',
    'teams': 'teams',
    'slack': 'slack',
    'obs': 'obs64',
    'steam': 'steam',
}

const COMMANDS_LIST = [
    'Say hi or hello — I will greet you back',
    'Open an app — say open notepad, open chrome, open calculator',
    'Search the web — say search for something',
    'Open YouTube — say youtube followed by what you want',
    'Visit a website — say go to and the website name',
    'Check the time — say what is the time',
    'Check the date — say what is the date',
    'Check weather — say weather',
    'Control volume — say volume up, volume down, or mute',
    'Shutdown — say shutdown',
    'Restart — say restart',
    'Lock screen — say lock screen',
    'Sleep — say sleep',
    'List commands — say list commands or what can you do',
]

function getGreeting() {
    const h = new Date().getHours()
    if (h >= 5 && h < 12) return 'Good morning'
    if (h >= 12 && h < 17) return 'Good afternoon'
    if (h >= 17 && h < 21) return 'Good evening'
    return 'Good night'
}

function tryExec(cmd) {
    return new Promise((resolve) => {
        exec(cmd, (err) => resolve(!err))
    })
}

async function openApp(param) {
    const lower = (param || '').toLowerCase().trim()

    // Resolve alias
    let exe = null
    if (APP_ALIASES[lower]) {
        exe = APP_ALIASES[lower]
    } else {
        for (const [key, val] of Object.entries(APP_ALIASES)) {
            if (lower.includes(key) || key.includes(lower)) {
                exe = val
                break
            }
        }
    }

    if (!exe) exe = lower

    // Try to open
    const success = await tryExec(`start "" "${exe}"`)
    if (success) return { ok: true, msg: `Opening ${param}` }

    // Try without quotes
    const success2 = await tryExec(`start ${exe}`)
    if (success2) return { ok: true, msg: `Opening ${param}` }

    return {
        ok: false,
        msg: `I couldn't find ${param} on your system. Please make sure it is installed and try again.`
    }
}

async function handleAction({ action, param }) {
    console.log('[ACTION]', action, param)

    switch (action) {

        // ── Greet ──────────────────────────────────────────────────
        case 'GREET': {
            const greeting = getGreeting()
            const response = `${greeting} Amrit! I am ARIA, your personal voice assistant. How can I assist you today?`
            return response
        }

        // ── Commands list ──────────────────────────────────────────
        case 'LIST_COMMANDS': {
            return [
                '📋 COMMANDS I CAN HANDLE:',
                '',
                '  1.  👋  "Hi" or "Hello"  →  I greet you back',
                '  2.  📂  "Open [app]"  →  opens any installed app',
                '  3.  🔍  "Search for [query]"  →  Google search',
                '  4.  ▶️   "YouTube [query]"  →  search YouTube',
                '  5.  🌐  "Go to [website]"  →  open any website',
                '  6.  🕐  "What is the time"  →  current time',
                '  7.  📅  "What is the date"  →  today\'s date',
                '  8.  🌤️  "Weather"  →  opens forecast',
                '  9.  🔊  "Volume up / down / mute"',
                '  10. 💤  "Sleep"  →  sleep mode',
                '  11. 🔒  "Lock screen"  →  locks your PC',
                '  12. 🔄  "Restart"  →  restarts your PC',
                '  13. ⛔  "Shutdown"  →  shuts down your PC',
                '  14. 📋  "List commands"  →  shows this list',
            ].join('\n')
        }

        // ── Open apps ──────────────────────────────────────────────
        case 'OPEN_CHROME': {
            const r = await openApp('chrome')
            return r.msg
        }

        case 'OPEN_NOTEPAD': {
            const r = await openApp('notepad')
            return r.msg
        }

        case 'OPEN_APP': {
            const r = await openApp(param)
            return r.msg
        }

        case 'OPEN_URL': {
            const url = param.startsWith('http') ? param : 'https://' + param
            exec(`start ${url}`)
            return `Opening ${url}`
        }

        // ── System ─────────────────────────────────────────────────
        case 'SHUTDOWN':
            exec('shutdown /s /t 30')
            return 'Shutting down in 30 seconds. Say cancel to abort.'

        case 'RESTART':
            exec('shutdown /r /t 30')
            return 'Restarting in 30 seconds. Say cancel to abort.'

        case 'LOCK':
            exec('rundll32.exe user32.dll,LockWorkStation')
            return 'Locking your screen now.'

        case 'SLEEP':
            exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0')
            return 'Going to sleep. Goodbye for now.'

        case 'CANCEL':
            exec('shutdown /a')
            return 'Shutdown has been cancelled.'

        // ── Volume ─────────────────────────────────────────────────
        case 'VOLUME_UP':
            exec('nircmd changesysvolume 5000')
            return 'Volume increased.'

        case 'VOLUME_DOWN':
            exec('nircmd changesysvolume -5000')
            return 'Volume decreased.'

        case 'MUTE':
            exec('nircmd mutesysvolume 2')
            return 'Volume toggled.'

        // ── Search ─────────────────────────────────────────────────
        case 'SEARCH':
            exec(`start https://www.google.com/search?q=${encodeURIComponent(param)}`)
            return `Searching Google for ${param}`

        case 'YOUTUBE':
            exec(`start https://www.youtube.com/results?search_query=${encodeURIComponent(param)}`)
            return `Searching YouTube for ${param}`

        // ── Info ───────────────────────────────────────────────────
        case 'TIME':
            return `The current time is ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`

        case 'DATE':
            return `Today is ${new Date().toLocaleDateString('en-IN', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            })}`

        case 'WEATHER':
            exec('start https://wttr.in')
            return 'Opening weather forecast for you.'

        // ── Fallback ───────────────────────────────────────────────
        case 'EMPTY':
            return `I didn't catch that, Amrit. Could you please repeat?`

        case 'AI_FALLBACK': {
            try {
                const { queryLocalAI } = require('./localai')
                return await queryLocalAI(param)
            } catch {
                return `I heard you say "${param}", but I am not sure how to help with that yet. Try saying list commands to see what I can do.`
            }
        }

        // ── Confirmation ask ───────────────────────────────────────────
        case 'ASK_CONFIRM': {
            return `Did you say ${param}? Please say yes to confirm or no to cancel.`
        }

        case 'CONFIRM_NO': {
            return `Okay Amrit, no problem. What else can I help you with?`
        }

        default:
            return `I don't know how to handle that command yet.`
    }
}

module.exports = { handleAction }