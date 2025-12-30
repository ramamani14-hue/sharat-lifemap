import { useState } from 'react'
import './DateSearch.css'

function DateSearch({ visits, onLocationFound, onDayReplay }) {
  const [searchDate, setSearchDate] = useState('')
  const [result, setResult] = useState(null)
  const [dayVisits, setDayVisits] = useState([])

  const handleSearch = () => {
    if (!searchDate || !visits || visits.length === 0) return
    
    const targetDate = new Date(searchDate)
    const targetStart = targetDate.getTime() / 1000
    const targetEnd = targetStart + 86400 // +24 hours
    
    // Find visits on that date
    const matchingVisits = visits.filter(v => 
      v.timestamp >= targetStart && v.timestamp < targetEnd
    ).sort((a, b) => a.timestamp - b.timestamp)  // Sort chronologically
    
    if (matchingVisits.length > 0) {
      // Sort by duration to find the main location that day
      const sorted = [...matchingVisits].sort((a, b) => 
        (b.durationMinutes || 0) - (a.durationMinutes || 0)
      )
      
      const mainLocation = sorted[0]
      
      setResult({
        found: true,
        count: matchingVisits.length,
        main: mainLocation,
        date: targetDate
      })
      
      setDayVisits(matchingVisits)
      
      onLocationFound({
        longitude: mainLocation.coordinates[0],
        latitude: mainLocation.coordinates[1],
        zoom: 14,
        timestamp: mainLocation.timestamp
      })
    } else {
      // Find closest date with data
      const sortedVisits = [...visits].sort((a, b) => 
        Math.abs(a.timestamp - targetStart) - Math.abs(b.timestamp - targetStart)
      )
      
      const closest = sortedVisits[0]
      const closestDate = new Date(closest.timestamp * 1000)
      
      setResult({
        found: false,
        closest: closestDate,
        closestLocation: closest
      })
      setDayVisits([])
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="date-search">
      <div className="search-header">
        <span className="search-icon">🔍</span>
        Where was I?
      </div>
      <div className="search-input-group">
        <input
          type="date"
          value={searchDate}
          onChange={(e) => setSearchDate(e.target.value)}
          onKeyPress={handleKeyPress}
          className="search-input"
        />
        <button onClick={handleSearch} className="search-button">
          Find
        </button>
      </div>
      
      {result && (
        <div className="search-result">
          {result.found ? (
            <>
              <div className="result-success">
                <span className="result-icon">✓</span>
                Found {result.count} location{result.count > 1 ? 's' : ''}
              </div>
              <div className="result-details">
                <span className="result-type">{result.main.semanticType}</span>
                <span className="result-duration">
                  {Math.round(result.main.durationMinutes || 0)} min
                </span>
              </div>
              {dayVisits.length > 1 && (
                <button 
                  className="replay-day-btn"
                  onClick={() => onDayReplay(dayVisits)}
                >
                  <span className="replay-icon">🎬</span>
                  Replay This Day
                </button>
              )}
            </>
          ) : (
            <>
              <div className="result-not-found">
                No data for this date
              </div>
              <button 
                className="result-closest"
                onClick={() => {
                  onLocationFound({
                    longitude: result.closestLocation.coordinates[0],
                    latitude: result.closestLocation.coordinates[1],
                    zoom: 14
                  })
                }}
              >
                Closest: {result.closest.toLocaleDateString()}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default DateSearch


