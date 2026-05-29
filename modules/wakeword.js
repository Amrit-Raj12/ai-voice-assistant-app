const { exec, spawn } = require('child_process')
const fs   = require('fs')
const path = require('path')

const WHISPER_PATH = 'E:/voice-assisstant-app/whisper.cpp/build/bin/Release/whisper-cli.exe'
const MODEL_PATH   = 'E:/voice-assisstant-app/whisper.cpp/models/ggml-base.en.bin'
const TMP_DIR      = path.join(__dirname, '../tmp')
const WAKE_WAV     = path.join(TMP_DIR, 'wake.wav')

// Wake word variations Whisper might transcribe
const WAKE_WORDS = [
  'hey aria',
  'hey era',
  'hey area',
  'hey arya',
  'hi aria',
  'hi era',
  'okay aria',
  'ok aria',
  'hey are ya',
  'aria',
]

let isListeningForWake = false
let isProcessingCommand = false
let wakeCallback = null
let stopRequested = false
let currentProc = null

function containsWakeWord(text) {
  const lower = text.toLowerCase().trim()
  return WAKE_WORDS.some(w => lower.includes(w))
}

// Record a short clip and check if it contains the wake word
function recordAndCheck(durationSec) {
  return new Promise((resolve) => {
    if (stopRequested) return resolve(false)
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
    if (fs.existsSync(WAKE_WAV)) {
      try { fs.unlinkSync(WAKE_WAV) } catch(e) {}
    }

    const wavWin   = WAKE_WAV.replace(/\//g, '\\')
    const script   = path.join(TMP_DIR, 'wake_record.ps1')
    const lines    = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class WAKEMCI {',
      '    [DllImport("winmm.dll")]',
      '    public static extern int mciSendString(string cmd, System.Text.StringBuilder ret, int retLen, IntPtr hwnd);',
      '}',
      '"@',
      'function S([string]$c) { [WAKEMCI]::mciSendString($c, [System.Text.StringBuilder]::new(128), 128, [IntPtr]::Zero) | Out-Null }',
      'S "open new type waveaudio alias wmic"',
      'S "set wmic time format milliseconds"',
      'S "set wmic channels 1 samplespersec 16000 bitspersample 16"',
      'S "record wmic"',
      `Start-Sleep -Seconds ${durationSec}`,
      'S "stop wmic"',
      `S "save wmic ${wavWin}"`,
      'S "close wmic"',
    ]

    fs.writeFileSync(script, lines.join('\r\n'), 'utf8')

    const proc = spawn('powershell', [
      '-NoProfile', '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', script
    ])

    currentProc = proc
    proc.on('close', () => {
      currentProc = null
      if (stopRequested) return resolve(false)

      if (!fs.existsSync(WAKE_WAV) || fs.statSync(WAKE_WAV).size < 1000) {
        return resolve(false)
      }

      // Run whisper on the short clip
      const cmd = `"${WHISPER_PATH}" -m "${MODEL_PATH}" -f "${WAKE_WAV}" --no-timestamps -l en --beam-size 1 --best-of 1 --temperature 0`
      exec(cmd, { timeout: 10000 }, (err, stdout) => {
        if (err || stopRequested) return resolve(false)
        const text = stdout
          .split('\n')
          .map(l => l.trim())
          .filter(l =>
            l.length > 0 &&
            !l.startsWith('whisper_') &&
            !l.startsWith('main:') &&
            !l.startsWith('system_info') &&
            !l.startsWith('ggml_') &&
            !l.match(/^\[.*-->.*\]/)
          )
          .join(' ')
          .trim()

        console.log('[WAKE] Heard:', text || '(silence)')
        resolve(containsWakeWord(text))
      })
    })

    proc.on('error', () => resolve(false))

    // Safety timeout
    setTimeout(() => {
      try { proc.kill() } catch(e) {}
      resolve(false)
    }, (durationSec + 8) * 1000)
  })
}

// Continuous loop — listens in 2-second chunks
async function startWakeWordLoop(onWake) {
  isListeningForWake = true
  stopRequested      = false
  wakeCallback       = onWake

  console.log('[WAKE] Wake word detection started — say "Hey ARIA"')

  while (isListeningForWake && !stopRequested) {
    // Skip if a command is being processed
    if (isProcessingCommand) {
      await sleep(500)
      continue
    }

    const detected = await recordAndCheck(2)

    if (detected && !isProcessingCommand && !stopRequested) {
      console.log('[WAKE] Wake word detected!')
      if (wakeCallback) wakeCallback()
    }
  }

  console.log('[WAKE] Wake word loop stopped')
}

function stopWakeWordLoop() {
  isListeningForWake = false
  stopRequested      = true
  if (currentProc) {
    try { currentProc.kill() } catch(e) {}
  }
}

function setProcessingCommand(val) {
  isProcessingCommand = val
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

module.exports = {
  startWakeWordLoop,
  stopWakeWordLoop,
  setProcessingCommand
}