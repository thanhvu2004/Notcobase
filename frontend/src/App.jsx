import { useCallback, useEffect, useState } from 'react'
import LoginPage from './features/auth/LoginPage'
import PageBuilder from './features/pages/PageBuilder'
import { createDefaultPageSchema, createPage, fetchPages } from './features/pages/pagesApi'
import TablesApp from './features/tables/TablesApp'
import UsersApp from './features/users/UsersApp'
import './App.css'

export default function App() {
  const [route, setRoute] = useState(() => localStorage.getItem('notcobase:route') || 'tables')
  const [pages, setPages] = useState([])
  const [editorMode, setEditorMode] = useState(() => localStorage.getItem('notcobase:editor-mode') === 'true')
  const [locationSearch, setLocationSearch] = useState(() => window.location.search)
  const [creatingPage, setCreatingPage] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('notcobase:user')
    return stored ? JSON.parse(stored) : null
  })

  const isAuthenticated = Boolean(localStorage.getItem('jwtToken'))

  const loadPages = useCallback(async () => {
    try {
      const nextPages = await fetchPages()
      setPages(nextPages)
      setError('')
      return nextPages
    } catch (err) {
      setError(err.message)
      return []
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('notcobase:route', route)
  }, [route])

  useEffect(() => {
    localStorage.setItem('notcobase:editor-mode', String(editorMode))
  }, [editorMode])

  useEffect(() => {
    if (!isAuthenticated) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPages()
  }, [isAuthenticated, loadPages])

  async function handleCreatePage() {
    const name = window.prompt('Page name', 'New page')
    if (!name?.trim()) return

    setCreatingPage(true)
    try {
      const created = await createPage({
        name: name.trim(),
        schemaJson: JSON.stringify(createDefaultPageSchema(name.trim())),
        isPublished: true,
      })
      setPages((items) => [...items, created].sort((a, b) => a.name.localeCompare(b.name)))
      setEditorMode(true)
      navigateRoute(`page:${created.id}`)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCreatingPage(false)
    }
  }

  async function handlePagesChanged(change = {}) {
    const nextPages = await loadPages()
    if (change.deletedPageId) {
      const fallback = nextPages.find((page) => page.id !== change.deletedPageId)
      navigateRoute(fallback ? `page:${fallback.id}` : 'tables')
    }
  }

  function handleEditorModeChange(nextEditorMode) {
    setEditorMode(nextEditorMode)
    if (!nextEditorMode && !route.startsWith('page:') && pages[0]) {
      navigateRoute(`page:${pages[0].id}`)
    }
  }

  function handleLogout() {
    localStorage.removeItem('jwtToken')
    localStorage.removeItem('notcobase:user')
    setUser(null)
  }

  function clearLocationSearch() {
    if (!window.location.search) {
      setLocationSearch('')
      return
    }
    window.history.pushState(null, '', window.location.pathname)
    setLocationSearch('')
  }

  function navigateRoute(nextRoute) {
    clearLocationSearch()
    setRoute(nextRoute)
  }

  function handleNavigate({ targetPageId, params = {} } = {}) {
    if (editorMode) return false

    if (!targetPageId) {
      setError('Select a target page first.')
      return false
    }

    const nextParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') nextParams.delete(key)
      else nextParams.set(key, String(value))
    })
    const nextSearch = nextParams.toString()
    const searchText = nextSearch ? `?${nextSearch}` : ''
    window.history.pushState(null, '', `${window.location.pathname}${searchText}`)
    setLocationSearch(searchText)
    setRoute(`page:${Number(targetPageId)}`)
    setError('')
    return true
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={setUser} />
  }

  const routedPageId = route.startsWith('page:') ? Number(route.slice(5)) : null
  const activePage = pages.find((page) => page.id === routedPageId) || (!editorMode ? pages[0] : null)
  const activePageId = activePage?.id ?? routedPageId

  return (
    <div className="app-frame">
      <header className="top-nav">
        <button
          type="button"
          className="brand-button"
          onClick={() => navigateRoute(editorMode ? 'tables' : pages[0] ? `page:${pages[0].id}` : route)}
        >
          Notcobase
        </button>
        <nav>
          {editorMode && (
            <>
              <button type="button" className={route === 'tables' ? 'active' : ''} onClick={() => navigateRoute('tables')}>
                Tables
              </button>
              <button type="button" className={route === 'users' ? 'active' : ''} onClick={() => navigateRoute('users')}>
                Users
              </button>
            </>
          )}
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={activePageId === page.id ? 'active' : ''}
              onClick={() => navigateRoute(`page:${page.id}`)}
            >
              {page.name}
            </button>
          ))}
          {editorMode && (
            <button type="button" className="nav-add-button" disabled={creatingPage} onClick={handleCreatePage} aria-label="Create page">
              +
            </button>
          )}
        </nav>
        <div className="session-controls">
          <label className="editor-mode-toggle">
            <input className="custom-checkbox" type="checkbox" checked={editorMode} onChange={(event) => handleEditorModeChange(event.target.checked)} />
            Editor Mode
          </label>
          <span>{user?.username || 'Signed in'}</span>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error && <div className="error-banner app-error">{error}</div>}

      {!editorMode && pages.length === 0 ? (
        <main className="page-content">
          <section className="empty-state">
            <h2>No pages yet</h2>
            <p>Turn on Editor Mode to create the first page.</p>
          </section>
        </main>
      ) : route === 'users' && editorMode ? (
        <UsersApp />
      ) : activePage ? (
        <PageBuilder pageId={activePage.id} pages={pages} editorMode={editorMode} onPagesChanged={handlePagesChanged} onNavigate={handleNavigate} navigationSearch={locationSearch} />
      ) : activePageId ? (
        <main className="page-content">
          <section className="empty-state">
            <h2>Page not found</h2>
            <p>The selected page is no longer available.</p>
          </section>
        </main>
      ) : editorMode ? (
        <TablesApp />
      ) : (
        <main className="page-content">
          <section className="empty-state">
            <h2>Select a page</h2>
            <p>Choose an existing page from the navigation bar.</p>
          </section>
        </main>
      )}
    </div>
  )
}
