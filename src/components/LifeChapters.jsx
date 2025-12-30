import { useMemo } from 'react'
import './LifeChapters.css'

// Country detection from address
const extractCountry = (address) => {
  if (!address) return null
  const parts = address.split(',').map(p => p.trim())
  const last = parts[parts.length - 1]
  if (!last || last.match(/^\d/) || last.length > 30) return null
  return last
}

// Detect significant location changes / life chapters
function detectChapters(visits, minTime, maxTime) {
  if (!visits || visits.length < 10) return []
  
  const chapters = []
  const sorted = [...visits].sort((a, b) => a.timestamp - b.timestamp)
  
  // Group visits by month and find dominant locations
  const monthlyData = new Map()
  
  sorted.forEach(v => {
    const date = new Date(v.timestamp * 1000)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    
    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, { homes: [], works: [], cities: {}, places: {}, countries: {} })
    }
    
    const month = monthlyData.get(monthKey)
    
    // Track city frequency
    const city = v.city || 'Unknown'
    month.cities[city] = (month.cities[city] || 0) + 1
    
    // Track favorite places
    const placeName = v.placeName || v.primaryType
    if (placeName && placeName !== 'premise') {
      month.places[placeName] = (month.places[placeName] || 0) + 1
    }
    
    // Track countries
    const country = extractCountry(v.address)
    if (country) {
      month.countries[country] = (month.countries[country] || 0) + 1
    }
    
    if (v.semanticType === 'Home' || v.semanticType === 'Inferred Home') {
      month.homes.push(v)
    }
    if (v.semanticType === 'Work' || v.semanticType === 'Inferred Work') {
      month.works.push(v)
    }
  })
  
  // Find first visit (beginning of data)
  if (sorted.length > 0) {
    const first = sorted[0]
    chapters.push({
      id: 'start',
      title: 'Journey Begins',
      subtitle: first.city || null,
      date: new Date(first.timestamp * 1000),
      timestamp: first.timestamp,
      location: first.coordinates,
      type: 'milestone'
    })
  }
  
  // Detect major moves by looking at dominant city changes
  let lastDominantCity = null
  const cityMoves = []
  
  Array.from(monthlyData.entries()).forEach(([month, data]) => {
    const cityEntries = Object.entries(data.cities)
    if (cityEntries.length === 0) return
    
    const dominantCity = cityEntries.reduce((a, b) => a[1] > b[1] ? a : b)[0]
    
    if (dominantCity !== 'Unknown' && dominantCity !== lastDominantCity) {
      const cityCount = data.cities[dominantCity]
      const totalCount = Object.values(data.cities).reduce((a, b) => a + b, 0)
      
      if (cityCount / totalCount > 0.5 && cityCount > 10) {
        const cityVisit = [...data.homes, ...data.works].find(v => v.city === dominantCity) 
          || sorted.find(v => {
            const d = new Date(v.timestamp * 1000)
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month && v.city === dominantCity
          })
        
        if (cityVisit && lastDominantCity) {
          cityMoves.push({
            month,
            fromCity: lastDominantCity,
            toCity: dominantCity,
            timestamp: cityVisit.timestamp,
            coords: cityVisit.coordinates
          })
        }
        
        lastDominantCity = dominantCity
      }
    }
  })
  
  // Add detected city moves as chapters
  cityMoves.forEach((move, i) => {
    chapters.push({
      id: `move-${i}`,
      title: `Moved to ${move.toCity}`,
      subtitle: `from ${move.fromCity}`,
      date: new Date(move.timestamp * 1000),
      timestamp: move.timestamp,
      location: move.coords,
      type: 'home'
    })
  })
  
  // Track first visits to countries
  const firstCountryVisit = {}
  sorted.forEach(v => {
    const country = extractCountry(v.address)
    if (country && country !== 'Canada' && !firstCountryVisit[country]) {
      firstCountryVisit[country] = v
    }
  })
  
  // Add notable first international trips
  Object.entries(firstCountryVisit).forEach(([country, visit]) => {
    chapters.push({
      id: `first-${country}`,
      title: `First time in ${country}`,
      subtitle: visit.city || null,
      date: new Date(visit.timestamp * 1000),
      timestamp: visit.timestamp,
      location: visit.coordinates,
      type: 'travel'
    })
  })
  
  // Add yearly milestones with stats
  const yearlyData = new Map()
  sorted.forEach(v => {
    const year = new Date(v.timestamp * 1000).getFullYear()
    if (!yearlyData.has(year)) {
      yearlyData.set(year, { 
        visits: [], 
        cities: {}, 
        places: {}, 
        countries: {},
        uniquePlaces: new Set()
      })
    }
    const data = yearlyData.get(year)
    data.visits.push(v)
    
    const city = v.city || 'Unknown'
    data.cities[city] = (data.cities[city] || 0) + 1
    
    const placeName = v.placeName
    if (placeName) {
      data.places[placeName] = (data.places[placeName] || 0) + 1
      data.uniquePlaces.add(placeName)
    }
    
    const country = extractCountry(v.address)
    if (country) {
      data.countries[country] = (data.countries[country] || 0) + 1
    }
  })
  
  yearlyData.forEach((data, year) => {
    if (data.visits.length > 0) {
      // Find dominant city for the year
      const cityEntries = Object.entries(data.cities).filter(([c]) => c !== 'Unknown')
      const dominantCity = cityEntries.length > 0 
        ? cityEntries.reduce((a, b) => a[1] > b[1] ? a : b)[0]
        : null
      
      // Find favorite place
      const placeEntries = Object.entries(data.places)
        .filter(([p]) => !['premise', 'apartment_complex'].includes(p))
        .sort((a, b) => b[1] - a[1])
      const favoritePlace = placeEntries[0]?.[0]
      
      // Count unique countries
      const countriesVisited = Object.keys(data.countries).length
      
      chapters.push({
        id: `year-${year}`,
        title: `${year}`,
        subtitle: dominantCity,
        date: new Date(year, 0, 1),
        timestamp: data.visits[0].timestamp,
        location: data.visits[0].coordinates,
        type: 'year',
        visitCount: data.visits.length,
        favoritePlace,
        countriesVisited,
        uniquePlaces: data.uniquePlaces.size
      })
    }
  })
  
  // Sort chapters chronologically
  chapters.sort((a, b) => a.timestamp - b.timestamp)
  
  return chapters
}

