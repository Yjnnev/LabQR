import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './routes/ProtectedRoute'
import ItemPage from './routes/ItemPage'
import AdminDashboard from './routes/AdminDashboard'
import Login from './routes/Login'
import BrowseEquipment from './routes/BrowseEquipment'
import Header from './components/Header'

function Home() {
  return (
    <div className="status-text">
      <h1>LabQR</h1>
      <p>Scan an equipment QR code to get started.</p>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/item/:id" element={<ProtectedRoute><ItemPage /></ProtectedRoute>} />
          <Route path="/browse" element={<ProtectedRoute><BrowseEquipment /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
