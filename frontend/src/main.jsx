import React from 'react'
import ReactDOM from 'react-dom/client'

function App() {
  return (
    <div style={{fontFamily:'sans-serif',textAlign:'center',padding:'60px'}}>
      <h1>🎯 SAT Prep Platform</h1>
      <p>AI-powered adaptive SAT practice</p>
      <p style={{color:'green'}}>✅ Coming soon!</p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
