// ── Elements ─────────────────────────────────────────────────────
const micBtn = document.getElementById('micBtn')
const orb = document.getElementById('orb')
const orbIcon = document.getElementById('orbIcon')
const orbRingOuter = document.getElementById('orbRingOuter')
const waveBars = document.getElementById('waveBars')
const statusDot = document.getElementById('statusDot')
const statusText = document.getElementById('statusText')
const transcript = document.getElementById('transcript')
const placeholder = document.getElementById('placeholder')
const settingsBtn = document.getElementById('settingsBtn')
const settingsPanel = document.getElementById('settingsPanel')
const settingsClose = document.getElementById('settingsCloseBtn')

// ── Window controls ───────────────────────────────────────────────
document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.minimize())
document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.close())

// ── Audio engine ──────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext
let audioCtx = null
function getAudioCtx() {
    if (!audioCtx) audioCtx = new AudioCtx()
    return audioCtx
}
function playTone(freq, type, duration, volume) {
    try {
        const ctx = getAudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = type
        osc.frequency.setValueAtTime(freq, ctx.currentTime)
        gain.gain.setValueAtTime(volume, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration)
    } catch (e) { }
}
const sounds = {
    startRecording() {
        playTone(440, 'sine', 0.12, 0.3)
        setTimeout(() => playTone(660, 'sine', 0.2, 0.3), 100)
    },
    listening() { playTone(880, 'sine', 0.08, 0.15); setTimeout(() => playTone(880, 'sine', 0.08, 0.1), 150) },
    processing() { playTone(330, 'triangle', 0.1, 0.1); setTimeout(() => playTone(415, 'triangle', 0.4, 0.1), 80) },
    success() { playTone(523, 'sine', 0.1, 0.2); setTimeout(() => playTone(659, 'sine', 0.1, 0.2), 80); setTimeout(() => playTone(784, 'sine', 0.25, 0.25), 160) },
    openApp() { playTone(200, 'square', 0.05, 0.08); setTimeout(() => playTone(440, 'sine', 0.15, 0.2), 60); setTimeout(() => playTone(880, 'sine', 0.1, 0.15), 130) },
    error() { playTone(440, 'sawtooth', 0.1, 0.15); setTimeout(() => playTone(330, 'sawtooth', 0.2, 0.2), 100) }
}

// ── State ─────────────────────────────────────────────────────────
let isRecording = false
let currentAriaRow = null  // the live streaming message row

function setStatus(state) {
    const labels = { standby: 'STANDBY', listening: 'LISTENING', processing: 'PROCESSING', speaking: 'SPEAKING' }
    orb.className = 'orb ' + (state !== 'standby' ? state : '')
    orbRingOuter.className = 'orb-ring-outer ' + (state !== 'standby' ? state : '')
    orbIcon.textContent = { standby: '◉', listening: '◎', processing: '◌', speaking: '●' }[state] || '◉'
    waveBars.className = 'wave-bars' + (state === 'listening' ? ' active' : '')
    statusDot.className = 'status-dot ' + (state !== 'standby' ? state : '')
    statusText.className = 'status-text ' + (state !== 'standby' ? state : '')
    statusText.textContent = labels[state] || 'STANDBY'
}

function removePlaceholder() {
    if (placeholder && placeholder.parentNode) placeholder.remove()
}

// ── Add a static user message ─────────────────────────────────────
function addUserMessage(text) {
    removePlaceholder()
    const row = document.createElement('div')
    row.className = 'msg-row msg-you'
    row.innerHTML = `<div class="msg-label">▸ YOU</div><div class="msg-text">${text || '(no audio detected)'}</div>`
    transcript.appendChild(row)
    transcript.scrollTop = transcript.scrollHeight
}

