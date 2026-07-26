import { NavLink } from 'react-router-dom'

export default function AdminNav() {
  return (
    <nav className="admin-nav">
      <NavLink
        to="/admin"
        end
        className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
      >
        Equipment
      </NavLink>
      <NavLink
        to="/admin/borrowers"
        className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
      >
        Borrowers
      </NavLink>
    </nav>
  )
}
