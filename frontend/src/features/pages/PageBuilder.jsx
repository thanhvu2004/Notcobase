import { useEffect, useMemo, useState } from 'react'
import 'antd/dist/reset.css'
import { deletePage, fetchPage, updatePage } from './pagesApi'
import { fetchTableDetails, fetchTables } from '../tables/tablesApi'
import { permissionsApi } from '../users/usersApi'
import { blockComponents, componentTypes, defaultSchema, fieldComponents } from './pageBuilder/constants'
import {
  collectFieldOptions,
  getFieldComponentForColumn,
  getColumnOptions,
  getTableColumns,
  parseProps,
} from './pageBuilder/dataUtils'
import { createFormGroupCoordinator, formGroupCoordinators } from './pageBuilder/formGroups'
import { createId, createNode, findNode, insertNode, moveNodeToPosition, normalizeSchema, removeNode, removeNodeAndPromoteChildren, updateNode } from './pageBuilder/schemaUtils'
import { renderNode } from './pageBuilder/runtimeRenderer'
// import TreeNode from './pageBuilder/TreeNode'

export default function PageBuilder({ pageId, pages = [], editorMode, can = () => false, onPagesChanged, onNavigate, onNavigateBack, navigationSearch = '' }) {
  const [page, setPage] = useState(null)
  const [schema, setSchema] = useState(defaultSchema)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [componentToAdd, setComponentToAdd] = useState('Text')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tables, setTables] = useState([])
  const [permissions, setPermissions] = useState([])
  const [tableDetailsById, setTableDetailsById] = useState({})
  const [dragState, setDragState] = useState(null)
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [selectOptionsText, setSelectOptionsText] = useState('')

  useEffect(() => {
    let ignore = false
    async function loadPage() {
      try {
        const nextPage = await fetchPage(pageId)
        if (ignore) return
        const nextSchema = normalizeSchema(JSON.parse(nextPage.schemaJson))
        setPage(nextPage)
        setSchema(nextSchema)
        setSelectedNodeId(nextSchema.id)
        setError('')
      } catch (err) {
        if (!ignore) setError(err.message)
      }
    }
    loadPage()
    return () => {
      ignore = true
    }
  }, [pageId])

  useEffect(() => {
    let ignore = false

    if (!editorMode) {
      queueMicrotask(() => {
        if (ignore) return
        setTables([])
        setPermissions([])
      })
      return () => {
        ignore = true
      }
    }

    Promise.all([
      (can('tables.view') ? fetchTables() : Promise.resolve([])).then((nextTables) => {
        if (!ignore) setTables(nextTables)
      }),
      (can('permissions.view') || can('pages.editor') ? permissionsApi.list() : Promise.resolve([])).then((nextPermissions) => {
        if (!ignore) setPermissions(nextPermissions)
      }).catch(() => {
        if (!ignore) setPermissions([])
      }),
    ]).catch((err) => {
      if (!ignore) setError(err.message)
    })
    return () => {
      ignore = true
    }
  }, [editorMode, can])

  useEffect(() => {
    const tableIds = new Set()
    function collect(node) {
      const tableId = node?.['x-component-props']?.tableId
      const targetTableId = node?.['x-component-props']?.targetTableId
      const sourceTableId = node?.['x-component-props']?.sourceTableId
      if (tableId) tableIds.add(Number(tableId))
      if (targetTableId) tableIds.add(Number(targetTableId))
      if (sourceTableId) tableIds.add(Number(sourceTableId))
      Object.values(node?.properties || {}).forEach(collect)
    }
    collect(schema)
    Object.values(tableDetailsById).forEach((details) => {
      ;(details?.columns || []).forEach((column) => {
        const props = parseProps(column.componentPropsJson)
        if (column.fieldType === 'reference' && props.targetTableId) tableIds.add(Number(props.targetTableId))
        if (column.fieldType === 'select' && props.optionMode === 'dynamic' && props.sourceTableId) tableIds.add(Number(props.sourceTableId))
      })
    })

    Array.from(tableIds).forEach((tableId) => {
      if (tableDetailsById[tableId]) return
      if (!editorMode && (!can('columns.view') || !can('records.view'))) {
        setTableDetailsById((current) => ({
          ...current,
          [tableId]: { columns: [], records: [], forbidden: true },
        }))
        return
      }
      fetchTableDetails(tableId)
        .then((details) => setTableDetailsById((current) => ({ ...current, [tableId]: details })))
        .catch((err) => {
          if (err.status === 403) {
            setTableDetailsById((current) => ({
              ...current,
              [tableId]: { columns: [], records: [], forbidden: true },
            }))
            return
          }
          setError(err.message)
        })
    })
  }, [schema, tableDetailsById, editorMode, can])

  async function reloadTableDetails(tableId) {
    const details = await fetchTableDetails(tableId)
    setTableDetailsById((current) => ({ ...current, [tableId]: details }))
    return details
  }

  function getFormGroup(groupKey) {
    if (!groupKey) return null
    const scopedKey = `${pageId}:${groupKey}`
    if (!formGroupCoordinators.has(scopedKey)) {
      formGroupCoordinators.set(scopedKey, createFormGroupCoordinator())
    }
    return formGroupCoordinators.get(scopedKey)
  }

  const selected = useMemo(() => findNode(schema, selectedNodeId)?.node || schema, [schema, selectedNodeId])
  const fieldOptions = useMemo(() => collectFieldOptions(schema, selectedNodeId), [schema, selectedNodeId])

  useEffect(() => {
    if (selected?.['x-component'] === 'Select') {
      setSelectOptionsText((selected['x-component-props']?.options || selected.enum || []).join('\n'))
    }
  }, [selected])

  async function savePage() {
    setSaving(true)
    try {
      const updated = await updatePage(page.id, {
        name: page.name,
        sectionName: page.sectionName,
        requiredPermission: page.requiredPermission,
        showInNavbar: page.showInNavbar !== false,
        schemaJson: JSON.stringify(schema),
        isPublished: true,
      })
      setPage(updated)
      onPagesChanged?.()
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePage() {
    if (!confirm(`Delete page "${page.name}"?`)) return
    await deletePage(page.id)
    onPagesChanged?.({ deletedPageId: page.id })
  }

  function addComponent() {
    const target = selected?.properties ? selected : schema
    const node = createNode(componentToAdd)
    setSchema(insertNode(schema, target.id, node))
    setSelectedNodeId(node.id)
  }

  function handleNodeDrop(dropTarget) {
    if (!dragState?.draggedNodeId || !dropTarget?.nodeId) return
    setSchema((currentSchema) => moveNodeToPosition(currentSchema, dragState.draggedNodeId, dropTarget.nodeId, dropTarget.position))
    setSelectedNodeId(dragState.draggedNodeId)
    setDragState(null)
  }

  function handleDeleteNode(nodeId) {
    if (!nodeId || nodeId === schema.id) return
    const node = findNode(schema, nodeId)?.node
    const nextSchema = node && ['FormBlock', 'TableBlock'].includes(node['x-component'])
      ? removeNode(schema, nodeId)
      : removeNodeAndPromoteChildren(schema, nodeId)
    setSchema(nextSchema)
    setSelectedNodeId(schema.id)
    setDragState(null)
    setHoveredNodeId(null)
  }

  function clearBlockColumns(kind) {
    if (kind === 'form') {
      setSchema(updateNode(schema, selected.id, (node) => ({
        ...node,
        properties: {},
        'x-component-props': { ...(node['x-component-props'] || {}), formColumns: [] },
      })))
      return
    }
    patchSelectedProps({ columns: [] })
  }

  function patchSelected(patch) {
    setSchema(updateNode(schema, selected.id, (node) => ({ ...node, ...patch })))
  }

  function patchSelectedProps(patch) {
    setSchema(updateNode(schema, selected.id, (node) => ({
      ...node,
      'x-component-props': { ...(node['x-component-props'] || {}), ...patch },
    })))
  }

  function patchSelectOptions(text) {
    setSelectOptionsText(text)
  }

  function syncSelectOptions(text) {
    const options = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    setSchema(updateNode(schema, selected.id, (node) => ({
      ...node,
      enum: options,
      'x-component-props': {
        ...(node['x-component-props'] || {}),
        options,
        defaultValue: options.includes(node['x-component-props']?.defaultValue)
          ? node['x-component-props']?.defaultValue
          : options[0] || '',
      },
    })))
  }

  function patchJsonProp(key, text) {
    try {
      const parsed = JSON.parse(text || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON must be an object')
      patchSelectedProps({ [key]: parsed })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  function handleTableChange(tableId) {
    const nextTableId = tableId ? Number(tableId) : null
    patchSelectedProps({
      tableId: nextTableId,
      formColumns: [],
      columns: [],
    })
  }

  function createFieldNodeFromColumn(column) {
    const node = createNode(getFieldComponentForColumn(column))
    return {
      ...node,
      name: column.name,
      title: column.name,
      type: column.fieldType === 'checkbox' ? 'boolean' : column.fieldType === 'number' || column.fieldType === 'finance' ? 'number' : 'string',
      required: column.isRequired,
      'x-field': column.name,
      'x-component-props': parseProps(column.componentPropsJson),
    }
  }

  function removeFieldByName(node, fieldName) {
    if (!node.properties) return node
    return {
      ...node,
      properties: Object.fromEntries(
        Object.entries(node.properties)
          .filter(([, child]) => (child['x-field'] || child.name) !== fieldName)
          .map(([key, child]) => [key, removeFieldByName(child, fieldName)]),
      ),
    }
  }

  function toggleFormColumn(columnName, checked) {
    const column = getTableColumns(tableDetailsById, selected['x-component-props']?.tableId).find((item) => item.name === columnName)

    setSchema(updateNode(schema, selected.id, (node) => {
      const currentColumns = node['x-component-props']?.formColumns || []
      const nextColumns = checked
        ? [...currentColumns.filter((name) => name !== columnName), columnName]
        : currentColumns.filter((name) => name !== columnName)
      const withoutField = removeFieldByName(node, columnName)
      const alreadyHasField = Object.values(node.properties || {}).some((child) => (child['x-field'] || child.name) === columnName)
      const nextProperties = checked && column && !alreadyHasField
        ? { ...(withoutField.properties || {}), [column.name]: createFieldNodeFromColumn(column) }
        : withoutField.properties

      return {
        ...withoutField,
        'x-component-props': { ...(withoutField['x-component-props'] || {}), formColumns: nextColumns },
        properties: nextProperties,
      }
    }))
  }

  function toggleTableColumn(columnName, checked) {
    const selectedColumns = selected['x-component-props']?.columns || []
    const nextColumns = checked
      ? [...selectedColumns.filter((column) => (typeof column === 'string' ? column : column.dataIndex) !== columnName), { title: columnName, dataIndex: columnName }]
      : selectedColumns.filter((column) => (typeof column === 'string' ? column : column.dataIndex) !== columnName)
    patchSelectedProps({ columns: nextColumns })
  }

  function selectAllBlockColumns(kind) {
    const columns = getTableColumns(tableDetailsById, selected['x-component-props']?.tableId)
    if (kind === 'form') {
      setSchema(updateNode(schema, selected.id, (node) => ({
        ...node,
        'x-component-props': { ...(node['x-component-props'] || {}), formColumns: columns.map((column) => column.name) },
        properties: columns.reduce((properties, column) => ({
          ...properties,
          [column.name]: properties[column.name] || createFieldNodeFromColumn(column),
        }), { ...(node.properties || {}) }),
      })))
    } else patchSelectedProps({ columns: columns.map((column) => ({ title: column.name, dataIndex: column.name })) })
  }

  function setGridRowColumnCount(value) {
    const columnCount = Math.max(1, Math.min(12, Number(value) || 1))
    setSchema(updateNode(schema, selected.id, (node) => {
      const currentEntries = Object.entries(node.properties || {})
        .sort(([, left], [, right]) => (left['x-index'] ?? 0) - (right['x-index'] ?? 0))
      const nextProperties = {}
      const span = Math.floor(24 / columnCount)

      for (let index = 0; index < columnCount; index += 1) {
        const [existingKey, existingColumn] = currentEntries[index] || []
        const key = existingKey || `col${index + 1}`
        nextProperties[key] = existingColumn
          ? {
              ...existingColumn,
              title: existingColumn.title || `Column ${index + 1}`,
              'x-component': 'Grid.Col',
              'x-component-props': { ...(existingColumn['x-component-props'] || {}), span },
              properties: existingColumn.properties || {},
              'x-index': index,
            }
          : {
              ...createNode('Grid.Col'),
              name: key,
              title: `Column ${index + 1}`,
              'x-component-props': { span },
              'x-index': index,
            }
      }

      return {
        ...node,
        'x-component-props': { ...(node['x-component-props'] || {}), columns: columnCount },
        properties: nextProperties,
      }
    }))
  }

  if (!page || page.id !== pageId) {
    return <main className="page-builder-shell"><p className="muted">{error || 'Loading page...'}</p></main>
  }

  return (
    <main className={editorMode ? 'page-builder-shell editor' : 'page-builder-shell'}>
      {error && <div className="error-banner">{error}</div>}
      {editorMode && (
        <aside className="page-builder-sidebar">
          <section className="panel">
            <h3>Page</h3>
            <label>
              Page name
              <input value={page.name} onChange={(event) => setPage({ ...page, name: event.target.value })} />
            </label>
            <label>
              Required permission
              <select
                value={page.requiredPermission || ''}
                onChange={(event) => setPage({ ...page, requiredPermission: event.target.value || null })}
              >
                <option value="">Public to signed-in users</option>
                {permissions.map((permission) => (
                  <option key={permission.id} value={permission.permissionName}>
                    {permission.permissionName}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-row">
              <input
                className="custom-checkbox"
                type="checkbox"
                checked={page.showInNavbar !== false}
                onChange={(event) => setPage({ ...page, showInNavbar: event.target.checked })}
              />
              Show in navbar
            </label>
            <div className="button-row">
              <button type="button" disabled={saving} onClick={savePage}>{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" className="danger" onClick={handleDeletePage}>Delete</button>
            </div>
          </section>

          <section className="panel">
            <h3>Add component</h3>
            <div className="inline-input">
              <select value={componentToAdd} onChange={(event) => setComponentToAdd(event.target.value)}>
                {componentTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
              <button type="button" onClick={addComponent}>Add</button>
            </div>
          </section>

{/*       TreeNode being too laggy for some reason  */}
{/* 
          <section className="panel">
            <div className="panel page-tree">
              <h3>Arrange</h3>
              <TreeNode node={schema} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} />
            </div>
            <div className="button-row">
              <button type="button" className="secondary" onClick={() => setSchema(moveNode(schema, selected.id, 'up'))}>Up</button>
              <button type="button" className="secondary" onClick={() => setSchema(moveNode(schema, selected.id, 'down'))}>Down</button>
              {selected.id !== schema.id && <button type="button" className="danger" onClick={() => setSchema(removeNode(schema, selected.id))}>Remove</button>}
            </div>
          </section> */}

          <section className="panel">
            <h3>Configure</h3>
            <label>
              Title
              <input value={selected.title || ''} onChange={(event) => patchSelected({ title: event.target.value })} />
            </label>
            {selected['x-component'] === 'Section' && (
              <label>
                Layout
                <select value={selected['x-component-props']?.layout || 'vertical'} onChange={(event) => patchSelectedProps({ layout: event.target.value })}>
                  <option value="vertical">Vertical</option>
                  <option value="horizontal">Horizontal</option>
                  <option value="grid">Grid</option>
                </select>
              </label>
            )}
            {selected['x-component'] === 'Grid.Row' && (
              <>
                <label>
                  Columns
                  <input type="number" min="1" max="12" value={selected['x-component-props']?.columns || Object.keys(selected.properties || {}).length || 2} onChange={(event) => setGridRowColumnCount(event.target.value)} />
                </label>
                <label>
                  Horizontal gutter
                  <input
                    type="number"
                    min="0"
                    value={Array.isArray(selected['x-component-props']?.gutter) ? selected['x-component-props'].gutter[0] || 0 : selected['x-component-props']?.gutter ?? 16}
                    onChange={(event) => {
                      const current = selected['x-component-props']?.gutter
                      const vertical = Array.isArray(current) ? current[1] || 0 : 0
                      patchSelectedProps({ gutter: [Number(event.target.value) || 0, vertical] })
                    }}
                  />
                </label>
                <label>
                  Vertical gutter
                  <input
                    type="number"
                    min="0"
                    value={Array.isArray(selected['x-component-props']?.gutter) ? selected['x-component-props'].gutter[1] || 0 : 0}
                    onChange={(event) => {
                      const current = selected['x-component-props']?.gutter
                      const horizontal = Array.isArray(current) ? current[0] || 0 : current ?? 16
                      patchSelectedProps({ gutter: [horizontal, Number(event.target.value) || 0] })
                    }}
                  />
                </label>
                <label>
                  Align
                  <select value={selected['x-component-props']?.align || 'top'} onChange={(event) => patchSelectedProps({ align: event.target.value })}>
                    <option value="top">Top</option>
                    <option value="middle">Middle</option>
                    <option value="bottom">Bottom</option>
                    <option value="stretch">Stretch</option>
                  </select>
                </label>
                <label>
                  Justify
                  <select value={selected['x-component-props']?.justify || 'start'} onChange={(event) => patchSelectedProps({ justify: event.target.value })}>
                    <option value="start">Start</option>
                    <option value="end">End</option>
                    <option value="center">Center</option>
                    <option value="space-around">Space around</option>
                    <option value="space-between">Space between</option>
                    <option value="space-evenly">Space evenly</option>
                  </select>
                </label>
                <label className="check-row">
                  <input className="custom-checkbox" type="checkbox" checked={selected['x-component-props']?.wrap !== false} onChange={(event) => patchSelectedProps({ wrap: event.target.checked })} />
                  Wrap columns
                </label>
              </>
            )}
            {selected['x-component'] === 'Grid.Col' && (
              <>
                <label>
                  Span
                  <input type="number" min="0" max="24" value={selected['x-component-props']?.span ?? 12} onChange={(event) => patchSelectedProps({ span: Number(event.target.value) || 0 })} />
                </label>
                <label>
                  Offset
                  <input type="number" min="0" max="24" value={selected['x-component-props']?.offset ?? 0} onChange={(event) => patchSelectedProps({ offset: Number(event.target.value) || 0 })} />
                </label>
                <label>
                  Order
                  <input type="number" value={selected['x-component-props']?.order ?? ''} onChange={(event) => patchSelectedProps({ order: event.target.value === '' ? undefined : Number(event.target.value) })} />
                </label>
                <label>
                  Flex
                  <input value={selected['x-component-props']?.flex || ''} placeholder="auto, none, 120px, 1 1 auto" onChange={(event) => patchSelectedProps({ flex: event.target.value })} />
                </label>
                <div className="builder-config-group">
                  <strong>Responsive spans</strong>
                  {['xs', 'sm', 'md', 'lg', 'xl', 'xxl'].map((breakpoint) => (
                    <label key={breakpoint}>
                      {breakpoint.toUpperCase()}
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={selected['x-component-props']?.[breakpoint] ?? ''}
                        onChange={(event) => patchSelectedProps({ [breakpoint]: event.target.value === '' ? undefined : Number(event.target.value) || 0 })}
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
            {selected['x-component'] === 'Tabs' && (
              <>
                <label>
                  Tab position
                  <select value={selected['x-component-props']?.tabPlacement || 'top'} onChange={(event) => patchSelectedProps({ tabPlacement: event.target.value })}>
                    <option value="top">Top</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
                <div className="builder-config-group">
                  <strong>Tabs</strong>
                  {Object.values(selected.properties || {}).map((tab) => (
                    <label key={tab.id}>
                      Tab label
                      <input value={tab.title || ''} onChange={(event) => setSchema(updateNode(schema, tab.id, (node) => ({ ...node, title: event.target.value })))} />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const tab = { ...createNode('Section'), name: createId('tab'), title: `Tab ${Object.keys(selected.properties || {}).length + 1}` }
                      setSchema(insertNode(schema, selected.id, tab))
                      setSelectedNodeId(tab.id)
                    }}
                  >
                    Add tab
                  </button>
                </div>
              </>
            )}
            {selected['x-component'] === 'Divider' && (
              <>
                <label>
                  Text
                  <input value={selected['x-component-props']?.text || ''} onChange={(event) => patchSelectedProps({ text: event.target.value })} />
                </label>
                <label>
                  Orientation
                  <select value={selected['x-component-props']?.titlePlacement || 'left'} onChange={(event) => patchSelectedProps({ titlePlacement: event.target.value })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              </>
            )}
            {blockComponents.includes(selected['x-component']) && (
              <>
                <label>
                  Table
                  <select value={selected['x-component-props']?.tableId || ''} onChange={(event) => handleTableChange(event.target.value)}>
                    <option value="">Select table</option>
                    {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                  </select>
                </label>

                {selected['x-component'] === 'FormBlock' && (
                  <>
                    <label>
                      Mode
                      <select value={selected['x-component-props']?.mode || 'auto'} onChange={(event) => patchSelectedProps({ mode: event.target.value })}>
                        <option value="auto">Auto</option>
                        <option value="create">Create</option>
                        <option value="edit">Edit</option>
                      </select>
                    </label>
                    <label>
                      Record ID
                      <input type="number" value={selected['x-component-props']?.recordId || ''} onChange={(event) => patchSelectedProps({ recordId: event.target.value ? Number(event.target.value) : null })} />
                    </label>
                    <label>
                      Record ID URL param
                      <input value={selected['x-component-props']?.recordIdParam || 'id'} onChange={(event) => patchSelectedProps({ recordIdParam: event.target.value })} />
                    </label>
                    <label>
                      Submit label
                      <input value={selected['x-component-props']?.submitLabel || 'Save'} onChange={(event) => patchSelectedProps({ submitLabel: event.target.value })} />
                    </label>
                    <label>
                      After save
                      <select value={selected['x-component-props']?.saveAction || 'none'} onChange={(event) => patchSelectedProps({ saveAction: event.target.value })}>
                        <option value="none">Stay on page</option>
                        <option value="navigate">Navigate to page</option>
                        <option value="back">Navigate back</option>
                      </select>
                    </label>
                    <label>
                      Save target page
                      <select disabled={(selected['x-component-props']?.saveAction || 'none') !== 'navigate'} value={selected['x-component-props']?.saveTargetPageId || ''} onChange={(event) => patchSelectedProps({ saveTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">Select page</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Save navigation params JSON
                      <textarea rows="3" disabled={(selected['x-component-props']?.saveAction || 'none') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.saveNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('saveNavigationParams', event.target.value)} />
                    </label>
                    <label className="check-row">
                      <input className="custom-checkbox" type="checkbox" checked={Boolean(selected['x-component-props']?.useFormGroup)} onChange={(event) => patchSelectedProps({ useFormGroup: event.target.checked })} />
                      Use shared form group
                    </label>
                    <label>
                      Form group key
                      <input disabled={!selected['x-component-props']?.useFormGroup} value={selected['x-component-props']?.formGroupKey || ''} onChange={(event) => patchSelectedProps({ formGroupKey: event.target.value })} />
                    </label>
                    <label className="check-row">
                      <input className="custom-checkbox" type="checkbox" checked={selected['x-component-props']?.showGroupSubmit !== false} disabled={!selected['x-component-props']?.useFormGroup} onChange={(event) => patchSelectedProps({ showGroupSubmit: event.target.checked })} />
                      Show group save button
                    </label>
                  </>
                )}

                {selected['x-component'] === 'TableBlock' && (
                  <>
                    <label>
                      Page size
                      <input type="number" min="1" value={selected['x-component-props']?.pageSize || 10} onChange={(event) => patchSelectedProps({ pageSize: Number(event.target.value) || 10 })} />
                    </label>
                    <label>
                      Row click
                      <select value={selected['x-component-props']?.rowClickAction || 'none'} onChange={(event) => patchSelectedProps({ rowClickAction: event.target.value })}>
                        <option value="none">No navigation</option>
                        <option value="navigate">Navigate to page</option>
                      </select>
                    </label>
                    <label>
                      Row target page
                      <select disabled={(selected['x-component-props']?.rowClickAction || 'none') !== 'navigate'} value={selected['x-component-props']?.rowTargetPageId || ''} onChange={(event) => patchSelectedProps({ rowTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">Select page</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Row mode
                      <select disabled={(selected['x-component-props']?.rowClickAction || 'none') !== 'navigate'} value={selected['x-component-props']?.rowMode || 'view'} onChange={(event) => patchSelectedProps({ rowMode: event.target.value })}>
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                      </select>
                    </label>
                    <label>
                      Row query params JSON
                      <textarea rows="3" disabled={(selected['x-component-props']?.rowClickAction || 'none') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.rowNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('rowNavigationParams', event.target.value)} />
                    </label>
                    <label>
                      Create action
                      <select value={selected['x-component-props']?.createAction || 'modal'} onChange={(event) => patchSelectedProps({ createAction: event.target.value })}>
                        <option value="modal">Open modal</option>
                        <option value="navigate">Navigate to page</option>
                      </select>
                    </label>
                    <label>
                      Create target page
                      <select disabled={(selected['x-component-props']?.createAction || 'modal') !== 'navigate'} value={selected['x-component-props']?.createTargetPageId || ''} onChange={(event) => patchSelectedProps({ createTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">Select page</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Create query params JSON
                      <textarea rows="3" disabled={(selected['x-component-props']?.createAction || 'modal') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.createNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('createNavigationParams', event.target.value)} />
                    </label>
                    <label>
                      Edit action
                      <select value={selected['x-component-props']?.editAction || 'modal'} onChange={(event) => patchSelectedProps({ editAction: event.target.value })}>
                        <option value="modal">Open modal</option>
                        <option value="navigate">Navigate to page</option>
                      </select>
                    </label>
                    <label>
                      Edit target page
                      <select disabled={(selected['x-component-props']?.editAction || 'modal') !== 'navigate'} value={selected['x-component-props']?.editTargetPageId || ''} onChange={(event) => patchSelectedProps({ editTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">Select page</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Edit query params JSON
                      <textarea rows="3" disabled={(selected['x-component-props']?.editAction || 'modal') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.editNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('editNavigationParams', event.target.value)} />
                    </label>
                  </>
                )}

                <div className="builder-config-group">
                  <strong>{selected['x-component'] === 'FormBlock' ? 'Form fields from columns' : 'Table columns'}</strong>
                  <div className="button-row compact">
                    <button type="button" className="secondary" onClick={() => selectAllBlockColumns(selected['x-component'] === 'FormBlock' ? 'form' : 'table')}>Select all</button>
                    <button type="button" className="secondary" onClick={() => clearBlockColumns(selected['x-component'] === 'FormBlock' ? 'form' : 'table')}>Clear</button>
                  </div>
                  <div className="builder-column-list">
                    {getTableColumns(tableDetailsById, selected['x-component-props']?.tableId).map((column) => {
                      const configured = selected['x-component'] === 'FormBlock'
                        ? selected['x-component-props']?.formColumns || []
                        : selected['x-component-props']?.columns || []
                      const checked = configured.some((item) => (typeof item === 'string' ? item : item.dataIndex) === column.name)
                      return (
                        <label key={column.id} className="builder-column-item">
                          <input
                            className="custom-checkbox"
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => selected['x-component'] === 'FormBlock'
                              ? toggleFormColumn(column.name, event.target.checked)
                              : toggleTableColumn(column.name, event.target.checked)}
                          />
                          <span>{column.name}</span>
                          <small>{column.fieldType || 'text'}</small>
                          {column.isRequired && <small className="text-danger">required</small>}
                        </label>
                      )
                    })}
                    {!selected['x-component-props']?.tableId && <p className="muted">Select a table to choose columns.</p>}
                  </div>
                </div>

                <div className="builder-config-group">
                  <strong>CRUD permissions</strong>
                  {selected['x-component'] !== 'DetailCard' && (
                    <label className="check-row">
                      <input className="custom-checkbox" type="checkbox" checked={selected['x-component-props']?.allowCreate !== false} onChange={(event) => patchSelectedProps({ allowCreate: event.target.checked })} />
                      Allow create
                    </label>
                  )}
                  <label className="check-row">
                    <input className="custom-checkbox" type="checkbox" checked={selected['x-component-props']?.allowEdit !== false} onChange={(event) => patchSelectedProps({ allowEdit: event.target.checked })} />
                    Allow edit
                  </label>
                  <label className="check-row">
                    <input className="custom-checkbox" type="checkbox" checked={Boolean(selected['x-component-props']?.allowDelete)} onChange={(event) => patchSelectedProps({ allowDelete: event.target.checked })} />
                    Allow delete
                  </label>
                </div>
              </>
            )}
            {['Heading', 'Text', 'Button'].includes(selected['x-component']) && (
              <label>
                Text
                <input value={selected['x-component-props']?.text || ''} onChange={(event) => patchSelectedProps({ text: event.target.value })} />
              </label>
            )}
            {selected['x-component'] === 'Button' && (
              <div className="builder-config-group">
                <strong>Navigation</strong>
                <label>
                  Action
                  <select value={selected['x-component-props']?.action || 'none'} onChange={(event) => patchSelectedProps({ action: event.target.value })}>
                    <option value="none">None</option>
                    <option value="navigate">Navigate to page</option>
                  </select>
                </label>
                <label>
                  Target page
                  <select disabled={(selected['x-component-props']?.action || 'none') !== 'navigate'} value={selected['x-component-props']?.targetPageId || ''} onChange={(event) => patchSelectedProps({ targetPageId: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">Select page</option>
                    {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                  </select>
                </label>
                <label>
                  Query params JSON
                  <textarea rows="3" disabled={(selected['x-component-props']?.action || 'none') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.navigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('navigationParams', event.target.value)} />
                </label>
              </div>
            )}
            {fieldComponents.includes(selected['x-component']) && (
              <>
                <label>
                  Field name
                  <input value={selected['x-field'] || selected.name || ''} onChange={(event) => patchSelected({ name: event.target.value, 'x-field': event.target.value })} />
                </label>
                {['Input', 'Textarea', 'Select', 'Reference'].includes(selected['x-component']) && (
                  <label>
                    Placeholder
                    <input value={selected['x-component-props']?.placeholder || ''} onChange={(event) => patchSelectedProps({ placeholder: event.target.value })} />
                  </label>
                )}
                {selected['x-component'] === 'Select' && (
                  <>
                    <div className="builder-config-group">
                      <strong>Selection options</strong>
                      <label>
                        Mode
                        <select value={selected['x-component-props']?.optionMode || 'static'} onChange={(event) => patchSelectedProps({ optionMode: event.target.value })}>
                          <option value="static">Static options</option>
                          <option value="dynamic">Dynamic options</option>
                        </select>
                      </label>
                      {(selected['x-component-props']?.optionMode || 'static') === 'dynamic' && (
                        <>
                          <label>
                            Source table
                            <select
                              value={selected['x-component-props']?.sourceTableId || ''}
                              onChange={(event) => patchSelectedProps({
                                sourceTableId: event.target.value ? Number(event.target.value) : null,
                                displayColumn: 'id',
                                valueColumn: 'id',
                                filterField: '',
                              })}
                            >
                              <option value="">Select table</option>
                              {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                            </select>
                          </label>
                          <label>
                            Display column
                            <select disabled={!selected['x-component-props']?.sourceTableId} value={selected['x-component-props']?.displayColumn || 'id'} onChange={(event) => patchSelectedProps({ displayColumn: event.target.value })}>
                              {getColumnOptions(tableDetailsById[selected['x-component-props']?.sourceTableId]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label>
                            Value column
                            <select disabled={!selected['x-component-props']?.sourceTableId} value={selected['x-component-props']?.valueColumn || 'id'} onChange={(event) => patchSelectedProps({ valueColumn: event.target.value })}>
                              {getColumnOptions(tableDetailsById[selected['x-component-props']?.sourceTableId]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label>
                            Depends on field
                            <select value={selected['x-component-props']?.dependsOnField || ''} onChange={(event) => patchSelectedProps({ dependsOnField: event.target.value, filterField: event.target.value ? selected['x-component-props']?.filterField || '' : '' })}>
                              <option value="">No dependency</option>
                              {fieldOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label>
                            Filter field
                            <select disabled={!selected['x-component-props']?.sourceTableId || !selected['x-component-props']?.dependsOnField} value={selected['x-component-props']?.filterField || ''} onChange={(event) => patchSelectedProps({ filterField: event.target.value })}>
                              <option value="">Select field</option>
                              {getColumnOptions(tableDetailsById[selected['x-component-props']?.sourceTableId]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label>
                            Empty parent placeholder
                            <input value={selected['x-component-props']?.emptyDependencyPlaceholder || ''} placeholder="Select a parent value first" onChange={(event) => patchSelectedProps({ emptyDependencyPlaceholder: event.target.value })} />
                          </label>
                        </>
                      )}
                    </div>
                  </>
                )}
                {selected['x-component'] === 'Reference' && (
                  <>
                    <label>
                      Target table
                      <select value={selected['x-component-props']?.targetTableId || ''} onChange={(event) => patchSelectedProps({
                        targetTableId: event.target.value ? Number(event.target.value) : null,
                        parentFieldName: selected['x-component-props']?.parentFieldName || selected['x-field'] || '',
                      })}>
                        <option value="">Select table</option>
                        {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Display column
                      <select value={selected['x-component-props']?.displayColumnId || 'id'} onChange={(event) => patchSelectedProps({ displayColumnId: event.target.value })}>
                        <option value="id">Record ID</option>
                        {getTableColumns(tableDetailsById, selected['x-component-props']?.targetTableId).map((column) => <option key={column.id} value={column.name}>{column.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Relationship mode
                      <select value={selected['x-component-props']?.relationshipMode || 'lookup'} onChange={(event) => patchSelectedProps({ relationshipMode: event.target.value })}>
                        <option value="lookup">Lookup mode</option>
                        <option value="related">Related record mode</option>
                      </select>
                    </label>
                    {selected['x-component-props']?.relationshipMode === 'related' && (
                      <label>
                        Parent link field on target table
                        <input value={selected['x-component-props']?.parentFieldName || ''} onChange={(event) => patchSelectedProps({ parentFieldName: event.target.value })} />
                      </label>
                    )}
                    <label>
                      Picker variant
                      <select value={selected['x-component-props']?.pickerVariant || 'table'} onChange={(event) => patchSelectedProps({ pickerVariant: event.target.value })}>
                        <option value="table">Table picker</option>
                        <option value="select">Select picker</option>
                      </select>
                    </label>
                    <label>
                      Add record action
                      <select value={selected['x-component-props']?.referenceCreateAction || 'modal'} onChange={(event) => patchSelectedProps({ referenceCreateAction: event.target.value })}>
                        <option value="modal">Open modal</option>
                        <option value="navigate">Navigate to page</option>
                      </select>
                    </label>
                    <label>
                      Add record target page
                      <select disabled={(selected['x-component-props']?.referenceCreateAction || 'modal') !== 'navigate'} value={selected['x-component-props']?.referenceCreateTargetPageId || ''} onChange={(event) => patchSelectedProps({ referenceCreateTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">Select page</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Add record query params JSON
                      <textarea rows="3" disabled={(selected['x-component-props']?.referenceCreateAction || 'modal') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.referenceCreateNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('referenceCreateNavigationParams', event.target.value)} />
                    </label>
                  </>
                )}
                <label className="check-row">
                  <input className="custom-checkbox" type="checkbox" checked={Boolean(selected.required)} onChange={(event) => patchSelected({ required: event.target.checked })} />
                  Required
                </label>
                <label className="check-row">
                  <input className="custom-checkbox" type="checkbox" checked={Boolean(selected['x-component-props']?.disabled)} onChange={(event) => patchSelectedProps({ disabled: event.target.checked })} />
                  Disabled
                </label>
                <label className="check-row">
                  <input className="custom-checkbox" type="checkbox" checked={Boolean(selected['x-component-props']?.hiddenInForms)} onChange={(event) => patchSelectedProps({ hiddenInForms: event.target.checked })} />
                  Hidden in forms
                </label>
                {['Input', 'Input.TextArea', 'Textarea'].includes(selected['x-component']) && (
                  <div className="builder-config-group">
                    <strong>Value generator</strong>
                    <label className="check-row">
                      <input
                        className="custom-checkbox"
                        type="checkbox"
                        checked={Boolean(selected['x-component-props']?.valueGeneratorEnabled)}
                        onChange={(event) => patchSelectedProps({
                          valueGeneratorEnabled: event.target.checked,
                          valueGeneratorEditable: selected['x-component-props']?.valueGeneratorEditable ?? true,
                        })}
                      />
                      Generate value
                    </label>
                    <label>
                      Template
                      <textarea
                        rows="3"
                        disabled={!selected['x-component-props']?.valueGeneratorEnabled}
                        placeholder="INV-{YYYY}{MM}-{seq:6}"
                        value={selected['x-component-props']?.valueGeneratorTemplate || ''}
                        onChange={(event) => patchSelectedProps({ valueGeneratorTemplate: event.target.value })}
                      />
                    </label>
                    <label className="check-row">
                      <input
                        className="custom-checkbox"
                        type="checkbox"
                        disabled={!selected['x-component-props']?.valueGeneratorEnabled}
                        checked={selected['x-component-props']?.valueGeneratorEditable !== false}
                        onChange={(event) => patchSelectedProps({ valueGeneratorEditable: event.target.checked })}
                      />
                      Allow manual edits
                    </label>
                  </div>
                )}
                <div className="builder-config-group">
                  <strong>Visibility</strong>
                  <label>
                    Visible when field
                    <select
                      value={selected['x-component-props']?.visibleWhen?.field || ''}
                      onChange={(event) => patchSelectedProps({
                        visibleWhen: {
                          ...(selected['x-component-props']?.visibleWhen || {}),
                          field: event.target.value,
                        },
                      })}
                    >
                      <option value="">Always visible</option>
                      {fieldOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Operator
                    <select
                      value={selected['x-component-props']?.visibleWhen?.operator || '='}
                      disabled={!selected['x-component-props']?.visibleWhen?.field}
                      onChange={(event) => patchSelectedProps({
                        visibleWhen: {
                          ...(selected['x-component-props']?.visibleWhen || {}),
                          operator: event.target.value,
                        },
                      })}
                    >
                      <option value="=">Equals</option>
                      <option value="!=">Not equals</option>
                      <option value="contains">Contains</option>
                    </select>
                  </label>
                  <label>
                    Value
                    <input
                      value={selected['x-component-props']?.visibleWhen?.value || ''}
                      disabled={!selected['x-component-props']?.visibleWhen?.field}
                      placeholder="Match value"
                      onChange={(event) => patchSelectedProps({
                        visibleWhen: {
                          ...(selected['x-component-props']?.visibleWhen || {}),
                          value: event.target.value,
                        },
                      })}
                    />
                  </label>
                </div>
              </>
            )}
            {selected['x-component'] === 'Select' && (selected['x-component-props']?.optionMode || 'static') === 'static' && (
              <label>
                Options, one per line
                <textarea
                  rows="5"
                  value={selectOptionsText}
                  onChange={(event) => patchSelectOptions(event.target.value)}
                  onBlur={(event) => syncSelectOptions(event.target.value)}
                />
              </label>
            )}
          </section>
        </aside>
      )}

      <section className="page-builder-canvas">
        {renderNode(schema, editorMode, selectedNodeId, setSelectedNodeId, {
          tableDetailsById,
          tables,
          reloadTableDetails,
          getFormGroup,
          onNavigate,
          onNavigateBack,
          navigationSearch,
          dragState,
          setDragState,
          hoveredNodeId,
          setHoveredNodeId,
          onNodeDrop: handleNodeDrop,
          onDeleteNode: handleDeleteNode,
          rootNodeId: schema.id,
        })}
      </section>
    </main>
  )
}
