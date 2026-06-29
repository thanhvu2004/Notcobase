import { useCallback, useEffect, useState } from 'react'
import LoginPage from './features/auth/LoginPage'
import PageBuilder from './features/pages/PageBuilder'
import { createDefaultPageSchema, createPage, fetchPages, movePageToSection } from './features/pages/pagesApi'
import TablesApp from './features/tables/TablesApp'
import UsersApp from './features/users/UsersApp'
import './App.css'
import { Dropdown } from 'antd'
import { DownOutlined } from '@ant-design/icons'

function normalizeSectionName(sectionName) {
  if (typeof sectionName !== 'string') return ''
  return sectionName.trim()
}

function normalizeSectionList(sectionNames) {
  if (!Array.isArray(sectionNames)) return []
  return Array.from(new Set(sectionNames.map(normalizeSectionName).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

export default function App() {
  const [route, setRoute] = useState(() => localStorage.getItem('notcobase:route') || 'tables')
  const [pages, setPages] = useState([])
  const [customSections, setCustomSections] = useState(() => {
    const stored = localStorage.getItem('notcobase:page-sections')
    try {
      return stored ? normalizeSectionList(JSON.parse(stored)) : []
    } catch {
      return []
    }
  })
  const [navOrder, setNavOrder] = useState(() => {
    const stored = localStorage.getItem('notcobase:nav-order')
    return stored ? JSON.parse(stored) : []
  })
  const [navDrag, setNavDrag] = useState(null)
  const [navDropTarget, setNavDropTarget] = useState(null)
  const [editorMode, setEditorMode] = useState(() => localStorage.getItem('notcobase:editor-mode') === 'true')
  const [locationSearch, setLocationSearch] = useState(() => window.location.search)
  const [creatingPage, setCreatingPage] = useState(false)
  const [, setPageMenuOpen] = useState(false)
  const [openSectionName, setOpenSectionName] = useState('')
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
    localStorage.setItem('notcobase:page-sections', JSON.stringify(customSections))
  }, [customSections])

  useEffect(() => {
    localStorage.setItem('notcobase:nav-order', JSON.stringify(navOrder))
  }, [navOrder])

  useEffect(() => {
    if (!isAuthenticated) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPages()
  }, [isAuthenticated, loadPages])

  useEffect(() => {
    function closeNavDropdowns(event) {
      if (event.target.closest('.nav-section, .nav-add-menu')) return
      setOpenSectionName('')
      setPageMenuOpen(false)
    }

    document.addEventListener('mousedown', closeNavDropdowns)
    return () => document.removeEventListener('mousedown', closeNavDropdowns)
  }, [])

  async function handleCreatePage(sectionName = '') {
    const name = window.prompt('Page name', 'New page')
    if (!name?.trim()) return

    setCreatingPage(true)
    try {
      const created = await createPage({
        name: name.trim(),
        sectionName: sectionName || null,
        schemaJson: JSON.stringify(createDefaultPageSchema(name.trim())),
        isPublished: true,
      })
      setPages((items) => [...items, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNavOrder((items) => [...items.filter((item) => item !== `page:${created.id}`), `page:${created.id}`])
      setEditorMode(true)
      navigateRoute(`page:${created.id}`)
      if (sectionName) setOpenSectionName(sectionName)
      setPageMenuOpen(false)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCreatingPage(false)
    }
  }

  async function handleCreateSection() {
    const sectionName = window.prompt('Section name', 'New section')
    if (!sectionName?.trim()) return
    const nextSectionName = sectionName.trim()
    setCustomSections((items) => normalizeSectionList([...items, nextSectionName]))
    setNavOrder((items) => [...items.filter((item) => item !== `section:${nextSectionName}`), `section:${nextSectionName}`])
    setOpenSectionName(nextSectionName)
    setPageMenuOpen(false)
  }

  async function updatePageSection(pageId, sectionName) {
    const page = pages.find((item) => item.id === Number(pageId))
    if (!page || (page.sectionName || '') === (sectionName || '')) {
      return page
    }
    const nextSectionName = sectionName || null
    const previousPages = pages
    setPages((items) => items.map((item) => (
      item.id === page.id ? { ...item, sectionName: nextSectionName } : item
    )).sort((a, b) => a.name.localeCompare(b.name)))
    if (nextSectionName) {
      setCustomSections((items) => normalizeSectionList([...items, nextSectionName]))
    }

    try {
      const updated = await movePageToSection(page, sectionName || null)
      setPages((items) => items.map((item) => item.id === updated.id ? updated : item).sort((a, b) => a.name.localeCompare(b.name)))
      return updated
    } catch (err) {
      setPages(previousPages)
      throw err
    }
  }

  function moveOrderItem(items, draggedKey, targetKey, position = 'before') {
    const withoutDragged = items.filter((item) => item !== draggedKey)
    const targetIndex = withoutDragged.indexOf(targetKey)
    if (targetIndex < 0) return [...withoutDragged, draggedKey]
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
    const nextItems = [...withoutDragged]
    nextItems.splice(insertIndex, 0, draggedKey)
    return nextItems
  }

  function startNavDrag(event, dragPayload) {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/json', JSON.stringify(dragPayload))
    event.dataTransfer.setData('text/plain', dragPayload.orderKey)
    setNavDrag(dragPayload)
    setNavDropTarget(null)
  }

  function getNavDragPayload(event) {
    if (navDrag) return navDrag
    try {
      const payload = event.dataTransfer.getData('application/json')
      return payload ? JSON.parse(payload) : null
    } catch {
      return null
    }
  }

  function getDropPosition(event, axis = 'horizontal') {
    const rect = event.currentTarget.getBoundingClientRect()
    if (axis === 'vertical') return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
    return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before'
  }

  function getNavDropClass(target) {
    if (!navDropTarget || navDropTarget.orderKey !== target.orderKey || navDropTarget.type !== target.type) return ''
    if (navDropTarget.position === 'inside') return ' nav-drop-inside'
    return ` nav-drop-${navDropTarget.position}`
  }

  function handleNavDragOver(target, event) {
    if (!editorMode) return
    const dragged = getNavDragPayload(event)
    if (!dragged || dragged.orderKey === target.orderKey) return

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'

    const position = dragged.type === 'page' && target.type === 'section'
      ? 'inside'
      : getDropPosition(event, target.axis)

    setNavDropTarget((current) => (
      current?.type === target.type &&
      current?.orderKey === target.orderKey &&
      current?.position === position
        ? current
        : { type: target.type, orderKey: target.orderKey, position }
    ))
  }

  async function handleNavDrop(target, event) {
    event.preventDefault()
    event.stopPropagation()
    const dragged = getNavDragPayload(event)
    if (!dragged) {
      return
    }

    let dropPosition = 'before'
    if (target.orderKey && dragged.orderKey !== target.orderKey && event.currentTarget) {
      dropPosition = getDropPosition(event, target.axis)
    }

    try {
      if (dragged.type === 'page' && target.type === 'section') {
        await updatePageSection(dragged.pageId, target.sectionName)
        setOpenSectionName(target.sectionName)
      } else if (dragged.type === 'page' && target.type === 'page') {
        await updatePageSection(dragged.pageId, target.sectionName || '')
        if (target.sectionName) setOpenSectionName(target.sectionName)
      } else if (dragged.type === 'page' && target.type === 'root') {
        await updatePageSection(dragged.pageId, '')
      }

      if (
        target.orderKey &&
        dragged.orderKey !== target.orderKey &&
        (dragged.type !== 'page' || target.type !== 'section')
      ) {
        setNavOrder((items) => moveOrderItem(items, dragged.orderKey, target.orderKey, dropPosition))
      }

      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setNavDrag(null)
      setNavDropTarget(null)
    }
  }

  async function handleRemoveSection(sectionName) {
    if (!window.confirm(`Remove section "${sectionName}"? Pages inside will move outside.`)) return
    try {
      const sectionPages = pages.filter((page) => page.sectionName === sectionName)
      const updatedPages = await Promise.all(sectionPages.map((page) => movePageToSection(page, null)))
      const updatedById = new Map(updatedPages.map((page) => [page.id, page]))
      setPages((items) => items.map((page) => updatedById.get(page.id) || page).sort((a, b) => a.name.localeCompare(b.name)))
      setCustomSections((items) => items.filter((item) => item !== sectionName))
      setNavOrder((items) => items.filter((item) => item !== `section:${sectionName}`))
      if (openSectionName === sectionName) setOpenSectionName('')
      setPageMenuOpen(false)
      setError('')
    } catch (err) {
      setError(err.message)
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
  const sectionNames = normalizeSectionList([...customSections, ...pages.map((page) => page.sectionName)])
  const knownOrderKeys = [
    ...pages.map((page) => `page:${page.id}`),
    ...sectionNames.map((sectionName) => `section:${sectionName}`),
  ]
  const normalizedNavOrder = [
    ...navOrder.filter((item) => knownOrderKeys.includes(item)),
    ...knownOrderKeys.filter((item) => !navOrder.includes(item)),
  ]
  const sortByNavOrder = (left, right) => normalizedNavOrder.indexOf(left) - normalizedNavOrder.indexOf(right)
  const unsectionedPages = pages
    .filter((page) => !page.sectionName)
    .sort((left, right) => sortByNavOrder(`page:${left.id}`, `page:${right.id}`))
  const pagesBySection = sectionNames.map((sectionName) => ({
    sectionName,
    pages: pages
      .filter((page) => page.sectionName === sectionName)
      .sort((left, right) => sortByNavOrder(`page:${left.id}`, `page:${right.id}`)),
  })).sort((left, right) => sortByNavOrder(`section:${left.sectionName}`, `section:${right.sectionName}`))

  const systemMenuItems = [
    {
      key: 'tables',
      label: 'Tables',
      onClick: () => navigateRoute('tables'),
    },
    {
      key: 'users',
      label: 'Users',
      onClick: () => navigateRoute('users'),
    },
  ]

  const AddMenuItems = [
    {
      key: 'new-page',
      label: 'New page',
      onClick: () => handleCreatePage(),
    },
    {
      key: 'new-section',
      label: 'New section',
      onClick: () => handleCreateSection(),
    },
  ]

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
          {unsectionedPages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={`${activePageId === page.id ? 'active' : ''}${getNavDropClass({ type: 'root', orderKey: `page:${page.id}` })}`}
              draggable={editorMode}
              onDragStart={(event) => startNavDrag(event, { type: 'page', pageId: page.id, orderKey: `page:${page.id}` })}
              onDragOver={(event) => handleNavDragOver({ type: 'root', orderKey: `page:${page.id}`, axis: 'horizontal' }, event)}
              onDragLeave={() => setNavDropTarget(null)}
              onDrop={(event) => handleNavDrop({ type: 'root', orderKey: `page:${page.id}`, axis: 'horizontal' }, event)}
              onDragEnd={() => {
                setNavDrag(null)
                setNavDropTarget(null)
              }}
              onClick={() => navigateRoute(`page:${page.id}`)}
            >
              {page.name}
            </button>
          ))}
          {pagesBySection.map((section) => (
            <div
              key={section.sectionName}
              className="nav-section"
            >
              <button
                type="button"
                className={`${section.pages.some((page) => page.id === activePageId) ? 'active' : ''}${getNavDropClass({ type: 'section', orderKey: `section:${section.sectionName}` })}`}
                draggable={editorMode}
                onDragStart={(event) => startNavDrag(event, { type: 'section', sectionName: section.sectionName, orderKey: `section:${section.sectionName}` })}
                onDragOver={(event) => handleNavDragOver({ type: 'section', sectionName: section.sectionName, orderKey: `section:${section.sectionName}`, axis: 'horizontal' }, event)}
                onDragLeave={() => setNavDropTarget(null)}
                onDrop={(event) => handleNavDrop({ type: 'section', sectionName: section.sectionName, orderKey: `section:${section.sectionName}`, axis: 'horizontal' }, event)}
                onDragEnd={() => {
                  setNavDrag(null)
                  setNavDropTarget(null)
                }}
                onClick={() => setOpenSectionName(openSectionName === section.sectionName ? '' : section.sectionName)}
              >
                {section.sectionName}
              </button>
              {openSectionName === section.sectionName && (
                <div className="nav-section-menu">
                  {section.pages.map((page) => (
                    <button
                      key={page.id}
                      type="button"
                      className={`${activePageId === page.id ? 'active' : ''}${getNavDropClass({ type: 'page', orderKey: `page:${page.id}` })}`}
                      draggable={editorMode}
                      onDragStart={(event) => startNavDrag(event, { type: 'page', pageId: page.id, orderKey: `page:${page.id}` })}
                      onDragOver={(event) => handleNavDragOver({ type: 'page', pageId: page.id, sectionName: section.sectionName, orderKey: `page:${page.id}`, axis: 'vertical' }, event)}
                      onDragLeave={() => setNavDropTarget(null)}
                      onDrop={(event) => handleNavDrop({ type: 'page', pageId: page.id, sectionName: section.sectionName, orderKey: `page:${page.id}`, axis: 'vertical' }, event)}
                      onDragEnd={() => {
                        setNavDrag(null)
                        setNavDropTarget(null)
                      }}
                      onClick={() => navigateRoute(`page:${page.id}`)}
                    >
                      {page.name}
                    </button>
                  ))}
                  {editorMode && <button type="button" className="danger" onClick={() => handleRemoveSection(section.sectionName)}>Remove</button>}
                </div>
              )}
            </div>
          ))}
          {editorMode && (
            <Dropdown menu={{ items: AddMenuItems }} trigger={['hover']}>
              <button
                type="button"
                className="nav-add-button"
                disabled={creatingPage}
                aria-label="Add page or section"
              >
                +
              </button>
            </Dropdown>
          )}
        </nav>
        <div className="session-controls">
          <label className="editor-mode-toggle">
            <input className="custom-checkbox" type="checkbox" checked={editorMode} onChange={(event) => handleEditorModeChange(event.target.checked)} />
            Editor Mode
          </label>
          <Dropdown menu={{ items: systemMenuItems }} trigger={['hover']}>
            <button
              type="button"
              className={route === 'tables' || route === 'users' ? 'active' : ''}
            >
              {user?.username} <DownOutlined />
            </button>
          </Dropdown>
          <button type="button" className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error && <div className="error-banner app-error">{error}</div>}

      {route === 'tables' ? (
        <TablesApp />
      ) : route === 'users' ? (
        <UsersApp />
      ) : !editorMode && pages.length === 0 ? (
        <main className="page-content">
          <section className="empty-state">
            <h2>No pages yet</h2>
            <p>Turn on Editor Mode to create the first page.</p>
          </section>
        </main>
      ) : activePage ? (
        <PageBuilder pageId={activePage.id} pages={pages} editorMode={editorMode} onPagesChanged={handlePagesChanged} onNavigate={handleNavigate} navigationSearch={locationSearch} />
      ) : activePageId ? (
        <main className="page-content">
          <section className="empty-state">
            <h2>Page not found</h2>
            <p>The selected page is no longer available.</p>
          </section>
        </main>
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
