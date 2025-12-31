import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Map as MapGL } from 'react-map-gl/maplibre'
import DeckGL from '@deck.gl/react'
import { ScatterplotLayer, ArcLayer, PathLayer, GeoJsonLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import { ColumnLayer } from '@deck.gl/layers'

// Map visit country names to GeoJSON names
const COUNTRY_NAME_MAP = {
  'USA': 'United States of America',
  'UK': 'United Kingdom',
  'Czechia': 'Czech Republic',
  'Tanzania': 'United Republic of Tanzania',
}

// Pre-aggregate points into grid cells with top location tracking
function aggregateToGrid(points, cellSize = 0.02) {
  const grid = new Map()
  
  for (const point of points) {
    const [lng, lat] = point.coordinates
    // Round to grid cell
    const cellLng = Math.floor(lng / cellSize) * cellSize + cellSize / 2
    const cellLat = Math.floor(lat / cellSize) * cellSize + cellSize / 2
    const key = `${cellLng.toFixed(4)},${cellLat.toFixed(4)}`
    
    if (grid.has(key)) {
      const cell = grid.get(key)
      cell.count++
      
      // Track location counts within this cell
      const placeName = point.placeName || point.address?.split(',')[0] || 'Unknown'
      cell.locations[placeName] = (cell.locations[placeName] || 0) + 1
    } else {
      const placeName = point.placeName || point.address?.split(',')[0] || 'Unknown'
      grid.set(key, {
        position: [cellLng, cellLat],
        count: 1,
        locations: { [placeName]: 1 }
      })
    }
  }
  
  // Find top location for each cell
  const cells = Array.from(grid.values())
  for (const cell of cells) {
    let topLocation = 'Unknown'
    let topCount = 0
    for (const [name, count] of Object.entries(cell.locations)) {
      if (count > topCount && name !== 'Unknown') {
        topLocation = name
        topCount = count
      }
    }
    cell.topLocation = topLocation
    cell.topLocationCount = topCount
    cell.uniquePlaces = Object.keys(cell.locations).length
  }
  
  return cells
}
import { FlyToInterpolator } from '@deck.gl/core'
import 'maplibre-gl/dist/maplibre-gl.css'

// Dark map style
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

// Cyberpunk color gradient: Electric Blue → Neon Purple → Hot Pink → Electric Orange
const getTimeColor = (timestamp, minTime, maxTime) => {
  const progress = (timestamp - minTime) / (maxTime - minTime)
  
  if (progress < 0.33) {
    // Electric Blue to Neon Purple
    const t = progress / 0.33
    return [
      0 + t * 147,        // 0 → 147
      212 - t * 61,       // 212 → 151
      255 - t * 42,       // 255 → 213
      230
    ]
  } else if (progress < 0.66) {
    // Neon Purple to Hot Pink
    const t = (progress - 0.33) / 0.33
    return [
      147 + t * 108,      // 147 → 255
      151 - t * 91,       // 151 → 60
      213 - t * 45,       // 213 → 168
      240
    ]
  } else {
    // Hot Pink to Electric Orange
    const t = (progress - 0.66) / 0.34
    return [
      255,                // 255
      60 + t * 140,       // 60 → 200
      168 - t * 148,      // 168 → 20
      250
    ]
  }
}

const INITIAL_VIEW_STATE = {
  longitude: -79.4,
  latitude: 43.65,
  zoom: 11,
  pitch: 55,
  bearing: -20
}

function FlowMap({ 
  data, 
  timeRange, 
  setTimeRange, 
  visibleLayers, 
  animating,
  flyToLocation,
  setFlyToLocation,
  dayReplayActive
}) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)
  const [tripsTime, setTripsTime] = useState(0)
  const [countriesGeoJson, setCountriesGeoJson] = useState(null)
  const tripsAnimationRef = useRef(null)

  const { visits = [], metadata } = data || {}
  const minTime = metadata?.minTimestamp || 0
  const maxTime = metadata?.maxTimestamp || Date.now() / 1000

  // Load countries GeoJSON
  useEffect(() => {
    fetch('/data/countries.geojson')
      .then(res => res.json())
      .then(setCountriesGeoJson)
      .catch(console.error)
  }, [])

  // Filter data by time range
  const timeFilteredVisits = useMemo(() => {
    if (!visits || !visits.length) return []
    const rangeStart = minTime + (maxTime - minTime) * timeRange[0]
    const rangeEnd = minTime + (maxTime - minTime) * timeRange[1]
    return visits.filter(v => v.timestamp >= rangeStart && v.timestamp <= rangeEnd)
  }, [visits, timeRange, minTime, maxTime])

  // Filter actual trips data by time range and format for TripsLayer
  const { trips = [] } = data || {}
  
  const timeFilteredTrips = useMemo(() => {
    if (!trips || trips.length === 0) return []
    
    const rangeStart = minTime + (maxTime - minTime) * timeRange[0]
    const rangeEnd = minTime + (maxTime - minTime) * timeRange[1]
    
    // Filter by time range first
    const timeFiltered = trips.filter(trip => {
      if (!trip.path || trip.path.length < 2) return false
      const tripStart = trip.path[0].timestamp
      const tripEnd = trip.path[trip.path.length - 1].timestamp
      return tripEnd >= rangeStart && tripStart <= rangeEnd
    })
    
    // De-duplicate overlapping trips: if two trips overlap >50%, keep the one with more points
    const sorted = [...timeFiltered].sort((a, b) => a.path[0].timestamp - b.path[0].timestamp)
    const kept = []
    const removed = new Set()
    
    for (let i = 0; i < sorted.length; i++) {
      if (removed.has(i)) continue
      
      const tripA = sorted[i]
      const aStart = tripA.path[0].timestamp
      const aEnd = tripA.path[tripA.path.length - 1].timestamp
      const aDuration = aEnd - aStart || 1
      
      // Check for overlaps with subsequent trips
      for (let j = i + 1; j < sorted.length; j++) {
        if (removed.has(j)) continue
        
        const tripB = sorted[j]
        const bStart = tripB.path[0].timestamp
        const bEnd = tripB.path[tripB.path.length - 1].timestamp
        const bDuration = bEnd - bStart || 1
        
        // If B starts after A ends, no more overlaps possible
        if (bStart > aEnd) break
        
        // Calculate overlap
        const overlapStart = Math.max(aStart, bStart)
        const overlapEnd = Math.min(aEnd, bEnd)
        const overlapDuration = Math.max(0, overlapEnd - overlapStart)
        
        // Check if overlap is >50% of either trip
        const overlapRatioA = overlapDuration / aDuration
        const overlapRatioB = overlapDuration / bDuration
        
        if (overlapRatioA > 0.5 || overlapRatioB > 0.5) {
          // Keep the one with more points, remove the other
          if (tripA.path.length >= tripB.path.length) {
            removed.add(j)
          } else {
            removed.add(i)
            break // Stop checking, tripA is removed
          }
        }
      }
      
      if (!removed.has(i)) {
        kept.push(tripA)
      }
    }
    
    return kept
  }, [trips, timeRange, minTime, maxTime])
  
  // Format trips for TripsLayer animation with interpolation and speed scaling
  const animatedTrips = useMemo(() => {
    if (!timeFilteredTrips || timeFilteredTrips.length === 0) return []
    
    // Helper to calculate distance in km between two coordinates
    const haversineDistance = (coord1, coord2) => {
      const R = 6371 // Earth radius in km
      const dLat = (coord2[1] - coord1[1]) * Math.PI / 180
      const dLon = (coord2[0] - coord1[0]) * Math.PI / 180
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      return R * c
    }
    
    // Catmull-Rom spline interpolation for smooth curves through points
    const catmullRomSpline = (p0, p1, p2, p3, numPoints = 8) => {
      const points = []
      for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints
        const t2 = t * t
        const t3 = t2 * t
        
        // Catmull-Rom basis functions
        const x = 0.5 * (
          (2 * p1[0]) +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
        )
        const y = 0.5 * (
          (2 * p1[1]) +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
        )
        points.push([x, y])
      }
      return points
    }
    
    // Smooth an entire path using Catmull-Rom splines
    const smoothPath = (pathCoords) => {
      if (pathCoords.length < 3) return pathCoords
      
      const smoothed = []
      for (let i = 0; i < pathCoords.length - 1; i++) {
        // Get 4 control points for the spline (with mirroring at edges)
        const p0 = i === 0 ? pathCoords[0] : pathCoords[i - 1]
        const p1 = pathCoords[i]
        const p2 = pathCoords[i + 1]
        const p3 = i + 2 >= pathCoords.length ? pathCoords[pathCoords.length - 1] : pathCoords[i + 2]
        
        // Calculate segment distance to determine interpolation density
        // More points = smoother curves
        const segDist = haversineDistance(p1, p2)
        const numPoints = Math.min(20, Math.max(8, Math.ceil(segDist / 0.2))) // Increased for smoother curves
        
        const splinePoints = catmullRomSpline(p0, p1, p2, p3, numPoints)
        
        // Add all points except the last (to avoid duplicates)
        for (let j = 0; j < splinePoints.length - 1; j++) {
          smoothed.push(splinePoints[j])
        }
      }
      // Add the final point
      smoothed.push(pathCoords[pathCoords.length - 1])
      
      return smoothed
    }
    
    // Interpolate points along a segment (fallback for simple cases)
    const interpolateSegment = (start, end) => {
      const distance = haversineDistance(start, end)
      const numPoints = Math.min(4, Math.max(2, Math.ceil(distance / 2)))
      
      const points = []
      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1)
        points.push([
          start[0] + t * (end[0] - start[0]),
          start[1] + t * (end[1] - start[1])
        ])
      }
      return points
    }
    
    // For day replay: merge ALL trips into ONE continuous path
    // This ensures a single unbroken line for the entire day
    if (dayReplayActive) {
      // Sort trips by start time to ensure correct order
      const sortedTrips = [...timeFilteredTrips].sort((a, b) => 
        a.path[0].timestamp - b.path[0].timestamp
      )
      
      // Merge all trip coordinates into one continuous path
      const allCoords = []
      for (const trip of sortedTrips) {
        for (const point of trip.path) {
          allCoords.push(point.coordinates)
        }
      }
      
      if (allCoords.length < 2) {
        return [{
          path: allCoords,
          timestamps: allCoords.map((_, i) => i * 100),
          timeProgress: 0
        }]
      }
      
      // Apply smooth curve interpolation to the entire merged path
      const smoothedPath = smoothPath(allCoords)
      
      // Calculate cumulative distances for timestamp distribution
      const pathDistances = [0]
      for (let i = 1; i < smoothedPath.length; i++) {
        const segDist = haversineDistance(smoothedPath[i-1], smoothedPath[i])
        pathDistances.push(pathDistances[i-1] + segDist)
      }
      const totalDistance = pathDistances[pathDistances.length - 1] || 1
      
      // Create timestamps based on distance (0 to 10000)
      const timestamps = pathDistances.map(d => (d / totalDistance) * 10000)
      
      // Return a single continuous trip
      // timeProgress for each point is its position in the day (0 = start, 1 = end)
      return [{
        path: smoothedPath,
        timestamps,
        timeProgress: 0.5 // Middle value since color will be per-point based
      }]
    }
    
    // Regular animation: use actual timestamps
    let globalMinTime = Infinity
    let globalMaxTime = -Infinity
    
    for (const trip of timeFilteredTrips) {
      for (const point of trip.path) {
        if (point.timestamp < globalMinTime) globalMinTime = point.timestamp
        if (point.timestamp > globalMaxTime) globalMaxTime = point.timestamp
      }
    }
    
    const timeSpan = globalMaxTime - globalMinTime || 1
    
    return timeFilteredTrips.map(trip => {
      const avgTimestamp = trip.path.reduce((sum, p) => sum + p.timestamp, 0) / trip.path.length
      const timeProgress = (avgTimestamp - globalMinTime) / timeSpan
      
      // Interpolate sparse segments
      const interpolatedPath = []
      for (let i = 0; i < trip.path.length; i++) {
        if (i === 0) {
          interpolatedPath.push(trip.path[i])
        } else {
          const prevPoint = trip.path[i - 1]
          const currPoint = trip.path[i]
          const distance = haversineDistance(prevPoint.coordinates, currPoint.coordinates)
          
          if (distance > 2) {
            const interpPoints = interpolateSegment(prevPoint.coordinates, currPoint.coordinates)
            for (let j = 1; j < interpPoints.length; j++) {
              interpolatedPath.push({ coordinates: interpPoints[j], timestamp: 0 })
            }
          } else {
            interpolatedPath.push(currPoint)
          }
        }
      }
      
      const tripStartProgress = (trip.path[0].timestamp - globalMinTime) / timeSpan
      const tripEndProgress = (trip.path[trip.path.length - 1].timestamp - globalMinTime) / timeSpan
      const tripTimeWindow = Math.max((tripEndProgress - tripStartProgress) * 10000, 100)
      
      const numSegments = interpolatedPath.length - 1
      const timestamps = interpolatedPath.map((point, i) => {
        if (numSegments === 0) return tripStartProgress * 10000
        const progress = i / numSegments
        return tripStartProgress * 10000 + progress * tripTimeWindow
      })
      
      return {
        path: interpolatedPath.map(p => p.coordinates),
        timestamps,
        activityType: trip.activityType,
        timeProgress
      }
    })
  }, [timeFilteredTrips, dayReplayActive])
  
  // Static path data for non-animated display
  const staticPaths = useMemo(() => {
    return timeFilteredTrips.map(trip => ({
      path: trip.path.map(p => p.coordinates),
      activityType: trip.activityType
    }))
  }, [timeFilteredTrips])

  // Pre-aggregated grid data - computed once, very fast to render
  const gridData = useMemo(() => {
    if (!timeFilteredVisits || timeFilteredVisits.length === 0) return { cells: [], maxCount: 1 }
    
    const cells = aggregateToGrid(timeFilteredVisits, 0.015) // ~1.5km cells
    const maxCount = Math.max(...cells.map(c => c.count), 1)
    
    return { cells, maxCount }
  }, [timeFilteredVisits])

  // Build arcs
  const timeFilteredArcs = useMemo(() => {
    if (!timeFilteredVisits || timeFilteredVisits.length < 2) return []
    
    const sorted = [...timeFilteredVisits].sort((a, b) => a.timestamp - b.timestamp)
    const arcCounts = new Map()
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      
      const timeDiff = curr.timestamp - prev.timestamp
      if (timeDiff > 86400 * 2) continue
      
      const dist = Math.sqrt(
        Math.pow(curr.coordinates[0] - prev.coordinates[0], 2) +
        Math.pow(curr.coordinates[1] - prev.coordinates[1], 2)
      )
      if (dist < 0.001) continue
      
      const key = `${prev.coordinates[0].toFixed(3)},${prev.coordinates[1].toFixed(3)}|${curr.coordinates[0].toFixed(3)},${curr.coordinates[1].toFixed(3)}`
      
      if (arcCounts.has(key)) {
        arcCounts.get(key).count++
      } else {
        arcCounts.set(key, {
          source: prev.coordinates,
          target: curr.coordinates,
          count: 1,
          timestamp: curr.timestamp
        })
      }
    }
    
    return Array.from(arcCounts.values()).sort((a, b) => a.count - b.count)
  }, [timeFilteredVisits])

  // Trips animation - runs for both regular animation and day replay
  useEffect(() => {
    const shouldAnimate = (animating || dayReplayActive) && animatedTrips.length > 0
    
    if (!shouldAnimate) {
      if (tripsAnimationRef.current) {
        cancelAnimationFrame(tripsAnimationRef.current)
        tripsAnimationRef.current = null
      }
      return
    }
    
    // Day replay: 15 seconds, regular: 10 seconds
    const loopLength = 10000
    const animationDuration = dayReplayActive ? 15000 : 10000 // ms for full loop
    let startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = (elapsed % animationDuration) / animationDuration
      const loopTime = progress * loopLength
      setTripsTime(loopTime)
      tripsAnimationRef.current = requestAnimationFrame(animate)
    }
    
    tripsAnimationRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (tripsAnimationRef.current) {
        cancelAnimationFrame(tripsAnimationRef.current)
      }
    }
  }, [animating, dayReplayActive, animatedTrips.length])

  // Fly to location
  useEffect(() => {
    if (flyToLocation) {
      setViewState(prev => ({
        ...prev,
        longitude: flyToLocation.longitude,
        latitude: flyToLocation.latitude,
        zoom: flyToLocation.zoom || 13,
        pitch: 55,
        bearing: Math.random() * 40 - 20,
        transitionDuration: 2000,
        transitionInterpolator: new FlyToInterpolator()
      }))
      setFlyToLocation(null)
    }
  }, [flyToLocation, setFlyToLocation])

  // Click to explore
  const handleClick = useCallback((info) => {
    if (info.object) {
      const coords = info.object.coordinates || info.object.source
      if (coords) {
        setViewState(prev => ({
          ...prev,
          longitude: coords[0],
          latitude: coords[1],
          zoom: Math.min(prev.zoom + 3, 17),
          transitionDuration: 1000,
          transitionInterpolator: new FlyToInterpolator()
        }))
      }
    }
  }, [])

  const getVisitColor = useCallback((d) => {
    return getTimeColor(d.timestamp, minTime, maxTime)
  }, [minTime, maxTime])

  const getVisitRadius = useCallback((d) => {
    const durationFactor = Math.min(d.durationMinutes / 60, 12) / 12
    return 30 + durationFactor * 120
  }, [])

  const getArcColor = useCallback((d) => {
    return getTimeColor(d.timestamp, minTime, maxTime)
  }, [minTime, maxTime])

  const getArcHeight = useCallback((d) => {
    return 0.2 + Math.log2(d.count + 1) * 0.2
  }, [])

  // Calculate visited countries with days spent
  const visitedCountries = useMemo(() => {
    const rangeStart = minTime + (maxTime - minTime) * timeRange[0]
    const rangeEnd = minTime + (maxTime - minTime) * timeRange[1]
    
    const countryDays = {}
    
    for (const visit of visits) {
      if (visit.timestamp < rangeStart || visit.timestamp > rangeEnd) continue
      
      const addr = visit.address || ''
      const parts = addr.split(',').map(p => p.trim())
      let country = parts[parts.length - 1]
      
      // Clean up edge cases
      if (!country || country.match(/^\d/) || country.length > 30) continue
      
      // Map to GeoJSON names
      country = COUNTRY_NAME_MAP[country] || country
      
      if (!countryDays[country]) {
        countryDays[country] = new Set()
      }
      const day = new Date(visit.timestamp * 1000).toDateString()
      countryDays[country].add(day)
    }
    
    const result = {}
    for (const [country, days] of Object.entries(countryDays)) {
      result[country] = days.size
    }
    return result
  }, [visits, timeRange, minTime, maxTime])

  const layers = useMemo(() => {
    const result = []

    // Country polygons layer - glowing effect
    if (countriesGeoJson) {
      const maxDays = Math.max(...Object.values(visitedCountries), 1)
      
      // Calculate zoom-based transparency for country fills
      // At zoom 4-6: full visibility, zoom 10+: nearly invisible
      const zoomAlphaFactor = Math.max(0, Math.min(1, (10 - viewState.zoom) / 5))
      
      result.push(
        new GeoJsonLayer({
          id: 'countries',
          data: countriesGeoJson,
          stroked: true,
          filled: true,
          getFillColor: f => {
            const countryName = f.properties.name
            const days = visitedCountries[countryName] || 0
            if (days === 0) return [0, 0, 0, 0]
            
            // Pure cyan glow - intensity increases with days
            // Use log scale for better distribution
            const t = Math.min(Math.log(days + 1) / Math.log(maxDays + 1), 1)
            // Base alpha reduced by zoom factor
            const baseAlpha = 25 + t * 100
            const zoomAdjustedAlpha = Math.round(baseAlpha * zoomAlphaFactor)
            return [
              0,                              // R: 0 (pure cyan)
              Math.round(180 + t * 32),       // G: 180 -> 212
              255,                            // B: 255
              zoomAdjustedAlpha               // Alpha fades as you zoom in
            ]
          },
          getLineColor: f => {
            const days = visitedCountries[f.properties.name] || 0
            if (days === 0) return [0, 0, 0, 0]
            const t = Math.min(Math.log(days + 1) / Math.log(maxDays + 1), 1)
            // Border stays more visible but still fades somewhat
            const borderAlphaFactor = Math.max(0.3, zoomAlphaFactor)
            return [0, 212, 255, Math.round((150 + t * 105) * borderAlphaFactor)]
          },
          getLineWidth: f => {
            const days = visitedCountries[f.properties.name] || 0
            if (days === 0) return 0
            const t = Math.min(Math.log(days + 1) / Math.log(maxDays + 1), 1)
            return 2 + t * 4 // Width: 2 -> 6
          },
          lineWidthMinPixels: 2,
          lineWidthMaxPixels: 8,
          updateTriggers: {
            getFillColor: [visitedCountries, viewState.zoom],
            getLineColor: [visitedCountries, viewState.zoom],
            getLineWidth: [visitedCountries]
          }
        })
      )
    }

    // Trips Layer - animated when playing or day replay, static otherwise
    if (visibleLayers.trips || dayReplayActive) {
      if ((animating || dayReplayActive) && animatedTrips.length > 0) {
        // Animated trails with comet effect - bright head, fading tail
        
        if (dayReplayActive) {
          // Outer tail - long, faint, wide fade
          result.push(
            new TripsLayer({
              id: 'animated-trips-tail-outer',
              data: animatedTrips,
              getPath: d => d.path,
              getTimestamps: d => d.timestamps,
              getColor: [100, 50, 180, 30], // Faint purple tail
              opacity: 1,
              widthMinPixels: 12,
              widthMaxPixels: 18,
              trailLength: 5000, // Long fading tail
              currentTime: tripsTime,
              shadowEnabled: false,
              capRounded: true,
              jointRounded: true
            })
          )
          
          // Mid tail - electric blue
          result.push(
            new TripsLayer({
              id: 'animated-trips-tail-mid',
              data: animatedTrips,
              getPath: d => d.path,
              getTimestamps: d => d.timestamps,
              getColor: [0, 200, 255, 100], // Electric cyan
              opacity: 1,
              widthMinPixels: 6,
              widthMaxPixels: 10,
              trailLength: 3500,
              currentTime: tripsTime,
              shadowEnabled: false,
              capRounded: true,
              jointRounded: true
            })
          )
          
          // Inner glow - bright cyan
          result.push(
            new TripsLayer({
              id: 'animated-trips-glow',
              data: animatedTrips,
              getPath: d => d.path,
              getTimestamps: d => d.timestamps,
              getColor: [100, 255, 255, 200], // Bright cyan glow
              opacity: 1,
              widthMinPixels: 3,
              widthMaxPixels: 5,
              trailLength: 2500,
              currentTime: tripsTime,
              shadowEnabled: false,
              capRounded: true,
              jointRounded: true
            })
          )
        }
        
        // Core - bright white head
        result.push(
          new TripsLayer({
            id: 'animated-trips',
            data: animatedTrips,
            getPath: d => d.path,
            getTimestamps: d => d.timestamps,
            getColor: dayReplayActive ? [255, 255, 255, 255] : [0, 212, 255, 255],
            opacity: 1,
            widthMinPixels: dayReplayActive ? 2 : 4,
            widthMaxPixels: dayReplayActive ? 3 : 8,
            trailLength: dayReplayActive ? 1500 : 600, // Shorter, concentrated head
            currentTime: tripsTime,
            shadowEnabled: false,
            capRounded: true,
            jointRounded: true
          })
        )
        
        // Also show static path underneath during day replay with gradient
        if (dayReplayActive && animatedTrips.length > 0 && animatedTrips[0].path.length > 1) {
          // Split the continuous path into segments for gradient coloring
          const fullPath = animatedTrips[0].path
          const numSegments = Math.min(50, Math.max(10, Math.floor(fullPath.length / 5)))
          const segmentSize = Math.ceil(fullPath.length / numSegments)
          
          const gradientSegments = []
          for (let i = 0; i < numSegments; i++) {
            const startIdx = i * segmentSize
            const endIdx = Math.min((i + 1) * segmentSize + 1, fullPath.length) // +1 for overlap
            if (startIdx >= fullPath.length - 1) break
            
            gradientSegments.push({
              path: fullPath.slice(startIdx, endIdx),
              timeProgress: i / (numSegments - 1) // 0 to 1 across the day
            })
          }
          
          result.unshift(
            new PathLayer({
              id: 'day-replay-path-bg',
              data: gradientSegments,
              getPath: d => d.path,
              getColor: d => {
                const t = d.timeProgress || 0
                // Contemporary gradient: Cyan → Purple with 15% opacity
                // Cyan [0, 220, 255] → Magenta [200, 50, 255]
                return [
                  Math.round(t * 200),           // R: 0 -> 200
                  Math.round(220 - t * 170),     // G: 220 -> 50
                  255,                            // B: stays 255
                  38  // ~15% opacity - very subtle
                ]
              },
              getWidth: 4,
              widthMinPixels: 3,
              widthMaxPixels: 10,
              widthUnits: 'pixels',
              capRounded: true,
              jointRounded: true,
              billboard: true
            })
          )
        }
      } else if (staticPaths.length > 0 && visibleLayers.trips) {
        // Static path display
        result.push(
          new PathLayer({
            id: 'static-trips',
            data: staticPaths,
            getPath: d => d.path,
            getColor: [0, 212, 255, 150],
            getWidth: 3,
            widthMinPixels: 2,
            widthMaxPixels: 6,
            widthUnits: 'pixels',
            capRounded: true,
            jointRounded: true
          })
        )
      }
    }

    // 3D Arcs
    if (visibleLayers.arcs && timeFilteredArcs.length) {
      result.push(
        new ArcLayer({
          id: 'arcs-3d',
          data: timeFilteredArcs,
          getSourcePosition: d => d.source,
          getTargetPosition: d => d.target,
          getSourceColor: getArcColor,
          getTargetColor: getArcColor,
          getWidth: d => Math.min(1 + Math.log2(d.count + 1), 5),
          getHeight: getArcHeight,
          greatCircle: true,
          pickable: true,
          onClick: handleClick
        })
      )
    }


    // 3D Column density layer - pre-aggregated for maximum performance
    if (visibleLayers.hexagon && gridData.cells.length) {
      const { cells, maxCount } = gridData
      
      // Dynamic radius based on zoom level (smaller at higher zoom)
      const baseRadius = 600
      const zoomFactor = Math.pow(2, 11 - viewState.zoom)
      const dynamicRadius = Math.max(100, Math.min(2000, baseRadius * zoomFactor))
      
      result.push(
        new ColumnLayer({
          id: 'density-columns',
          data: cells,
          diskResolution: 6,         // Hexagonal shape
          radius: dynamicRadius,
          extruded: true,
          pickable: true,            // Enable hover
          elevationScale: 200 * zoomFactor,
          getPosition: d => d.position,
          getElevation: d => Math.min(Math.log2(d.count + 1) * 8, 60),
          getFillColor: d => {
            const t = Math.min(d.count / Math.max(maxCount * 0.3, 1), 1)
            // Teal → Cyan → Yellow → Orange → Red
            if (t < 0.25) {
              return [1, 152 + t * 300, 189 + t * 68, 200]
            } else if (t < 0.5) {
              const t2 = (t - 0.25) / 0.25
              return [73 + t2 * 180, 227 + t2 * 10, 206 - t2 * 29, 220]
            } else if (t < 0.75) {
              const t2 = (t - 0.5) / 0.25
              return [254, 237 - t2 * 64, 177 - t2 * 93, 240]
            } else {
              const t2 = (t - 0.75) / 0.25
              return [254 - t2 * 45, 173 - t2 * 118, 84 - t2 * 6, 255]
            }
          },
          material: {
            ambient: 0.6,
            diffuse: 0.6,
            shininess: 40,
            specularColor: [60, 180, 220]
          },
          updateTriggers: {
            radius: viewState.zoom,
            elevationScale: viewState.zoom
          }
        })
      )
    }

    // Visit points
    if (visibleLayers.visits && timeFilteredVisits.length) {
      // Outer glow
      result.push(
        new ScatterplotLayer({
          id: 'visits-glow',
          data: timeFilteredVisits,
          getPosition: d => d.coordinates,
          getFillColor: d => {
            const color = getVisitColor(d)
            return [color[0], color[1], color[2], 25]
          },
          getRadius: d => getVisitRadius(d) * 3,
          radiusMinPixels: 10,
          radiusMaxPixels: 60,
          pickable: false
        })
      )
      
      // Main points
      result.push(
        new ScatterplotLayer({
          id: 'visits',
          data: timeFilteredVisits,
          getPosition: d => d.coordinates,
          getFillColor: getVisitColor,
          getRadius: getVisitRadius,
          radiusMinPixels: 4,
          radiusMaxPixels: 18,
          pickable: true,
          onClick: handleClick,
          stroked: true,
          getLineColor: [255, 255, 255, 40],
          lineWidthMinPixels: 1
        })
      )
    }

    return result
  }, [
    timeFilteredVisits, 
    timeFilteredArcs, 
    animatedTrips,
    staticPaths,
    gridData,
    visibleLayers, 
    viewState.zoom,
    tripsTime,
    animating,
    dayReplayActive,
    countriesGeoJson,
    visitedCountries,
    getVisitColor, 
    getVisitRadius, 
    getArcColor, 
    getArcHeight,
    handleClick
  ])

  return (
    <div className="map-container">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState }) => setViewState(viewState)}
        controller={true}
        layers={layers}
        getTooltip={({ object }) => object && {
          html: object.semanticType 
            ? `<div class="map-tooltip">
                ${object.placeName ? `<div class="tooltip-name">${object.placeName}</div>` : ''}
                ${object.primaryType ? `<div class="tooltip-type-badge">${object.primaryType.replace(/_/g, ' ')}</div>` : ''}
                ${!object.placeName && object.address ? `<div class="tooltip-address">${object.address.split(',').slice(0, 2).join(',')}</div>` : ''}
                <div class="tooltip-meta">${object.semanticType}${object.city ? ` · ${object.city}` : ''}</div>
                <div class="tooltip-date">${new Date(object.timestamp * 1000).toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric',
                  year: 'numeric'
                })}</div>
                <div class="tooltip-duration">${Math.round(object.durationMinutes)} min</div>
              </div>`
            : object.topLocation 
            ? `<div class="map-tooltip">
                <div class="tooltip-name">${object.topLocation}</div>
                <div class="tooltip-type-badge">top location</div>
                <div class="tooltip-stats">
                  <span class="tooltip-stat">${object.count} visits</span>
                  <span class="tooltip-divider">·</span>
                  <span class="tooltip-stat">${object.uniquePlaces} places</span>
                </div>
                ${object.topLocationCount > 1 ? `<div class="tooltip-detail">${object.topLocationCount}× visited here</div>` : ''}
              </div>`
            : object.count 
            ? `<div class="map-tooltip"><div class="tooltip-count">${object.count}× traveled</div></div>`
            : null,
          style: {
            backgroundColor: 'rgba(8, 12, 20, 0.95)',
            color: '#e0f2ff',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: "'Inter', sans-serif",
            border: '1px solid rgba(0, 212, 255, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 212, 255, 0.1)',
          }
        }}
      >
        <MapGL mapStyle={MAP_STYLE} />
      </DeckGL>
    </div>
  )
}

export default FlowMap
