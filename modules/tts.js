const { exec } = require('child_process')
const { spawn } = require('child_process')
const fs   = require('fs')
const path = require('path')

let currentSpeakProc = null

function speak(text) {
  return new Promise((resolve) => {
    // Kill any currently speaking process
    if (currentSpeakProc) {
      try { currentSpeakProc.kill() } catch(e) {}
      currentSpeakProc = null
    }

    const clean = text
      .replace(/[◉▸✕★]/g, '')
      .replace(/\n/g, ' ')
      .replace(/"/g, "'")
      .trim()

    if (!clean) return resolve()

    const scriptPath = path.join(__dirname, '../tmp/speak.ps1')
    const script = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 1
$synth.Volume = 90
$synth.SelectVoiceByHints('Female')
$synth.Speak("${clean.replace(/"/g, "'")}")
`
    fs.writeFileSync(scriptPath, script, 'utf8')

    const proc = spawn('powershell', [
      '-NoProfile', '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ])

    currentSpeakProc = proc

    proc.on('close', () => {
      currentSpeakProc = null
      resolve()
    })
    proc.on('error', () => {
      currentSpeakProc = null
      resolve()
    })
  })
}

function stopSpeaking() {
  if (currentSpeakProc) {
    try { currentSpeakProc.kill() } catch(e) {}
    currentSpeakProc = null
    console.log('[TTS] Stopped speaking')
  }
}

module.exports = { speak, stopSpeaking }