// ── Start a streaming ARIA message row ────────────────────────────
function startAriaMessage() {
    removePlaceholder()
    const row = document.createElement('div')
    row.className = 'msg-row msg-aria'

    const lbl = document.createElement('div')
    lbl.className = 'msg-label'
    lbl.textContent = '◉ ARIA'

    const msg = document.createElement('div')
    msg.className = 'msg-text streaming'
    msg.textContent = ''

    // blinking cursor
    const cursor = document.createElement('span')
    cursor.className = 'cursor'
    cursor.textContent = '▋'

    msg.appendChild(cursor)
    row.appendChild(lbl)
    row.appendChild(msg)
    transcript.appendChild(row)
    transcript.scrollTop = transcript.scrollHeight

    currentAriaRow = { row, msg, cursor }
    return currentAriaRow
}

// ── Append a word to the current streaming row ────────────────────
function appendWord(word) {
    if (!currentAriaRow) return
    const { msg, cursor } = currentAriaRow
    // Insert word before cursor
    const wordNode = document.createTextNode(word + ' ')
    msg.insertBefore(wordNode, cursor)
    transcript.scrollTop = transcript.scrollHeight
}

// ── Finish streaming — remove cursor ─────────────────────────────
function finishAriaMessage(isError) {
    if (!currentAriaRow) return
    const { row, msg, cursor } = currentAriaRow
    cursor.remove()
    msg.classList.remove('streaming')
    if (isError) row.className = 'msg-row msg-error'
    currentAriaRow = null
}

// ── Ripple ────────────────────────────────────────────────────────
function createRipple(e) {
    const btn = e.currentTarget
    const ripple = document.createElement('span')
    const rect = btn.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    ripple.className = 'ripple'
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`
    btn.appendChild(ripple)
    setTimeout(() => ripple.remove(), 600)
}

// ── IPC listeners ─────────────────────────────────────────────────

// Status updates from main
window.electronAPI.onStatusUpdate((status) => {
    if (status === 'listening') { setStatus('listening'); sounds.listening() }
    else if (status === 'processing') { setStatus('processing'); sounds.processing() }
    else if (status === 'speaking') { setStatus('speaking') }
    else { setStatus('standby') }
})

// User transcription — show immediately
window.electronAPI.onUserMessage((text) => {
    addUserMessage(text)
    micBtn.classList.remove('active')
    micBtn.innerHTML = '🎙 &nbsp;SPEAK'
    isRecording = false
})

// Streaming ARIA words — word by word in sync with voice
window.electronAPI.onAriaMessage((data) => {
    if (data.start) {
        startAriaMessage()
        sounds.success()
        return
    }

    if (data.block) {
        // Full block — render all at once (used for LIST_COMMANDS)
        if (!currentAriaRow) startAriaMessage()
        const { msg, cursor } = currentAriaRow
        cursor.remove()
        msg.textContent = data.block
        msg.classList.remove('streaming')
        currentAriaRow = null
        transcript.scrollTop = transcript.scrollHeight
        return
    }

    if (data.text) appendWord(data.text)

    if (data.done) {
        finishAriaMessage(false)
        setStatus('standby')
    }
})
// Goodbye
window.electronAPI.onGoodbye((msg) => {
    startAriaMessage()
    const words = msg.split(' ')
    words.forEach((w, i) => {
        setTimeout(() => {
            appendWord(w)
            if (i === words.length - 1) finishAriaMessage(false)
        }, i * 460)
    })
    setStatus('speaking')
    micBtn.disabled = true
    micBtn.textContent = 'GOODBYE...'
})

// ── Mic button ────────────────────────────────────────────────────
micBtn.addEventListener('click', async (e) => {
    if (isRecording) return
    isRecording = true

    createRipple(e)
    sounds.startRecording()
    micBtn.classList.add('active')
    micBtn.textContent = '⏹  RECORDING...'

    const { intent, error } = await window.electronAPI.processVoice()

    if (error) {
        sounds.error()
        if (currentAriaRow) finishAriaMessage(true)
        setStatus('standby')
        isRecording = false
        micBtn.classList.remove('active')
        micBtn.innerHTML = '🎙 &nbsp;SPEAK'
    }
    // Note: isRecording reset happens in onUserMessage callback
})

// ── Settings ──────────────────────────────────────────────────────
settingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none'
})
settingsClose.addEventListener('click', () => {
    settingsPanel.style.display = 'none'
})
document.addEventListener('click', (e) => {
    if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
        settingsPanel.style.display = 'none'
    }
})