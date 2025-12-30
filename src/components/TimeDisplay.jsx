import { useMemo } from 'react'
import './TimeDisplay.css'

function TimeDisplay({ timeRange, metadata }) {
  const minTime = metadata?.minTimestamp || 0
  const maxTime = metadata?.maxTimestamp || Date.now() / 1000
  
  const currentDate = useMemo(() => {
    const currentTimestamp = minTime + (maxTime - minTime) * timeRange[1]
    return new Date(currentTimestamp * 1000)
  }, [timeRange, minTime, maxTime])
  
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }
  
  const getYear = (date) => date.getFullYear()
  const getMonth = (date) => date.toLocaleDateString('en-US', { month: 'short' })
  const getDay = (date) => date.getDate()

  return (
    <div className="time-display-panel">
      <div className="current-time-label">Current Position</div>
      <div className="current-time-value">
        <span className="time-month">{getMonth(currentDate)}</span>
        <span className="time-day">{getDay(currentDate)}</span>
        <span className="time-year">{getYear(currentDate)}</span>
      </div>
      <div className="time-full">{formatDate(currentDate)}</div>
    </div>
  )
}

export default TimeDisplay




