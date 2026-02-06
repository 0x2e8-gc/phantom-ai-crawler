import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/common/Layout'
import { Dashboard } from './components/Dashboard'
import { TargetDetail } from './components/TargetDetail'
import { DNALaboratory } from './components/DNALaboratory'
import { MCPConsole } from './components/MCPConsole'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/target/:id" element={<TargetDetail />} />
        <Route path="/dna-lab" element={<DNALaboratory />} />
        <Route path="/mcp-console" element={<MCPConsole />} />
      </Routes>
    </Layout>
  )
}

export default App
