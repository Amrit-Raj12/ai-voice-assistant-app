const { exec } = require('child_process')

function speak(text) {
    return new Promise((resolve) => {
        // Clean text for speech
        const clean = text
            .replace(/[◉▸✕]/g, '')
            .replace(/"/g, "'")
            .trim()

        const script = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 1
$synth.Volume = 90
$synth.SelectVoiceByHints('Female')
$synth.Speak("${clean.replace(/"/g, "'")}")
`
        const scriptPath = require('path').join(__dirname, '../tmp/speak.ps1')
        require('fs').writeFileSync(scriptPath, script, 'utf8')

        const proc = require('child_process').spawn('powershell', [
            '-NoProfile', '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath
        ])

        proc.on('close', resolve)
        proc.on('error', resolve) // don't crash if TTS fails
    })
}

module.exports = { speak }