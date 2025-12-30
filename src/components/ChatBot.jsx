import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import './ChatBot.css'

export default function ChatBot({ visits, metadata }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your location data assistant. Ask me anything about your travels - where you've been, patterns, statistics, or specific dates!"
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Pre-compute summary statistics (always sent to AI)
  const baseSummary = useMemo(() => {
    if (!visits || visits.length === 0) {
      return { summary: 'No location data available', stats: {} }
    }

    const sorted = [...visits].sort((a, b) => a.timestamp - b.timestamp)
    const startDate = new Date(sorted[0].timestamp * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const endDate = new Date(sorted[sorted.length - 1].timestamp * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    
    const places = new Set(visits.map(v => v.name || v.placeName).filter(Boolean))
    const countries = new Set(visits.map(v => v.country).filter(Boolean))
    
    // Build summary by year
    const yearStats = {}
    visits.forEach(v => {
      const year = new Date(v.timestamp * 1000).getFullYear()
      if (!yearStats[year]) {
        yearStats[year] = { visits: 0, countries: new Set(), places: new Set() }
      }
      yearStats[year].visits++
      if (v.country) yearStats[year].countries.add(v.country)
      if (v.name || v.placeName) yearStats[year].places.add(v.name || v.placeName)
    })
    
    const yearSummary = Object.entries(yearStats)
      .sort(([a], [b]) => a - b)
      .map(([year, stats]) => 
        `${year}: ${stats.visits} visits, ${stats.places.size} places, ${stats.countries.size} countries (${[...stats.countries].join(', ')})`
      ).join('\n')

    // Country visits count
    const countryVisits = {}
    visits.forEach(v => {
      if (v.country) {
        countryVisits[v.country] = (countryVisits[v.country] || 0) + 1
      }
    })
    
    const countrySummary = Object.entries(countryVisits)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 25)
      .map(([country, count]) => `${country}: ${count} visits`)
      .join('\n')

    return {
      summary: `Location data spans from ${startDate} to ${endDate}.
      
Yearly breakdown:
${yearSummary}

Top countries by visits:
${countrySummary}`,
      stats: {
        totalVisits: visits.length,
        totalPlaces: places.size,
        countries: [...countries].join(', '),
        dateRange: `${startDate} to ${endDate}`
      },
      yearStats,
      countryVisits
    }
  }, [visits])

  // Extract dates, years, months, countries, and places from user query
  const extractQueryParams = useCallback((query) => {
    const params = {
      years: [],
      months: [],
      specificDates: [],
      countries: [],
      places: [],
      timeRanges: []
    }
    
    const queryLower = query.toLowerCase()
    
    // Extract years (2014-2025)
    const yearMatches = query.match(/\b(20[12][0-9])\b/g)
    if (yearMatches) {
      params.years = [...new Set(yearMatches.map(y => parseInt(y)))]
    }
    
    // Extract specific dates (various formats)
    const datePatterns = [
      /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/gi, // "September 15, 2022" or "September 15th 2022"
      /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/g, // "09/15/2022" or "15-09-2022"
      /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/g, // "2022-09-15"
    ]
    
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december']
    
    // Check for month + year patterns
    monthNames.forEach((month, idx) => {
      const monthYearPattern = new RegExp(`${month}\\s*(\\d{4})`, 'i')
      const match = query.match(monthYearPattern)
      if (match) {
        params.months.push({ month: idx, year: parseInt(match[1]) })
      }
    })
    
    // Check for "in [month]" without year (assume recent)
    monthNames.forEach((month, idx) => {
      if (queryLower.includes(month) && params.months.length === 0) {
        // If no year specified with month, check if a year is mentioned elsewhere
        if (params.years.length > 0) {
          params.months.push({ month: idx, year: params.years[0] })
        }
      }
    })
    
    // Extract country names from the query
    const knownCountries = ['canada', 'usa', 'united states', 'mexico', 'spain', 'germany', 'france', 
                           'italy', 'japan', 'australia', 'uk', 'united kingdom', 'india', 'thailand',
                           'nepal', 'ethiopia', 'tanzania', 'sri lanka', 'switzerland', 'costa rica',
                           'vatican', 'qatar', 'greece', 'austria', 'sweden', 'philippines', 'finland',
                           'czechia', 'czech republic', 'new zealand', 'denmark', 'hungary', 'croatia',
                           'dominican republic', 'toronto', 'berlin', 'london', 'new york']
    
    knownCountries.forEach(country => {
      if (queryLower.includes(country)) {
        params.countries.push(country)
      }
    })
    
    // Detect time range keywords
    if (queryLower.includes('last summer') || queryLower.includes('this summer')) {
      const year = queryLower.includes('last') ? new Date().getFullYear() - 1 : new Date().getFullYear()
      params.timeRanges.push({ start: new Date(year, 5, 1), end: new Date(year, 8, 30) })
    }
    if (queryLower.includes('last year')) {
      const year = new Date().getFullYear() - 1
      params.years.push(year)
    }
    if (queryLower.includes('last month')) {
      const now = new Date()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      params.months.push({ month: lastMonth.getMonth(), year: lastMonth.getFullYear() })
    }
    
    return params
  }, [])

  // Filter visits based on extracted parameters
  const filterVisits = useCallback((params) => {
    if (!visits || visits.length === 0) return []
    
    let filtered = visits

    // Filter by years
    if (params.years.length > 0) {
      filtered = filtered.filter(v => {
        const year = new Date(v.timestamp * 1000).getFullYear()
        return params.years.includes(year)
      })
    }
    
    // Filter by months
    if (params.months.length > 0) {
      filtered = filtered.filter(v => {
        const date = new Date(v.timestamp * 1000)
        return params.months.some(m => 
          date.getMonth() === m.month && date.getFullYear() === m.year
        )
      })
    }
    
    // Filter by time ranges
    if (params.timeRanges.length > 0) {
      filtered = filtered.filter(v => {
        const date = new Date(v.timestamp * 1000)
        return params.timeRanges.some(range => 
          date >= range.start && date <= range.end
        )
      })
    }
    
    // Filter by countries
    if (params.countries.length > 0) {
      filtered = filtered.filter(v => {
        const country = (v.country || '').toLowerCase()
        const city = (v.city || '').toLowerCase()
        return params.countries.some(c => 
          country.includes(c) || city.includes(c)
        )
      })
    }
    
    return filtered
  }, [visits])

  // Format visits for the AI
  const formatVisitsForAI = useCallback((visitsList, limit = 200) => {
    if (visitsList.length === 0) return 'No visits found matching the query criteria.'
    
    const sorted = [...visitsList].sort((a, b) => a.timestamp - b.timestamp)
    const sampled = sorted.length > limit 
      ? sorted.filter((_, i) => i % Math.ceil(sorted.length / limit) === 0).slice(0, limit)
      : sorted
    
    return sampled.map(v => {
      const date = new Date(v.timestamp * 1000).toLocaleDateString('en-US', { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit'
      })
      const placeName = v.name || v.placeName || 'Unknown place'
      const location = [v.city, v.country].filter(Boolean).join(', ')
      return `- ${date}: ${placeName}${location ? ` (${location})` : ''}`
    }).join('\n')
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userQuery = input.trim()
    const userMessage = { role: 'user', content: userQuery }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    try {
      // Extract query parameters and filter relevant visits
      const params = extractQueryParams(userQuery)
      const hasSpecificQuery = params.years.length > 0 || params.months.length > 0 || 
                               params.countries.length > 0 || params.timeRanges.length > 0
      
      let relevantVisits = ''
      let queryContext = ''
      
      if (hasSpecificQuery) {
        const filtered = filterVisits(params)
        relevantVisits = formatVisitsForAI(filtered, 250)
        queryContext = `\n\nThe user is asking about specific times/places. Here are the ${filtered.length} matching visits:\n${relevantVisits}`
      } else {
        // For general questions, provide a broader sample
        const sorted = [...visits].sort((a, b) => a.timestamp - b.timestamp)
        const step = Math.max(1, Math.floor(sorted.length / 100))
        const sampled = sorted.filter((_, i) => i % step === 0).slice(0, 100)
        relevantVisits = formatVisitsForAI(sampled, 100)
        queryContext = `\n\nHere is a representative sample of visits across the timeline:\n${relevantVisits}`
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(1).map(m => ({ role: m.role, content: m.content })),
          locationContext: {
            summary: baseSummary.summary + queryContext,
            stats: baseSummary.stats
          }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Sorry, I encountered an error. Please try again." 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const suggestedQuestions = [
    "What countries have I visited?",
    "Where was I in September 2022?",
    "What's my most visited place?",
    "Tell me about my trip to Japan"
  ]

  return (
    <>
      {/* Chat toggle button */}
      <button 
        className={`chat-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat window */}
      <div className={`chat-window ${isOpen ? 'open' : ''}`}>
        <div className="chat-header">
          <div className="chat-title">
            <span className="chat-icon">🤖</span>
            <span>Location Assistant</span>
          </div>
          <div className="chat-subtitle">Ask about your travels</div>
        </div>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="message-content">{msg.content}</div>
            </div>
          ))}
          
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="message assistant">
              <div className="message-content typing">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested questions (show only at start) */}
        {messages.length === 1 && (
          <div className="suggested-questions">
            {suggestedQuestions.map((q, i) => (
              <button 
                key={i} 
                className="suggestion"
                onClick={() => {
                  setInput(q)
                  inputRef.current?.focus()
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="chat-input-area">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your location history..."
            disabled={isLoading}
          />
          <button 
            className="send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
          >
            ➤
          </button>
        </div>
      </div>
    </>
  )
}
