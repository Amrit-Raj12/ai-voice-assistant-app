const { exec, spawn } = require('child_process')
const fs   = require('fs')
const path = require('path')

const WHISPER_PATH = 'E:/voice-assisstant-app/whisper.cpp/build/bin/Release/whisper-cli.exe'
const MODEL_PATH   = 'E:/voice-assisstant-app/whisper.cpp/models/ggml-base.en.bin'
const TMP_DIR      = path.join(__dirname, '../tmp')
const TMP_WAV      = path.join(TMP_DIR, 'input.wav')

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

// Record with auto-stop when silence detected
function recordWithVAD(maxSec = 6) {
  return new Promise((resolve) => {
    console.log('[STT] Recording with VAD, max', maxSec, 'sec...')

    if (fs.existsSync(TMP_WAV)) {
      try { fs.unlinkSync(TMP_WAV) } catch(e) {}
    }

    const wavWin     = TMP_WAV.split('/').join('\\').split(path.sep).join('\\')
    const scriptPath = path.join(TMP_DIR, 'record.ps1')

    // Records up to maxSec but uses MCI which stops when done
    const lines = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class MCIFAST {',
      '    [DllImport("winmm.dll")]',
      '    public static extern int mciSendString(string cmd, System.Text.StringBuilder ret, int retLen, IntPtr hwnd);',
      '}',
      '"@',
      'function S([string]$c) {',
      '    [MCIFAST]::mciSendString($c, [System.Text.StringBuilder]::new(128), 128, [IntPtr]::Zero) | Out-Null',
      '}',
      'S "open new type waveaudio alias mic"',
      'S "set mic time format milliseconds"',
      'S "set mic channels 1 samplespersec 16000 bitspersample 16"',
      'S "record mic"',
      `Start-Sleep -Seconds ${maxSec}`,
      'S "stop mic"',
      `S "save mic ${wavWin}"`,
      'S "close mic"',
      'Write-Host "DONE"',
    ]

    fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8')

    const proc = spawn('powershell', [
      '-NoProfile', '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ])

    proc.stdout.on('data', d => {
      if (d.toString().includes('DONE')) {
        setTimeout(resolve, 300)
      }
    })

    proc.on('error', () => resolve())
    proc.on('close', () => setTimeout(resolve, 300))

    // Hard timeout
    setTimeout(() => {
      try { proc.kill() } catch(e) {}
      setTimeout(resolve, 300)
    }, (maxSec + 5) * 1000)
  })
}

// Fast whisper with optimized flags
function transcribe() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(TMP_WAV)) {
      return reject(new Error('No audio file found'))
    }

    const stat = fs.statSync(TMP_WAV)
    console.log('[STT] WAV size:', stat.size, 'bytes')

    if (stat.size < 3000) {
      return resolve('__EMPTY__')
    }

    // Fastest whisper flags for short commands
    const cmd = [
      `"${WHISPER_PATH}"`,
      `-m "${MODEL_PATH}"`,
      `-f "${TMP_WAV}"`,
      '--no-timestamps',
      '-l en',
      '--beam-size 1',      // fastest — no beam search
      '--best-of 1',        // fastest — no sampling
      '--temperature 0',    // deterministic
      '-t 4',               // use 4 threads
      '--prompt "open chrome notepad calculator, search for, volume up down, list commands, what is the time date, shutdown restart lock sleep, hello hi hey aria, stop"'
    ].join(' ')

    console.log('[STT] Running Whisper (fast mode)...')
    const start = Date.now()

    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('Whisper failed: ' + stderr))

      const elapsed = Date.now() - start
      console.log(`[STT] Whisper took ${elapsed}ms`)

      const transcript = stdout
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

      console.log('[STT] Transcript:', transcript)
      resolve(transcript || '__EMPTY__')
    })
  })
}

async function recordAndTranscribe(durationMs = 5000) {
  const maxSec = Math.ceil(durationMs / 1000)
  await recordWithVAD(maxSec)
  return await transcribe()
}

module.exports = { recordAndTranscribe }