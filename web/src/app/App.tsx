import { Navigate, Route, Routes } from 'react-router-dom'
import SimPage from '../sim/SimPage'
import { Catalog } from '../sim/ui/Catalog'
import { Home } from '../sim/ui/Home'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/audiencias" element={<Catalog />} />
      <Route path="/sim/:id" element={<SimPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
