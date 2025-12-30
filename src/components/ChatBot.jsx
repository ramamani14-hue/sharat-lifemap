import { useState, useRef, useEffect, useMemo } from 'react'
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

  // Build context from location data
  const locationContext = useMemo(() => {
    if (!visits || visits.length === 0) {
      return {
        summary: 'No location data available',
        recentVisits: '',
        stats: { totalVisits: 0, totalPlaces: 0, countries: '', dateRange: '' }
      }
    }

    const sorted = [...visits].sort((a, b) => a.timestamp - b.timestamp)
    const startDate = new Date(sorted[0].timestamp * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const endDate = new Date(sorted[sorted.length - 1].timestamp * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    
    // Get unique places and countries
    const places = new Set(visits.map(v => v.name || v.placeName).filter(Boolean))
    const countries = new Set(visits.map(v => v.country).filter(Boolean))
    
    // Get visits by country
    const countryVisits = {}
    visits.forEach(v => {
      if (v.country) {
        countryVisits[v.country] = (countryVisits[v.country] || 0) + 1
      }
    })
    
    // Build a sample of recent visits (last 50)
    const recentSample = sorted.slice(-100).map(v => {
      const date = new Date(v.timestamp * 1000).toLocaleDateString('en-US', { 
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
      return `- ${date}: ${v.name || v.placeName || 'Unknown'}, ${v.city || ''} ${v.country || ''}`
    }).join('\n')

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

    const countrySummary = Object.entries(countryVisits)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([country, count]) => `${country}: ${count} visits`)
      .join('\n')

    return {
      summary: `Location data spans from ${startDate} to ${endDate}.
      
Yearly breakdown:
${yearSummary}

Top countries by visits:
${countrySummary}`,
      recentVisits: recentSample,
      stats: {
        totalVisits: visits.length,
        totalPlaces: places.size,
        countries: [...countries].join(', '),
        dateRange: `${startDate} to ${endDate}`
      }
    }
  }, [visits])

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

    const userMessage = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(1).map(m => ({ role: m.role, content: m.content })),
          locationContext
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      // Handle streaming response
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ''

      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const text = decoder.decode(value)
        assistantMessage += text
        
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: assistantMessage }
          return updated
        })
      }
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
    "Where was I last summer?",
    "What's my most visited place?",
    "How has my travel changed over time?"
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

