const http = require('http')

const OLLAMA_URL  = 'http://localhost:11434'
const MODEL_NAME  = 'phi3'   // change to 'mistral' or 'llama3' if you pulled those

// Check if Ollama is running
function isOllamaRunning() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_URL}/api/tags`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => { req.destroy(); resolve(false) })
  })
}

// Query Ollama with a system prompt tuned for voice assistant
function queryLocalAI(userInput) {
  return new Promise(async (resolve) => {
    const running = await isOllamaRunning()
    if (!running) {
      return resolve(
        'My AI brain is offline right now. Please make sure Ollama is running by typing ollama serve in a terminal.'
      )
    }

    const body = JSON.stringify({
      model: MODEL_NAME,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 80,    // keep responses short for voice
        top_p: 0.9,
      },
      system: `You are ARIA, a helpful voice assistant on Windows.
Your answers must follow these rules strictly:
- Reply in 1 to 3 short sentences only. Never more.
- Never use bullet points, markdown, asterisks, or formatting.
- Speak naturally as if talking out loud.
- Address the user as Amrit.
- If you don't know something, say so honestly in one sentence.
- Never repeat the question back.`,
      prompt: userInput
    })

    const options = {
      hostname: 'localhost',
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          const response = (parsed.response || '').trim()

          // Clean up any markdown that slips through
          const clean = response
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/#+\s/g, '')
            .replace(/`/g, '')
            .replace(/\n+/g, ' ')
            .trim()

          console.log('[AI] Response:', clean)
          resolve(clean || 'I am not sure about that Amrit.')
        } catch(e) {
          console.error('[AI] Parse error:', e.message)
          resolve('I had trouble thinking about that. Please try again.')
        }
      })
    })

    req.on('error', (e) => {
      console.error('[AI] Request error:', e.message)
      resolve('I could not connect to my AI brain right now.')
    })

    req.setTimeout(15000, () => {
      req.destroy()
      resolve('That took too long to think about. Please try a simpler question.')
    })

    req.write(body)
    req.end()
  })
}

module.exports = { queryLocalAI, isOllamaRunning }