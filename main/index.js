const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('path')
const http  = require('http')
const { exec } = require('child_process')

const { setupAutostart, disableAutostart }                         = require('./autostart')
const { recordAndTranscribe }                                      = require('../modules/stt')
const { parseCommand }                                             = require('../modules/parser')
const { handleAction }                                             = require('../modules/actions')
const { speak, stopSpeaking  }                                                    = require('../modules/tts')
const { isOllamaRunning }                                          = require('../modules/localai')
const { startWakeWordLoop, stopWakeWordLoop, setProcessingCommand } = require('../modules/wakeword')

let mainWindow
let isQuitting = false

// ── Auto-start Ollama ─────────────────────────────────────────────
function startOllama() {
  return new Promise((resolve) => {
    console.log('[OLLAMA] Checking if running...')

    const check = http.get('http://localhost:11434/api/tags', (res) => {
      if (res.statusCode === 200) {
        console.log('[OLLAMA] Already running')
        resolve(true)
      }
    })

    check.on('error', () => {
      console.log('[OLLAMA] Not running — starting ollama serve...')

      const proc = exec('ollama serve')
      proc.unref()

      proc.stderr?.on('data', d => {
        const msg = d.toString()
        if (msg.includes('address already in use')) {
          console.log('[OLLAMA] Already running (port busy)')
          resolve(true)
        }
      })

      // Poll every second until Ollama responds
      let attempts = 0
      const poll = setInterval(() => {
        attempts++
        const req = http.get('http://localhost:11434/api/tags', (res) => {
          if (res.statusCode === 200) {
            clearInterval(poll)
            console.log('[OLLAMA] Started after', attempts, 'attempts')
            resolve(true)
          }
        })
        req.on('error', () => {})

        if (attempts >= 15) {
          clearInterval(poll)
          console.log('[OLLAMA] Failed to start after 15 attempts')
          resolve(false)
        }
      }, 1000)
    })

    check.setTimeout(2000, () => check.destroy())
  })
}

// ── Create window ─────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420, height: 680,
    frame: false,
    transparent: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  // ── Startup greeting + init ───────────────────────────────────
  mainWindow.webContents.once('did-finish-load', async () => {
    const hour = new Date().getHours()
    let greeting

    if      (hour >= 5  && hour < 12) greeting = `Good morning Amrit! I am ARIA, your personal voice assistant. I am ready to help you. Have a productive day!`
    else if (hour >= 12 && hour < 17) greeting = `Good afternoon Amrit! I am ARIA, your personal voice assistant. I am ready to assist you whenever you need.`
    else if (hour >= 17 && hour < 21) greeting = `Good evening Amrit! I am ARIA, your personal voice assistant. How can I make your evening easier?`
    else                              greeting = `Good night Amrit! I am ARIA, your personal voice assistant. Working late? I am here to help.`

    // Send Ollama status to UI
    isOllamaRunning().then(running => {
      console.log('[MAIN] Ollama status for UI:', running)
      mainWindow.webContents.send('ollama-status', running)

      // Recheck every 10 seconds until online
      const statusInterval = setInterval(async () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          clearInterval(statusInterval)
          return
        }
        const r = await isOllamaRunning()
        mainWindow.webContents.send('ollama-status', r)
        if (r) clearInterval(statusInterval)
      }, 10000)
    })

    // Startup greeting
    setTimeout(async () => {
      mainWindow.webContents.send('aria-message', { start: true })
      await Promise.all([
        speak(greeting),
        streamWords(greeting, mainWindow)
      ])
      mainWindow.webContents.send('status-update', 'idle')

      // Start wake word AFTER greeting finishes
      startWakeWordLoop(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
        mainWindow.webContents.send('wake-word-detected')
        triggerVoicePipeline()
      })

    }, 1500)
  })
}

// ── App ready ─────────────────────────────────────────────────────
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'media')
  })

  // Start Ollama before window
  console.log('[MAIN] Starting Ollama...')
  const ollamaReady = await startOllama()
  console.log('[MAIN] Ollama ready:', ollamaReady)

  createWindow()
  try { setupAutostart() } catch(e) {}

  // Pre-warm Ollama — send a tiny request so first real query is fast
  if (ollamaReady) {
    console.log('[MAIN] Pre-warming Ollama...')
    const { queryLocalAI } = require('../modules/localai')
    queryLocalAI('hi').catch(() => {}) // fire and forget
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Goodbye on close ──────────────────────────────────────────────
app.on('before-quit', async (e) => {
  if (isQuitting) return
  e.preventDefault()
  isQuitting = true
  stopWakeWordLoop()

  const hour = new Date().getHours()
  let bye
  if      (hour >= 21 || hour < 5) bye = 'Goodnight Amrit! Have a great rest. See you tomorrow!'
  else if (hour < 12)              bye = 'Goodbye Amrit! Have a wonderful morning. See you soon!'
  else if (hour < 17)              bye = 'Goodbye Amrit! Have a great afternoon. Take care!'
  else                             bye = 'Goodbye Amrit! Have a lovely evening. See you next time!'

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('goodbye-message', bye)
  }

  await speak(bye)
  app.exit(0)
})

