import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './routes/ProtectedRoute'
import ItemPage from './routes/ItemPage'
import AdminDashboard from './routes/AdminDashboard'
import BrowseEquipment from './routes/BrowseEquipment'
import Header from './components/Header'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<BrowseEquipment />} />
          <Route path="/browse" element={<BrowseEquipment />} />
          <Route path="/item/:id" element={<ItemPage />} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
