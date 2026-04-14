const { exec, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const WHISPER_PATH = 'E:/voice-assisstant-app/whisper.cpp/build/bin/Release/whisper-cli.exe'
const MODEL_PATH = 'E:/voice-assisstant-app/whisper.cpp/models/ggml-base.en.bin'
const TMP_DIR = path.join(__dirname, '../tmp')
const TMP_WAV = path.join(TMP_DIR, 'input.wav')

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

function recordWithMCI(durationSec) {
    return new Promise((resolve, reject) => {
        console.log('[STT] Recording', durationSec, 'sec...')

        // Delete old wav
        if (fs.existsSync(TMP_WAV)) {
            try { fs.unlinkSync(TMP_WAV) } catch (e) { }
        }

        // Use Windows path with backslashes
        const wavWin = TMP_WAV.split('/').join('\\').split(path.sep).join('\\')
        console.log('[STT] Will save to:', wavWin)

        const scriptPath = path.join(TMP_DIR, 'record.ps1')

        // Write script using array join to avoid any template literal issues
        const lines = [
            'Add-Type @"',
            'using System;',
            'using System.Runtime.InteropServices;',
            'public class MCIAPI {',
            '    [DllImport("winmm.dll")]',
            '    public static extern int mciSendString(string cmd, System.Text.StringBuilder ret, int retLen, IntPtr hwnd);',
            '}',
            '"@',
            'function MciSend([string]$c) {',
            '    [MCIAPI]::mciSendString($c, [System.Text.StringBuilder]::new(256), 256, [IntPtr]::Zero) | Out-Null',
            '}',
            'MciSend "open new type waveaudio alias mymic"',
            'MciSend "set mymic time format milliseconds"',
            'MciSend "set mymic channels 1 samplespersec 16000 bitspersample 16"',
            'MciSend "record mymic"',
            'Start-Sleep -Seconds ' + durationSec,
            'MciSend "stop mymic"',
            'MciSend "save mymic ' + wavWin + '"',
            'MciSend "close mymic"',
            'Write-Host "DONE"',
        ]

        fs.writeFileSync(scriptPath, lines.join('\r\n'), 'utf8')
        console.log('[STT] Script written to:', scriptPath)
        console.log('[STT] Script content:\n', lines.join('\n'))

        const proc = spawn('powershell', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath
        ])

        proc.stdout.on('data', d => {
            const msg = d.toString().trim()
            console.log('[MCI OUT]', msg)
        })

        proc.stderr.on('data', d => {
            const msg = d.toString().trim()
            if (msg) console.error('[MCI ERR]', msg)
        })

        proc.on('error', err => {
            reject(new Error('PowerShell failed to start: ' + err.message))
        })

        proc.on('close', (code) => {
            console.log('[STT] PS1 exited code:', code)
            console.log('[STT] WAV exists after recording:', fs.existsSync(TMP_WAV))
            setTimeout(resolve, 1000)
        })

        // Safety kill
        setTimeout(() => {
            try { proc.kill() } catch (e) { }
            setTimeout(resolve, 500)
        }, (durationSec + 10) * 1000)
    })
}

function transcribe() {
    return new Promise((resolve, reject) => {
        console.log('[STT] Checking for WAV at:', TMP_WAV)
        console.log('[STT] File exists:', fs.existsSync(TMP_WAV))

        if (!fs.existsSync(TMP_WAV)) {
            return reject(new Error(
                'Recording failed — WAV not created.\n' +
                'Path: ' + TMP_WAV
            ))
        }

        const stat = fs.statSync(TMP_WAV)
        console.log('[STT] WAV size:', stat.size, 'bytes')

        if (stat.size < 5000) {
            return resolve('No audio detected — check microphone volume in Windows Sound Settings')
        }

        const cmd = `"${WHISPER_PATH}" -m "${MODEL_PATH}" -f "${TMP_WAV}" --no-timestamps -l en --beam-size 5 --best-of 5 --temperature 0.0 --prompt "list commands, open notepad, open chrome, what is the time, volume up, volume down, shutdown, restart, lock screen, hello, hi, search for, weather, what can you do"`
        console.log('[STT] Running Whisper...')

        exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error('Whisper failed: ' + stderr))

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
            resolve(transcript || 'Could not understand audio')
        })
    })
}

async function recordAndTranscribe(durationMs = 5000) {
    await recordWithMCI(Math.ceil(durationMs / 1000))
    return await transcribe()
}

module.exports = { recordAndTranscribe }