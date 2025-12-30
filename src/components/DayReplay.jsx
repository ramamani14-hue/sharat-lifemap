import { useState, useEffect, useMemo, useRef } from 'react'
import './DayReplay.css'

function DayReplay({ 
  metadata, 
  onTimeRangeChange,
  isActive,
  setIsActive,
  selectedDayVisits,
  onFlyTo
}) {
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const timelineRef = useRef(null)
  const activeItemRef = useRef(null)

  const minTime = metadata?.minTimestamp || 0
  const maxTime = metadata?.maxTimestamp || Date.now() / 1000
  
  // Day replay date for display
  const replayDate = useMemo(() => {
    if (selectedDayVisits && selectedDayVisits.length > 0) {
      return new Date(selectedDayVisits[0].timestamp * 1000)
    }
    return null
  }, [selectedDayVisits])
  
  // Get day time bounds
  const dayBounds = useMemo(() => {
    if (!selectedDayVisits || selectedDayVisits.length === 0) return null
    
    const dayStart = selectedDayVisits[0].timestamp
    const dayEnd = selectedDayVisits[selectedDayVisits.length - 1].timestamp
    
    return { start: dayStart, end: dayEnd, duration: dayEnd - dayStart }
  }, [selectedDayVisits])

  // Helper to calculate distance in km
  const haversineDistance = (coord1, coord2) => {
    const R = 6371
    const dLat = (coord2[1] - coord1[1]) * Math.PI / 180
    const dLon = (coord2[0] - coord1[0]) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  // Build timeline: visits interleaved with travel
  const timeline = useMemo(() => {
    if (!selectedDayVisits || selectedDayVisits.length === 0) return []
    
    const items = []
    const sorted = [...selectedDayVisits].sort((a, b) => a.timestamp - b.timestamp)
    
    for (let i = 0; i < sorted.length; i++) {
      const visit = sorted[i]
      
      // Add visit
      items.push({
        type: 'visit',
        timestamp: visit.timestamp,
        endTimestamp: sorted[i + 1]?.timestamp || visit.timestamp + 1800, // 30 min default
        name: visit.placeName || visit.address?.split(',')[0] || visit.semanticType || 'Location',
        coordinates: visit.coordinates
      })
      
      // Add travel to next visit (if not last)
      if (i < sorted.length - 1) {
        const nextVisit = sorted[i + 1]
        const distance = haversineDistance(visit.coordinates, nextVisit.coordinates)
        const travelDuration = nextVisit.timestamp - visit.timestamp
        
        // Only add travel if there's meaningful movement (>100m)
        if (distance > 0.1) {
          items.push({
            type: 'travel',
            timestamp: visit.timestamp,
            endTimestamp: nextVisit.timestamp,
            duration: travelDuration,
            distance: distance,
            fromCoords: visit.coordinates,
            toCoords: nextVisit.coordinates
          })
        }
      }
    }
    
    return items
  }, [selectedDayVisits])

  // Find current timeline item based on progress
  const currentItemIndex = useMemo(() => {
    if (!dayBounds || timeline.length === 0) return 0
    
    const currentTimestamp = dayBounds.start + (dayBounds.duration * progress)
    
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].timestamp <= currentTimestamp) {
        return i
      }
    }
    return 0
  }, [timeline, dayBounds, progress])

  // Auto-scroll to current item
  useEffect(() => {
    if (activeItemRef.current && timelineRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }, [currentItemIndex])

  // Set time range to the selected day and fly to fit
  useEffect(() => {
    if (isActive && dayBounds && selectedDayVisits.length > 0) {
      const startProgress = Math.max(0, (dayBounds.start - minTime - 3600) / (maxTime - minTime))
      const endProgress = Math.min(1, (dayBounds.end - minTime + 3600) / (maxTime - minTime))
      onTimeRangeChange([startProgress, endProgress])
      
      let sumLng = 0, sumLat = 0
      for (const v of selectedDayVisits) {
        sumLng += v.coordinates[0]
        sumLat += v.coordinates[1]
      }
      const centerLng = sumLng / selectedDayVisits.length
      const centerLat = sumLat / selectedDayVisits.length
      
      onFlyTo({
        longitude: centerLng,
        latitude: centerLat,
        zoom: 13
      })
      
      setProgress(0)
      setIsPaused(false)
    }
  }, [isActive, dayBounds, selectedDayVisits, minTime, maxTime, onTimeRangeChange, onFlyTo])

  // Animate progress through the day (loops continuously)
  useEffect(() => {
    if (!isActive || isPaused || !dayBounds) return
    
    const duration = 15000 // 15 seconds for full day (synced with path animation)
    const startTime = Date.now() - (progress * duration)
    
    let animationId
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      // Loop the progress using modulo
      const newProgress = (elapsed % duration) / duration
      
      setProgress(newProgress)
      animationId = requestAnimationFrame(animate)
    }
    
    animationId = requestAnimationFrame(animate)
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId)
    }
  }, [isActive, isPaused, dayBounds])

  // Reset when deactivated
  useEffect(() => {
    if (!isActive) {
      setProgress(0)
      setIsPaused(false)
    }
  }, [isActive])

  if (!isActive || !selectedDayVisits || selectedDayVisits.length === 0) {
    return null
  }

  // Format time
  const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  // Format duration
  const formatDuration = (seconds) => {
    if (seconds < 60) return '<1 min'
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`
    const hours = Math.floor(seconds / 3600)
    const mins = Math.round((seconds % 3600) / 60)
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }

  // Format distance
  const formatDistance = (km) => {
    if (km < 1) return `${Math.round(km * 1000)}m`
    return `${km.toFixed(1)}km`
  }

  return (
    <div className="day-replay-panel">
      <div className="replay-header">
        <div className="header-left">
          <span className="replay-icon">📅</span>
          <span>Day Replay</span>
        </div>
        <button 
          className="close-btn"
          onClick={() => setIsActive(false)}
        >
          ✕
        </button>
      </div>
      
      <div className="replay-date">
        {replayDate?.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })}
      </div>
      
      <div className="timeline-container" ref={timelineRef}>
        {timeline.map((item, index) => (
          <div 
            key={index}
            ref={index === currentItemIndex ? activeItemRef : null}
            className={`timeline-item ${item.type} ${index === currentItemIndex ? 'active' : ''} ${index < currentItemIndex ? 'past' : ''}`}
          >
            {item.type === 'visit' ? (
              <>
                <div className="item-time">{formatTime(item.timestamp)}</div>
                <div className="item-marker">
                  <div className="marker-dot"></div>
                </div>
                <div className="item-content">
                  <div className="place-name">{item.name}</div>
                </div>
              </>
            ) : (
              <>
                <div className="item-time"></div>
                <div className="item-marker">
                  <div className="marker-line"></div>
                </div>
                <div className="item-content travel-content">
                  <span className="travel-icon">→</span>
                  <span className="travel-info">
                    {formatDuration(item.duration)} · {formatDistance(item.distance)}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="progress-section">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress * 100}%` }}
          ></div>
        </div>
      </div>

      <div className="replay-controls">
        <button 
          className={`control-btn ${!isPaused ? 'active' : ''}`}
          onClick={() => setIsPaused(!isPaused)}
        >
          {isPaused ? '▶' : '⏸'}
        </button>
        <button 
          className="control-btn"
          onClick={() => {
            setProgress(0)
            setIsPaused(false)
          }}
        >
          ↺
        </button>
      </div>
    </div>
  )
}

export default DayReplay
