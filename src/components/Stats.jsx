import { useMemo } from 'react'
import './Stats.css'

// Haversine formula to calculate distance between two coordinates
function haversineDistance(coord1, coord2) {
  const R = 6371 // Earth's radius in km
  const [lon1, lat1] = coord1
  const [lon2, lat2] = coord2
  
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function Stats({ data, timeRange }) {
  const { visits, metadata } = data
  
  const stats = useMemo(() => {
    if (!metadata || !visits) return null
    
    const minTime = metadata.minTimestamp
    const maxTime = metadata.maxTimestamp
    const rangeStart = minTime + (maxTime - minTime) * timeRange[0]
    const rangeEnd = minTime + (maxTime - minTime) * timeRange[1]
    
    const filteredVisits = visits
      .filter(v => v.timestamp >= rangeStart && v.timestamp <= rangeEnd)
      .sort((a, b) => a.timestamp - b.timestamp)
    
    // Calculate total distance
    let totalKm = 0
    for (let i = 1; i < filteredVisits.length; i++) {
      const prev = filteredVisits[i - 1]
      const curr = filteredVisits[i]
      
      // Skip if too far apart in time (> 2 days = probably a flight, count it)
      const timeDiff = curr.timestamp - prev.timestamp
      if (timeDiff > 86400 * 7) continue // Skip gaps > 1 week
      
      const dist = haversineDistance(prev.coordinates, curr.coordinates)
      if (dist < 500) { // Sanity check: skip unrealistic distances
        totalKm += dist
      }
    }
    
    // Calculate total duration
    const totalMinutes = filteredVisits.reduce(
      (sum, v) => sum + (v.durationMinutes || 0), 0
    )
    
    // Count unique cities
    const uniqueCities = new Set(
      filteredVisits.map(v => v.city).filter(c => c && c !== 'Unknown')
    )
    
    return {
      places: filteredVisits.length,
      cities: uniqueCities.size,
      kilometers: Math.round(totalKm),
      hours: Math.round(totalMinutes / 60)
    }
  }, [visits, metadata, timeRange])

  if (!stats) return null

  return (
    <div className="stats-panel">
      <div className="stat-item">
        <span className="stat-value">{stats.places.toLocaleString()}</span>
        <span className="stat-label">Places</span>
      </div>
      <div className="stat-divider"></div>
      <div className="stat-item">
        <span className="stat-value">{stats.cities}</span>
        <span className="stat-label">Cities</span>
      </div>
      <div className="stat-divider"></div>
      <div className="stat-item">
        <span className="stat-value">{stats.kilometers.toLocaleString()}</span>
        <span className="stat-label">km</span>
      </div>
      <div className="stat-divider"></div>
      <div className="stat-item">
        <span className="stat-value">{stats.hours.toLocaleString()}</span>
        <span className="stat-label">Hours</span>
      </div>
    </div>
  )
}

export default Stats
