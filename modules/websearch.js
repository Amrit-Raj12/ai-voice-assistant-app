const https = require('https')

// Free DuckDuckGo search — no API key needed
function searchWeb(query) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(query)
    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`

    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          const results = []

          // Abstract (Wikipedia-style summary)
          if (parsed.AbstractText && parsed.AbstractText.length > 20) {
            results.push(parsed.AbstractText)
          }

          // Related topics
          if (parsed.RelatedTopics && parsed.RelatedTopics.length > 0) {
            parsed.RelatedTopics.slice(0, 3).forEach(topic => {
              if (topic.Text && topic.Text.length > 10) {
                results.push(topic.Text)
              }
            })
          }

          // Answer (instant answer)
          if (parsed.Answer) {
            results.unshift(parsed.Answer)
          }

          console.log('[SEARCH] Results found:', results.length)
          resolve(results.length > 0 ? results : null)
        } catch(e) {
          console.error('[SEARCH] Parse error:', e.message)
          resolve(null)
        }
      })
    })

    req.on('error', (e) => {
      console.error('[SEARCH] Error:', e.message)
      resolve(null)
    })

    req.setTimeout(8000, () => {
      req.destroy()
      resolve(null)
    })
  })
}

// Search for latest news using DuckDuckGo news
function searchNews(query) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(query + ' latest news 2025')
    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`

    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          const results = []

          if (parsed.AbstractText) results.push(parsed.AbstractText)
          if (parsed.Answer)       results.unshift(parsed.Answer)

          parsed.RelatedTopics?.slice(0, 4).forEach(t => {
            if (t.Text) results.push(t.Text)
          })

          resolve(results.length > 0 ? results : null)
        } catch(e) {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.setTimeout(8000, () => { req.destroy(); resolve(null) })
  })
}

module.exports = { searchWeb, searchNews }