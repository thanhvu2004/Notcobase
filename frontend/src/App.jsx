import { useEffect, useState } from 'react'
import LoginPage from './features/auth/LoginPage'
import TablesApp from './features/tables/TablesApp'
import UsersApp from './features/users/UsersApp'
import './App.css'

export default function App() {
  const [route, setRoute] = useState(() => localStorage.getItem('notcobase:route') || 'tables')
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('notcobase:user')
    return stored ? JSON.parse(stored) : null
  })

  const isAuthenticated = Boolean(localStorage.getItem('jwtToken'))

  useEffect(() => {
    localStorage.setItem('notcobase:route', route)
  }, [route])

  function handleLogout() {
    localStorage.removeItem('jwtToken')
    localStorage.removeItem('notcobase:user')
    setUser(null)
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={setUser} />
  }

  return (
    <div className="app-frame">
      <header className="top-nav">
        <button type="button" className="brand-button" onClick={() => setRoute('tables')}>
          Notcobase
        </button>
        <nav>
          <button
            type="button"
            className={route === 'tables' ? 'active' : ''}
            onClick={() => setRoute('tables')}
          >
            Tables
          </button>
          <button
            type="button"
            className={route === 'users' ? 'active' : ''}
            onClick={() => setRoute('users')}
          >
            Users
          </button>
        </nav>
        <div className="session-controls">
          <span>{user?.username || 'Signed in'}</span>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {route === 'users' ? <UsersApp /> : <TablesApp />}
    </div>
  )
}
