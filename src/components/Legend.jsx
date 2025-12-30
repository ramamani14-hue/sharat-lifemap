import './Legend.css'

function Legend() {
  return (
    <div className="legend-panel">
      <div className="legend-title">
        <span className="legend-icon">◈</span>
        Timeline Gradient
      </div>
      <div className="legend-gradient">
        <div className="gradient-bar"></div>
        <div className="gradient-labels">
          <span className="gradient-label start">2014</span>
          <span className="gradient-label end">2025</span>
        </div>
      </div>
      <div className="legend-hint">
        Click any point to explore
      </div>
    </div>
  )
}

export default Legend