function LifeChapters({ visits, metadata, onChapterClick }) {
  const minTime = metadata?.minTimestamp || 0
  const maxTime = metadata?.maxTimestamp || Date.now() / 1000
  
  const chapters = useMemo(() => 
    detectChapters(visits, minTime, maxTime),
    [visits, minTime, maxTime]
  )
  
  if (chapters.length === 0) return null
  
  const handleClick = (chapter) => {
    onChapterClick({
      longitude: chapter.location[0],
      latitude: chapter.location[1],
      zoom: 11,
      timestamp: chapter.timestamp
    })
  }
  
  const getIcon = (type) => {
    switch(type) {
      case 'milestone': return '🎯'
      case 'home': return '🏠'
      case 'travel': return '✈️'
      case 'year': return '📅'
      default: return '📍'
    }
  }
  
  return (
    <div className="life-chapters">
      <div className="chapters-header">
        <span className="chapters-icon">📍</span>
        Life Chapters
      </div>
      <div className="chapters-timeline">
        {chapters.map((chapter) => (
          <button
            key={chapter.id}
            className={`chapter-item chapter-${chapter.type}`}
            onClick={() => handleClick(chapter)}
          >
            <span className="chapter-icon">{getIcon(chapter.type)}</span>
            <div className="chapter-content">
              <div className="chapter-title-row">
                <span className="chapter-title">{chapter.title}</span>
                {chapter.subtitle && (
                  <span className="chapter-subtitle">{chapter.subtitle}</span>
                )}
              </div>
              <span className="chapter-date">
                {chapter.date.toLocaleDateString('en-US', { 
                  month: 'short', 
                  year: 'numeric' 
                })}
              </span>
              {chapter.type === 'year' && (
                <div className="chapter-stats">
                  <span className="stat">{chapter.visitCount} visits</span>
                  {chapter.uniquePlaces > 0 && (
                    <span className="stat">{chapter.uniquePlaces} places</span>
                  )}
                  {chapter.countriesVisited > 1 && (
                    <span className="stat">{chapter.countriesVisited} countries</span>
                  )}
                  {chapter.favoritePlace && (
                    <span className="stat favorite">★ {chapter.favoritePlace}</span>
                  )}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default LifeChapters
