import { useMemo } from 'react'
import './CountryStats.css'

// Country flag emojis
const COUNTRY_FLAGS = {
  'Canada': '🇨🇦',
  'Germany': '🇩🇪',
  'USA': '🇺🇸',
  'Australia': '🇦🇺',
  'Tanzania': '🇹🇿',
  'Finland': '🇫🇮',
  'Costa Rica': '🇨🇷',
  'Spain': '🇪🇸',
  'Thailand': '🇹🇭',
  'New Zealand': '🇳🇿',
  'UK': '🇬🇧',
  'Italy': '🇮🇹',
  'Japan': '🇯🇵',
  'Switzerland': '🇨🇭',
  'Sweden': '🇸🇪',
  'Greece': '🇬🇷',
  'Philippines': '🇵🇭',
  'France': '🇫🇷',
  'Czechia': '🇨🇿',
  'Nepal': '🇳🇵',
  'Croatia': '🇭🇷',
  'India': '🇮🇳',
  'Dominican Republic': '🇩🇴',
  'United Arab Emirates': '🇦🇪',
  'Netherlands': '🇳🇱',
  'Portugal': '🇵🇹',
  'Mexico': '🇲🇽',
  'Singapore': '🇸🇬',
  'South Korea': '🇰🇷',
  'Ireland': '🇮🇪',
}

// Extract country from address (last comma-separated part)
const extractCountry = (address) => {
  if (!address) return null
  const parts = address.split(',').map(p => p.trim())
  const last = parts[parts.length - 1]
  
  // Clean up known issues
  if (last.includes('United Arab Emirates')) return 'United Arab Emirates'
  if (last.match(/^\d/)) return null // Starts with number, not a country
  if (last.match(/[ぁ-んァ-ン]/)) return 'Japan' // Japanese characters
  if (last.length > 30) return null // Too long, probably not a country
  
  return last
}

function CountryStats({ data, timeRange }) {
  const { visits = [], metadata } = data || {}
  const minTime = metadata?.minTimestamp || 0
  const maxTime = metadata?.maxTimestamp || Date.now() / 1000

  // Analyze countries
  const countryData = useMemo(() => {
    const rangeStart = minTime + (maxTime - minTime) * timeRange[0]
    const rangeEnd = minTime + (maxTime - minTime) * timeRange[1]
    
    const filtered = visits.filter(v => 
      v.timestamp >= rangeStart && v.timestamp <= rangeEnd
    )
    
    // Count visits per country
    const countryCounts = {}
    
    for (const visit of filtered) {
      const country = extractCountry(visit.address)
      if (!country || !COUNTRY_FLAGS[country]) continue
      
      if (!countryCounts[country]) {
        countryCounts[country] = { visits: 0, days: new Set() }
      }
      countryCounts[country].visits++
      
      // Track unique days
      const day = new Date(visit.timestamp * 1000).toDateString()
      countryCounts[country].days.add(day)
    }
    
    // Convert to sorted array
    const sorted = Object.entries(countryCounts)
      .map(([country, data]) => ({
        country,
        visits: data.visits,
        days: data.days.size,
        flag: COUNTRY_FLAGS[country] || '🏳️'
      }))
      .sort((a, b) => b.days - a.days)
    
    const maxDays = sorted[0]?.days || 1
    
    return { countries: sorted, maxDays, totalCountries: sorted.length }
  }, [visits, timeRange, minTime, maxTime])

  if (!countryData.countries.length) return null

  // Color scale based on days (white to cyan)
  const getColor = (days, maxDays) => {
    const t = Math.min(days / maxDays, 1)
    const r = Math.round(255 - t * 255)    // 255 -> 0
    const g = Math.round(255 - t * 43)     // 255 -> 212
    const b = 255                           // constant
    return `rgb(${r}, ${g}, ${b})`
  }

  return (
    <div className="country-stats-panel">
      <div className="panel-header">
        <span className="panel-icon">🌍</span>
        <span>Countries</span>
        <span className="country-count">{countryData.totalCountries}</span>
      </div>
      
      <div className="country-list">
        {countryData.countries.map(({ country, visits, days, flag }) => (
          <div key={country} className="country-row">
            <div className="country-info">
              <span className="country-flag">{flag}</span>
              <span className="country-name">{country}</span>
            </div>
            <div className="country-stats">
              <div 
                className="days-badge"
                style={{ 
                  background: getColor(days, countryData.maxDays)
                }}
              >
                {days} {days === 1 ? 'day' : 'days'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CountryStats

