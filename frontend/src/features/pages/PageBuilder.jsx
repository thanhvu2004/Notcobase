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
import { t } from '../../shared/locale'
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
    return <main className="page-builder-shell"><p className="muted">{error || t('loadingPage')}</p></main>
  }

  return (
    <main className={editorMode ? 'page-builder-shell editor' : 'page-builder-shell'}>
      {error && <div className="error-banner">{error}</div>}
      {editorMode && (
        <aside className="page-builder-sidebar">
          <section className="panel">
            <h3>{t('page')}</h3>
            <label>
              {t('pageNamePrompt')}
              <input value={page.name} onChange={(event) => setPage({ ...page, name: event.target.value })} />
            </label>
            <label>
              {t('requiredPermission')}
              <select
                value={page.requiredPermission || ''}
                onChange={(event) => setPage({ ...page, requiredPermission: event.target.value || null })}
              >
                <option value="">{t('publicToSignedInUsers')}</option>
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
              {t('showInNavbar')}
            </label>
            <div className="button-row">
              <button type="button" disabled={saving} onClick={savePage}>{saving ? t('saving') : t('save')}</button>
              <button type="button" className="danger" onClick={handleDeletePage}>{t('delete')}</button>
            </div>
          </section>

          <section className="panel">
            <h3>{t('addComponent')}</h3>
            <div className="inline-input">
              <select value={componentToAdd} onChange={(event) => setComponentToAdd(event.target.value)}>
                {componentTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
              <button type="button" onClick={addComponent}>{t('add')}</button>
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
            <h3>{t('configure')}</h3>
            <label>
              {t('title')}
              <input value={selected.title || ''} onChange={(event) => patchSelected({ title: event.target.value })} />
            </label>
            {selected['x-component'] === 'Section' && (
                <label>
                {t('layout')}
                <select value={selected['x-component-props']?.layout || 'vertical'} onChange={(event) => patchSelectedProps({ layout: event.target.value })}>
                  <option value="vertical">{t('vertical')}</option>
                  <option value="horizontal">{t('horizontal')}</option>
                  <option value="grid">{t('grid')}</option>
                </select>
              </label>
            )}
            {selected['x-component'] === 'Grid.Row' && (
              <>
                <label>
                  {t('columns')}
                  <input type="number" min="1" max="12" value={selected['x-component-props']?.columns || Object.keys(selected.properties || {}).length || 2} onChange={(event) => setGridRowColumnCount(event.target.value)} />
                </label>
                <label>
                  {t('horizontalGutter')}
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
                  {t('verticalGutter')}
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
                  {t('align')}
                  <select value={selected['x-component-props']?.align || 'top'} onChange={(event) => patchSelectedProps({ align: event.target.value })}>
                    <option value="top">{t('top')}</option>
                    <option value="middle">{t('middle')}</option>
                    <option value="bottom">{t('bottom')}</option>
                    <option value="stretch">{t('stretch')}</option>
                  </select>
                </label>
                <label>
                  {t('justify')}
                  <select value={selected['x-component-props']?.justify || 'start'} onChange={(event) => patchSelectedProps({ justify: event.target.value })}>
                    <option value="start">{t('start')}</option>
                    <option value="end">{t('end')}</option>
                    <option value="center">{t('center')}</option>
                    <option value="space-around">{t('spaceAround')}</option>
                    <option value="space-between">{t('spaceBetween')}</option>
                    <option value="space-evenly">{t('spaceEvenly')}</option>
                  </select>
                </label>
                <label className="check-row">
                  <input className="custom-checkbox" type="checkbox" checked={selected['x-component-props']?.wrap !== false} onChange={(event) => patchSelectedProps({ wrap: event.target.checked })} />
                  {t('wrapColumns')}
                </label>
              </>
            )}
            {selected['x-component'] === 'Grid.Col' && (
              <>
                <label>
                  {t('span')}
                  <input type="number" min="0" max="24" value={selected['x-component-props']?.span ?? 12} onChange={(event) => patchSelectedProps({ span: Number(event.target.value) || 0 })} />
                </label>
                <label>
                  {t('offset')}
                  <input type="number" min="0" max="24" value={selected['x-component-props']?.offset ?? 0} onChange={(event) => patchSelectedProps({ offset: Number(event.target.value) || 0 })} />
                </label>
                <label>
                  {t('order')}
                  <input type="number" value={selected['x-component-props']?.order ?? ''} onChange={(event) => patchSelectedProps({ order: event.target.value === '' ? undefined : Number(event.target.value) })} />
                </label>
                <label>
                  {t('flex')}
                  <input value={selected['x-component-props']?.flex || ''} placeholder={t('flexPlaceholder')} onChange={(event) => patchSelectedProps({ flex: event.target.value })} />
                </label>
                <div className="builder-config-group">
                  <strong>{t('responsiveSpans')}</strong>
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
                  {t('tabPosition')}
                  <select value={selected['x-component-props']?.tabPlacement || 'top'} onChange={(event) => patchSelectedProps({ tabPlacement: event.target.value })}>
                    <option value="top">{t('top')}</option>
                    <option value="left">{t('left')}</option>
                    <option value="right">{t('right')}</option>
                    <option value="bottom">{t('bottom')}</option>
                  </select>
                </label>
                <div className="builder-config-group">
                  <strong>{t('tabs')}</strong>
                  {Object.values(selected.properties || {}).map((tab) => (
                    <label key={tab.id}>
                      {t('tabLabel')}
                      <input value={tab.title || ''} onChange={(event) => setSchema(updateNode(schema, tab.id, (node) => ({ ...node, title: event.target.value })))} />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const tab = { ...createNode('Section'), name: createId('tab'), title: `${t('tab')} ${Object.keys(selected.properties || {}).length + 1}` }
                      setSchema(insertNode(schema, selected.id, tab))
                      setSelectedNodeId(tab.id)
                    }}
                  >
                    {t('addTab')}
                  </button>
                </div>
              </>
            )}
            {selected['x-component'] === 'Divider' && (
              <>
                <label>
                  {t('text')}
                  <input value={selected['x-component-props']?.text || ''} onChange={(event) => patchSelectedProps({ text: event.target.value })} />
                </label>
                <label>
                  {t('orientation')}
                  <select value={selected['x-component-props']?.titlePlacement || 'left'} onChange={(event) => patchSelectedProps({ titlePlacement: event.target.value })}>
                    <option value="left">{t('left')}</option>
                    <option value="center">{t('center')}</option>
                    <option value="right">{t('right')}</option>
                  </select>
                </label>
              </>
            )}
            {blockComponents.includes(selected['x-component']) && (
              <>
                <label>
                  {t('table')}
                  <select value={selected['x-component-props']?.tableId || ''} onChange={(event) => handleTableChange(event.target.value)}>
                    <option value="">{t('selectTable')}</option>
                    {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                  </select>
                </label>

                {selected['x-component'] === 'FormBlock' && (
                  <>
                    <label>
                      {t('mode')}
                      <select value={selected['x-component-props']?.mode || 'auto'} onChange={(event) => patchSelectedProps({ mode: event.target.value })}>
                        <option value="auto">{t('auto')}</option>
                        <option value="create">{t('create')}</option>
                        <option value="edit">{t('edit')}</option>
                      </select>
                    </label>
                    <label>
                      {t('recordId')}
                      <input type="number" value={selected['x-component-props']?.recordId || ''} onChange={(event) => patchSelectedProps({ recordId: event.target.value ? Number(event.target.value) : null })} />
                    </label>
                    <label>
                      {t('recordIdParam')}
                      <input value={selected['x-component-props']?.recordIdParam || 'id'} onChange={(event) => patchSelectedProps({ recordIdParam: event.target.value })} />
                    </label>
                    <label>
                      {t('submitLabel')}
                      <input value={selected['x-component-props']?.submitLabel || t('save')} onChange={(event) => patchSelectedProps({ submitLabel: event.target.value })} />
                    </label>
                    <label>
                      {t('afterSave')}
                      <select value={selected['x-component-props']?.saveAction || 'none'} onChange={(event) => patchSelectedProps({ saveAction: event.target.value })}>
                        <option value="none">{t('stayOnPage')}</option>
                        <option value="navigate">{t('navigateToPage')}</option>
                        <option value="back">{t('navigateBack')}</option>
                      </select>
                    </label>
                    <label>
                      {t('saveTargetPage')}
                      <select disabled={(selected['x-component-props']?.saveAction || 'none') !== 'navigate'} value={selected['x-component-props']?.saveTargetPageId || ''} onChange={(event) => patchSelectedProps({ saveTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">{t('selectPage')}</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      {t('saveNavigationParamsJson')}
                      <textarea rows="3" disabled={(selected['x-component-props']?.saveAction || 'none') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.saveNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('saveNavigationParams', event.target.value)} />
                    </label>
                    <label className="check-row">
                      <input className="custom-checkbox" type="checkbox" checked={Boolean(selected['x-component-props']?.useFormGroup)} onChange={(event) => patchSelectedProps({ useFormGroup: event.target.checked })} />
                      {t('useSharedFormGroup')}
                    </label>
                    <label>
                      {t('formGroupKey')}
                      <input disabled={!selected['x-component-props']?.useFormGroup} value={selected['x-component-props']?.formGroupKey || ''} onChange={(event) => patchSelectedProps({ formGroupKey: event.target.value })} />
                    </label>
                    <label className="check-row">
                      <input className="custom-checkbox" type="checkbox" checked={selected['x-component-props']?.showGroupSubmit !== false} disabled={!selected['x-component-props']?.useFormGroup} onChange={(event) => patchSelectedProps({ showGroupSubmit: event.target.checked })} />
                      {t('showGroupSaveButton')}
                    </label>
                  </>
                )}

                {selected['x-component'] === 'TableBlock' && (
                  <>
                    <label>
                      {t('pageSize')}
                      <input type="number" min="1" value={selected['x-component-props']?.pageSize || 10} onChange={(event) => patchSelectedProps({ pageSize: Number(event.target.value) || 10 })} />
                    </label>
                    <label>
                      {t('rowClick')}
                      <select value={selected['x-component-props']?.rowClickAction || 'none'} onChange={(event) => patchSelectedProps({ rowClickAction: event.target.value })}>
                        <option value="none">{t('noNavigation')}</option>
                        <option value="navigate">{t('navigateToPage')}</option>
                      </select>
                    </label>
                    <label>
                      {t('rowTargetPage')}
                      <select disabled={(selected['x-component-props']?.rowClickAction || 'none') !== 'navigate'} value={selected['x-component-props']?.rowTargetPageId || ''} onChange={(event) => patchSelectedProps({ rowTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">{t('selectPage')}</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      {t('rowMode')}
                      <select disabled={(selected['x-component-props']?.rowClickAction || 'none') !== 'navigate'} value={selected['x-component-props']?.rowMode || 'view'} onChange={(event) => patchSelectedProps({ rowMode: event.target.value })}>
                        <option value="view">{t('view')}</option>
                        <option value="edit">{t('edit')}</option>
                      </select>
                    </label>
                    <label>
                      {t('rowQueryParamsJson')}
                      <textarea rows="3" disabled={(selected['x-component-props']?.rowClickAction || 'none') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.rowNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('rowNavigationParams', event.target.value)} />
                    </label>
                    <label>
                      {t('createAction')}
                      <select value={selected['x-component-props']?.createAction || 'modal'} onChange={(event) => patchSelectedProps({ createAction: event.target.value })}>
                        <option value="modal">{t('openModal')}</option>
                        <option value="navigate">{t('navigateToPage')}</option>
                      </select>
                    </label>
                    <label>
                      {t('createTargetPage')}
                      <select disabled={(selected['x-component-props']?.createAction || 'modal') !== 'navigate'} value={selected['x-component-props']?.createTargetPageId || ''} onChange={(event) => patchSelectedProps({ createTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">{t('selectPage')}</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      {t('createQueryParamsJson')}
                      <textarea rows="3" disabled={(selected['x-component-props']?.createAction || 'modal') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.createNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('createNavigationParams', event.target.value)} />
                    </label>
                    <label>
                      {t('editAction')}
                      <select value={selected['x-component-props']?.editAction || 'modal'} onChange={(event) => patchSelectedProps({ editAction: event.target.value })}>
                        <option value="modal">{t('openModal')}</option>
                        <option value="navigate">{t('navigateToPage')}</option>
                      </select>
                    </label>
                    <label>
                      {t('editTargetPage')}
                      <select disabled={(selected['x-component-props']?.editAction || 'modal') !== 'navigate'} value={selected['x-component-props']?.editTargetPageId || ''} onChange={(event) => patchSelectedProps({ editTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">{t('selectPage')}</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      {t('editQueryParamsJson')}
                      <textarea rows="3" disabled={(selected['x-component-props']?.editAction || 'modal') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.editNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('editNavigationParams', event.target.value)} />
                    </label>
                  </>
                )}

                <div className="builder-config-group">
                  <strong>{selected['x-component'] === 'FormBlock' ? t('formFieldsFromColumns') : t('tableColumns')}</strong>
                  <div className="button-row compact">
                    <button type="button" className="secondary" onClick={() => selectAllBlockColumns(selected['x-component'] === 'FormBlock' ? 'form' : 'table')}>{t('selectAll')}</button>
                    <button type="button" className="secondary" onClick={() => clearBlockColumns(selected['x-component'] === 'FormBlock' ? 'form' : 'table')}>{t('clear')}</button>
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
                          <small>{column.fieldType || t('textType')}</small>
                          {column.isRequired && <small className="text-danger">{t('required')}</small>}
                        </label>
                      )
                    })}
                    {!selected['x-component-props']?.tableId && <p className="muted">{t('selectTableToChooseColumns')}</p>}
                  </div>
                </div>

                <div className="builder-config-group">
                  <strong>{t('crudPermissions')}</strong>
                  {selected['x-component'] !== 'DetailCard' && (
                    <label className="check-row">
                      <input className="custom-checkbox" type="checkbox" checked={selected['x-component-props']?.allowCreate !== false} onChange={(event) => patchSelectedProps({ allowCreate: event.target.checked })} />
                      {t('allowCreate')}
                    </label>
                  )}
                  <label className="check-row">
                    <input className="custom-checkbox" type="checkbox" checked={selected['x-component-props']?.allowEdit !== false} onChange={(event) => patchSelectedProps({ allowEdit: event.target.checked })} />
                    {t('allowEdit')}
                  </label>
                  <label className="check-row">
                    <input className="custom-checkbox" type="checkbox" checked={Boolean(selected['x-component-props']?.allowDelete)} onChange={(event) => patchSelectedProps({ allowDelete: event.target.checked })} />
                    {t('allowDelete')}
                  </label>
                </div>
              </>
            )}
            {['Heading', 'Text', 'Button'].includes(selected['x-component']) && (
              <label>
                {t('text')}
                <input value={selected['x-component-props']?.text || ''} onChange={(event) => patchSelectedProps({ text: event.target.value })} />
              </label>
            )}
            {selected['x-component'] === 'Button' && (
                <div className="builder-config-group">
                  <strong>{t('navigation')}</strong>
                <label>
                  {t('action')}
                  <select value={selected['x-component-props']?.action || 'none'} onChange={(event) => patchSelectedProps({ action: event.target.value })}>
                    <option value="none">{t('none')}</option>
                    <option value="navigate">{t('navigateToPage')}</option>
                  </select>
                </label>
                <label>
                  {t('targetPage')}
                  <select disabled={(selected['x-component-props']?.action || 'none') !== 'navigate'} value={selected['x-component-props']?.targetPageId || ''} onChange={(event) => patchSelectedProps({ targetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">{t('selectPage')}</option>
                    {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                  </select>
                </label>
                <label>
                  {t('queryParamsJson')}
                  <textarea rows="3" disabled={(selected['x-component-props']?.action || 'none') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.navigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('navigationParams', event.target.value)} />
                </label>
              </div>
            )}
            {fieldComponents.includes(selected['x-component']) && (
              <>
                <label>
                  {t('fieldName')}
                  <input value={selected['x-field'] || selected.name || ''} onChange={(event) => patchSelected({ name: event.target.value, 'x-field': event.target.value })} />
                </label>
                {['Input', 'Textarea', 'Select', 'Reference'].includes(selected['x-component']) && (
                  <label>
                    {t('placeholder')}
                    <input value={selected['x-component-props']?.placeholder || ''} onChange={(event) => patchSelectedProps({ placeholder: event.target.value })} />
                  </label>
                )}
                {selected['x-component'] === 'Select' && (
                  <>
                    <div className="builder-config-group">
                      <strong>{t('selectionOptions')}</strong>
                      <label>
                        {t('mode')}
                        <select value={selected['x-component-props']?.optionMode || 'static'} onChange={(event) => patchSelectedProps({ optionMode: event.target.value })}>
                          <option value="static">{t('staticOptions')}</option>
                          <option value="dynamic">{t('dynamicOptions')}</option>
                        </select>
                      </label>
                      {(selected['x-component-props']?.optionMode || 'static') === 'dynamic' && (
                        <>
                          <label>
                            {t('sourceTable')}
                            <select
                              value={selected['x-component-props']?.sourceTableId || ''}
                              onChange={(event) => patchSelectedProps({
                                sourceTableId: event.target.value ? Number(event.target.value) : null,
                                displayColumn: 'id',
                                valueColumn: 'id',
                                filterField: '',
                              })}
                            >
                              <option value="">{t('selectTable')}</option>
                              {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                            </select>
                          </label>
                          <label>
                            {t('displayColumn')}
                            <select disabled={!selected['x-component-props']?.sourceTableId} value={selected['x-component-props']?.displayColumn || 'id'} onChange={(event) => patchSelectedProps({ displayColumn: event.target.value })}>
                              {getColumnOptions(tableDetailsById[selected['x-component-props']?.sourceTableId]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label>
                            {t('valueColumn')}
                            <select disabled={!selected['x-component-props']?.sourceTableId} value={selected['x-component-props']?.valueColumn || 'id'} onChange={(event) => patchSelectedProps({ valueColumn: event.target.value })}>
                              {getColumnOptions(tableDetailsById[selected['x-component-props']?.sourceTableId]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label>
                            {t('dependsOnField')}
                            <select value={selected['x-component-props']?.dependsOnField || ''} onChange={(event) => patchSelectedProps({ dependsOnField: event.target.value, filterField: event.target.value ? selected['x-component-props']?.filterField || '' : '' })}>
                              <option value="">{t('noDependency')}</option>
                              {fieldOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label>
                            {t('filterField')}
                            <select disabled={!selected['x-component-props']?.sourceTableId || !selected['x-component-props']?.dependsOnField} value={selected['x-component-props']?.filterField || ''} onChange={(event) => patchSelectedProps({ filterField: event.target.value })}>
                              <option value="">{t('selectField')}</option>
                              {getColumnOptions(tableDetailsById[selected['x-component-props']?.sourceTableId]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label>
                            {t('emptyParentPlaceholder')}
                            <input value={selected['x-component-props']?.emptyDependencyPlaceholder || ''} placeholder={t('selectParentValueFirst')} onChange={(event) => patchSelectedProps({ emptyDependencyPlaceholder: event.target.value })} />
                          </label>
                        </>
                      )}
                    </div>
                  </>
                )}
                {selected['x-component'] === 'Reference' && (
                  <>
                    <label>
                      {t('targetTable')}
                      <select value={selected['x-component-props']?.targetTableId || ''} onChange={(event) => patchSelectedProps({
                        targetTableId: event.target.value ? Number(event.target.value) : null,
                        parentFieldName: selected['x-component-props']?.parentFieldName || selected['x-field'] || '',
                      })}>
                              <option value="">{t('selectTable')}</option>
                        {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                      </select>
                    </label>
                    <label>
                      {t('displayColumn')}
                      <select value={selected['x-component-props']?.displayColumnId || 'id'} onChange={(event) => patchSelectedProps({ displayColumnId: event.target.value })}>
                        <option value="id">{t('recordId')}</option>
                        {getTableColumns(tableDetailsById, selected['x-component-props']?.targetTableId).map((column) => <option key={column.id} value={column.name}>{column.name}</option>)}
                      </select>
                    </label>
                    <label>
                      {t('relationshipMode')}
                      <select value={selected['x-component-props']?.relationshipMode || 'lookup'} onChange={(event) => patchSelectedProps({ relationshipMode: event.target.value })}>
                        <option value="lookup">{t('lookupMode')}</option>
                        <option value="related">{t('relatedRecordMode')}</option>
                      </select>
                    </label>
                    {selected['x-component-props']?.relationshipMode === 'related' && (
                      <label>
                        {t('parentLinkFieldOnTargetTable')}
                        <input value={selected['x-component-props']?.parentFieldName || ''} onChange={(event) => patchSelectedProps({ parentFieldName: event.target.value })} />
                      </label>
                    )}
                    <label>
                      {t('pickerVariant')}
                      <select value={selected['x-component-props']?.pickerVariant || 'table'} onChange={(event) => patchSelectedProps({ pickerVariant: event.target.value })}>
                        <option value="table">{t('tablePicker')}</option>
                        <option value="select">{t('selectPicker')}</option>
                      </select>
                    </label>
                    <label>
                      {t('addRecordAction')}
                      <select value={selected['x-component-props']?.referenceCreateAction || 'modal'} onChange={(event) => patchSelectedProps({ referenceCreateAction: event.target.value })}>
                        <option value="modal">{t('openModal')}</option>
                        <option value="navigate">{t('navigateToPage')}</option>
                      </select>
                    </label>
                    <label>
                      {t('addRecordTargetPage')}
                      <select disabled={(selected['x-component-props']?.referenceCreateAction || 'modal') !== 'navigate'} value={selected['x-component-props']?.referenceCreateTargetPageId || ''} onChange={(event) => patchSelectedProps({ referenceCreateTargetPageId: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">{t('selectPage')}</option>
                        {pages.map((pageOption) => <option key={pageOption.id} value={pageOption.id}>{pageOption.name}</option>)}
                      </select>
                    </label>
                    <label>
                      {t('addRecordQueryParamsJson')}
                      <textarea rows="3" disabled={(selected['x-component-props']?.referenceCreateAction || 'modal') !== 'navigate'} value={JSON.stringify(selected['x-component-props']?.referenceCreateNavigationParams || {}, null, 2)} onChange={(event) => patchJsonProp('referenceCreateNavigationParams', event.target.value)} />
                    </label>
                  </>
                )}
                <label className="check-row">
                  <input className="custom-checkbox" type="checkbox" checked={Boolean(selected.required)} onChange={(event) => patchSelected({ required: event.target.checked })} />
                  {t('required')}
                </label>
                <label className="check-row">
                  <input className="custom-checkbox" type="checkbox" checked={Boolean(selected['x-component-props']?.disabled)} onChange={(event) => patchSelectedProps({ disabled: event.target.checked })} />
                  {t('disabled')}
                </label>
                <label className="check-row">
                  <input className="custom-checkbox" type="checkbox" checked={Boolean(selected['x-component-props']?.hiddenInForms)} onChange={(event) => patchSelectedProps({ hiddenInForms: event.target.checked })} />
                  {t('hiddenInForms')}
                </label>
                {['Input', 'Input.TextArea', 'Textarea'].includes(selected['x-component']) && (
                  <div className="builder-config-group">
                    <strong>{t('valueGenerator')}</strong>
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
                      {t('generateValue')}
                    </label>
                    <label>
                      {t('template')}
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
                      {t('allowManualEdits')}
                    </label>
                  </div>
                )}
                <div className="builder-config-group">
                  <strong>{t('visibility')}</strong>
                  <label>
                    {t('visibleWhenField')}
                    <select
                      value={selected['x-component-props']?.visibleWhen?.field || ''}
                      onChange={(event) => patchSelectedProps({
                        visibleWhen: {
                          ...(selected['x-component-props']?.visibleWhen || {}),
                          field: event.target.value,
                        },
                      })}
                    >
                      <option value="">{t('alwaysVisible')}</option>
                      {fieldOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>
                    {t('operator')}
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
                      <option value="=">{t('equals')}</option>
                      <option value="!=">{t('notEquals')}</option>
                      <option value="contains">{t('contains')}</option>
                    </select>
                  </label>
                  <label>
                    {t('value')}
                      <input
                      value={selected['x-component-props']?.visibleWhen?.value || ''}
                      disabled={!selected['x-component-props']?.visibleWhen?.field}
                      placeholder={t('matchValue')}
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
                {t('optionsOnePerLine')}
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
