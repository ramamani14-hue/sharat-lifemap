import { useState, useEffect, useMemo, useRef } from 'react'
import FlowMap from './components/FlowMap'
import Controls from './components/Controls'
import Stats from './components/Stats'
import LifeChapters from './components/LifeChapters'
import DateSearch from './components/DateSearch'
import DayReplay from './components/DayReplay'
import TimeDisplay from './components/TimeDisplay'
import CountryStats from './components/CountryStats'
import ChatBot from './components/ChatBot'
import './App.css'

function App() {
  const [data, setData] = useState({ visits: [], trips: [], arcs: [], metadata: null })
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState([0, 1])
  const [visibleLayers, setVisibleLayers] = useState({
    visits: true,
    arcs: true,
    trips: true,
    hexagon: false
  })
  const [animating, setAnimatingState] = useState(false)
  const [flyToLocation, setFlyToLocation] = useState(null)
  const [dayReplayActive, setDayReplayActive] = useState(false)
  const [selectedDayVisits, setSelectedDayVisits] = useState(null)
  
  // Animation state refs
  const animationStartRange = useRef(null)
  const animationProgress = useRef(0)  // 0 to 1 progress within the range
  
  // Start/resume animation
  const startAnimation = () => {
    if (!animating && data.visits?.length > 0 && data.metadata) {
      // If no start range set, initialize it
      if (!animationStartRange.current) {
        animationStartRange.current = [...timeRange]
        animationProgress.current = 0
        
        // Fly to start location
        const minTime = data.metadata.minTimestamp
        const maxTime = data.metadata.maxTimestamp
        const rangeStart = minTime + (maxTime - minTime) * timeRange[0]
        
        const sortedVisits = [...data.visits]
          .filter(v => v.timestamp >= rangeStart)
          .sort((a, b) => a.timestamp - b.timestamp)
        
        if (sortedVisits.length > 0) {
          const firstVisit = sortedVisits[0]
          setFlyToLocation({
            longitude: firstVisit.coordinates[0],
            latitude: firstVisit.coordinates[1],
            zoom: 12
          })
        }
      }
    }
    setAnimatingState(true)
  }
  
  // Pause animation (keeps progress)
  const pauseAnimation = () => {
    setAnimatingState(false)
  }
  
  // Restart animation from beginning
  const restartAnimation = () => {
    if (animationStartRange.current) {
      animationProgress.current = 0
      setTimeRange([animationStartRange.current[0], animationStartRange.current[0] + 0.01])
      
      // Fly to start
      if (data.visits?.length > 0 && data.metadata) {
        const minTime = data.metadata.minTimestamp
        const maxTime = data.metadata.maxTimestamp
        const rangeStart = minTime + (maxTime - minTime) * animationStartRange.current[0]
        
        const sortedVisits = [...data.visits]
          .filter(v => v.timestamp >= rangeStart)
          .sort((a, b) => a.timestamp - b.timestamp)
        
        if (sortedVisits.length > 0) {
          setFlyToLocation({
            longitude: sortedVisits[0].coordinates[0],
            latitude: sortedVisits[0].coordinates[1],
            zoom: 12
          })
        }
      }
    } else {
      animationStartRange.current = [...timeRange]
      animationProgress.current = 0
    }
    setAnimatingState(true)
  }
  
  // Stop animation completely (resets state)
  const stopAnimation = () => {
    setAnimatingState(false)
    animationStartRange.current = null
    animationProgress.current = 0
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        const [visitsRes, tripsRes, arcsRes, metaRes] = await Promise.all([
          fetch('/data/visits.json'),
          fetch('/data/trips.json'),
          fetch('/data/arcs.json'),
          fetch('/data/metadata.json')
        ])
        
        const [visits, trips, arcs, metadata] = await Promise.all([
          visitsRes.json(),
          tripsRes.json(),
          arcsRes.json(),
          metaRes.json()
        ])
        
        setData({ visits, trips, arcs, metadata })
        setLoading(false)
      } catch (err) {
        console.error('Failed to load data:', err)
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Handle animation - animate within the selected range with pause/resume
  useEffect(() => {
    if (!animating) return
    
    const startRange = animationStartRange.current
    if (!startRange) return
    
    const rangeSpan = startRange[1] - startRange[0]
    const duration = 60000 // 60 seconds for full animation
    const startProgress = animationProgress.current
    const startTime = Date.now() - (startProgress * duration)
    
    let animationId
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Store current progress for pause/resume
      animationProgress.current = progress
      
      // Animate from start to end within the selected range
      const currentEnd = startRange[0] + rangeSpan * progress
      setTimeRange([startRange[0], Math.max(startRange[0] + 0.01, currentEnd)])
      
      // Stop at the end instead of looping
      if (progress < 1) {
        animationId = requestAnimationFrame(animate)
      } else {
        setAnimatingState(false)
      }
    }
    
    animationId = requestAnimationFrame(animate)
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId)
    }
  }, [animating])


  const handleChapterClick = (location) => {
    if (location.timestamp && data.metadata) {
      const progress = (location.timestamp - data.metadata.minTimestamp) / 
                       (data.metadata.maxTimestamp - data.metadata.minTimestamp)
      setTimeRange([0, Math.min(progress + 0.05, 1)])
    }
    setFlyToLocation(location)
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-orb">
            <div className="orb-ring"></div>
            <div className="orb-ring"></div>
            <div className="orb-ring"></div>
          </div>
          <h1>INITIALIZING</h1>
          <p>Mapping your journey through spacetime...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <FlowMap 
        data={data} 
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        visibleLayers={visibleLayers}
        animating={animating}
        flyToLocation={flyToLocation}
        setFlyToLocation={setFlyToLocation}
        dayReplayActive={dayReplayActive}
        selectedDayVisits={selectedDayVisits}
      />
      
      <div className="ui-overlay">
        {/* Top Left - Header & Controls */}
        <div className="ui-top-left">
          <header className="header">
            <div className="header-badge">SHARAT</div>
            <h1>An Odyssey</h1>
          </header>
          
          <Controls 
            metadata={data.metadata}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            visibleLayers={visibleLayers}
            setVisibleLayers={setVisibleLayers}
            animating={animating}
            onPlay={startAnimation}
            onPause={pauseAnimation}
            onRestart={restartAnimation}
            onStop={stopAnimation}
          />
        </div>

        {/* Top Right - Search & Chapters & Countries */}
        <div className="ui-top-right">
          <DateSearch 
            visits={data.visits}
            onLocationFound={setFlyToLocation}
            onDayReplay={(dayVisits) => {
              setSelectedDayVisits(dayVisits)
              setDayReplayActive(true)
              // Camera pan to path start is handled by FlowMap
            }}
          />
          
          <LifeChapters 
            visits={data.visits}
            metadata={data.metadata}
            onChapterClick={handleChapterClick}
          />
          
          <CountryStats 
            data={data}
            timeRange={timeRange}
          />
        </div>

        {/* Bottom Left - Day Replay */}
        <div className="ui-bottom-left">
          <DayReplay
            metadata={data.metadata}
            onTimeRangeChange={setTimeRange}
            isActive={dayReplayActive}
            setIsActive={(active) => {
              setDayReplayActive(active)
              if (!active) setSelectedDayVisits(null)
            }}
            selectedDayVisits={selectedDayVisits}
            onFlyTo={setFlyToLocation}
          />
        </div>

        {/* Bottom Center - Time Display */}
        <div className="ui-bottom-center">
          <TimeDisplay 
            timeRange={timeRange}
            metadata={data.metadata}
          />
        </div>

        {/* Bottom Right - Stats */}
        <div className="ui-bottom-right">
          <Stats 
            data={data}
            timeRange={timeRange}
          />
        </div>
      </div>
      
      {/* Decorative grid overlay */}
      <div className="grid-overlay"></div>
      
      {/* AI Chat Assistant */}
      <ChatBot 
        visits={data.visits}
        metadata={data.metadata}
      />
    </div>
  )
}

export default App
