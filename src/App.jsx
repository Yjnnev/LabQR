import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './routes/ProtectedRoute'
import ItemPage from './routes/ItemPage'
import MyBorrows from './routes/MyBorrows'
import AdminDashboard from './routes/AdminDashboard'
import Borrowers from './routes/Borrowers'
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
          <Route path="/my-borrows" element={<ProtectedRoute><MyBorrows /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/borrowers" element={<ProtectedRoute adminOnly><Borrowers /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