// ── IPC handlers ──────────────────────────────────────────────────
ipcMain.on('minimize-window',  () => mainWindow.minimize())
ipcMain.on('close-window',     () => app.quit())
ipcMain.on('toggle-autostart', (_, enabled) => {
  enabled ? setupAutostart() : disableAutostart()
})

// Single process-voice handler
ipcMain.handle('process-voice', async () => {
  await triggerVoicePipeline()
  return { error: null }
})

// ── Voice pipeline ────────────────────────────────────────────────
async function triggerVoicePipeline() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  setProcessingCommand(true)

  try {
    mainWindow.webContents.send('status-update', 'listening')
    const text = await recordAndTranscribe(4000)

    // Skip processing if nothing was heard
    if (!text || text === '__EMPTY__' || text.trim().length < 2) {
      mainWindow.webContents.send('user-message', '(nothing heard)')
      mainWindow.webContents.send('aria-message', { start: true })
      const msg = 'I did not hear anything Amrit. Please try again.'
      await Promise.all([
        speak(msg),
        streamWords(msg, mainWindow)
      ])
      mainWindow.webContents.send('status-update', 'idle')
      mainWindow.webContents.send('pipeline-done')
      return
    }

    mainWindow.webContents.send('status-update', 'processing')
    const intent = parseCommand(text)
    const result = await handleAction(intent)

    // ── Handle STOP signal ──────────────────────────────────────
    if (result === '__STOP__') {
      console.log('[MAIN] Stop command received')
      stopSpeaking()
      mainWindow.webContents.send('user-message', text)
      mainWindow.webContents.send('stop-signal')
      mainWindow.webContents.send('status-update', 'idle')
      mainWindow.webContents.send('pipeline-done')

      // Kill any running TTS
      exec('taskkill /F /IM powershell.exe /FI "WINDOWTITLE eq speak*"', () => {})
      return
    }

    mainWindow.webContents.send('status-update', 'speaking')
    mainWindow.webContents.send('user-message', text)

    const voiceText = intent.action === 'LIST_COMMANDS'
      ? buildVoiceListCommands()
      : result

    if (intent.action === 'LIST_COMMANDS') {
      mainWindow.webContents.send('aria-message', { start: true })
      await Promise.all([
        speak(voiceText),
        new Promise(resolve => {
          setTimeout(() => {
            mainWindow.webContents.send('aria-message', { block: result })
            resolve()
          }, 800)
        })
      ])
    } else {
      await Promise.all([
        speak(voiceText),
        streamWords(result, mainWindow)
      ])
    }

    mainWindow.webContents.send('status-update', 'idle')
    mainWindow.webContents.send('pipeline-done')

  } catch (err) {
    console.error('[MAIN] Pipeline error:', err.message)
    mainWindow.webContents.send('status-update', 'idle')
    speak('Sorry Amrit, something went wrong.').catch(() => {})
    mainWindow.webContents.send('aria-message', { text: err.message, done: true })
  } finally {
    setProcessingCommand(false)
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function streamWords(text, win) {
  return new Promise((resolve) => {
    const words      = text.split(' ').filter(w => w.length > 0)
    const MS_PER_WORD = 60000 / 130

    win.webContents.send('aria-message', { text: '', done: false, start: true })

    words.forEach((word, i) => {
      setTimeout(() => {
        win.webContents.send('aria-message', {
          text: word,
          done: i === words.length - 1
        })
        if (i === words.length - 1) resolve()
      }, i * MS_PER_WORD)
    })

    setTimeout(resolve, words.length * MS_PER_WORD + 2000)
  })
}

function buildVoiceListCommands() {
  return `Here are the commands I am capable of handling.
Say hi or hello and I will greet you back.
Say open followed by any app name to open it.
Say search for followed by your query to search Google.
Say youtube followed by what you want to search on YouTube.
Say go to followed by a website name to open it.
Say what is the time to get the current time.
Say what is the date to get today's date.
Say weather to open the weather forecast.
Say volume up, volume down, or mute to control volume.
Say sleep, lock screen, restart, or shutdown for system controls.
Say list commands to hear this list again.`
}