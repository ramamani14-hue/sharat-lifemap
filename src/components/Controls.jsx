import { useMemo } from 'react'
import './Controls.css'

function Controls({ 
  metadata, 
  timeRange, 
  setTimeRange, 
  visibleLayers, 
  setVisibleLayers,
  animating,
  onPlay,
  onPause,
  onRestart,
  onStop
}) {
  const minDate = useMemo(() => 
    metadata?.minTimestamp ? new Date(metadata.minTimestamp * 1000) : new Date(2014, 0, 1),
    [metadata]
  )
  
  const maxDate = useMemo(() => 
    metadata?.maxTimestamp ? new Date(metadata.maxTimestamp * 1000) : new Date(),
    [metadata]
  )

  const formatDate = (progress) => {
    const timestamp = minDate.getTime() + (maxDate.getTime() - minDate.getTime()) * progress
    return new Date(timestamp).toLocaleDateString('en-US', { 
      month: 'short', 
      year: 'numeric' 
    })
  }

  const toggleLayer = (layer) => {
    setVisibleLayers(prev => ({ ...prev, [layer]: !prev[layer] }))
  }

  return (
    <div className="controls-panel">
      {/* Time Range */}
      <div className="control-section">
        <label className="control-label">
          <span className="label-icon">◈</span>
          Time Window
        </label>
        <div className="time-display">
          <span className="time-value">{formatDate(timeRange[0])}</span>
          <span className="time-separator">
            <span className="separator-line"></span>
            <span className="separator-dot"></span>
            <span className="separator-line"></span>
          </span>
          <span className="time-value">{formatDate(timeRange[1])}</span>
        </div>
        <div className="range-slider-container">
          <div className="range-track"></div>
          <div 
            className="range-fill" 
            style={{
              left: `${timeRange[0] * 100}%`,
              width: `${(timeRange[1] - timeRange[0]) * 100}%`
            }}
          ></div>
          <input
            type="range"
            className="range-slider"
            min="0"
            max="1"
            step="0.001"
            value={timeRange[0]}
            onChange={(e) => setTimeRange([parseFloat(e.target.value), timeRange[1]])}
          />
          <input
            type="range"
            className="range-slider"
            min="0"
            max="1"
            step="0.001"
            value={timeRange[1]}
            onChange={(e) => setTimeRange([timeRange[0], parseFloat(e.target.value)])}
          />
        </div>
      </div>

      {/* Layers */}
      <div className="control-section">
        <label className="control-label">
          <span className="label-icon">◎</span>
          Data Layers
        </label>
        <div className="layer-toggles">
          <button 
            className={`layer-toggle ${visibleLayers.visits ? 'active' : ''}`}
            onClick={() => toggleLayer('visits')}
          >
            <span className="toggle-indicator"></span>
            <span className="toggle-label">Points</span>
          </button>
          <button 
            className={`layer-toggle ${visibleLayers.arcs ? 'active' : ''}`}
            onClick={() => toggleLayer('arcs')}
          >
            <span className="toggle-indicator"></span>
            <span className="toggle-label">Arcs</span>
          </button>
          <button 
            className={`layer-toggle ${visibleLayers.trips ? 'active' : ''}`}
            onClick={() => toggleLayer('trips')}
          >
            <span className="toggle-indicator"></span>
            <span className="toggle-label">Trails</span>
          </button>
          <button 
            className={`layer-toggle hexagon ${visibleLayers.hexagon ? 'active' : ''}`}
            onClick={() => toggleLayer('hexagon')}
          >
            <span className="toggle-indicator"></span>
            <span className="toggle-label">Density</span>
          </button>
        </div>
      </div>

      {/* Animation Controls */}
      <div className="control-section">
        <div className="animation-controls">
          {animating ? (
            <button 
              className="animate-button active"
              onClick={onPause}
            >
              <span className="animate-icon">⏸</span>
              <span className="animate-text">Pause</span>
            </button>
          ) : (
            <button 
              className="animate-button"
              onClick={onPlay}
            >
              <span className="animate-icon">▶</span>
              <span className="animate-text">Play</span>
            </button>
          )}
          <button 
            className="animate-button secondary"
            onClick={onRestart}
            title="Restart from beginning"
          >
            <span className="animate-icon">↺</span>
          </button>
          <button 
            className="animate-button secondary"
            onClick={onStop}
            title="Stop and reset"
          >
            <span className="animate-icon">◼</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Controls
