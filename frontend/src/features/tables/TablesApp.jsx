import { useEffect, useMemo, useState } from 'react'
import { DataGrid, GridToolbar } from '@mui/x-data-grid'
import {
  createColumn,
  createRecord,
  createTable,
  deleteColumn,
  deleteRecord,
  deleteTable,
  fetchTableDetails,
  fetchTables,
  reorderColumns,
  updateColumn,
  updateRecord,
  updateTable,
} from './tablesApi'
import { createPermissionChecker } from '../auth/permissions'
import { t } from '../../shared/locale'

const fieldTypes = ['text', 'longtext', 'url', 'number', 'finance', 'date', 'checkbox', 'select', 'reference', 'file']

const emptyTableForm = {
  name: '',
  description: '',
  inheritProperties: false,
  parentTableId: '',
}

const emptyColumnForm = {
  name: '',
  fieldType: 'text',
  isRequired: false,
  componentPropsJson: '{}',
}

function parseProps(source) {
  if (!source) return {}
  if (typeof source === 'object') return source
  try {
    return JSON.parse(source)
  } catch {
    return {}
  }
}

function parseIds(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite)
  if (value == null || value === '') return []
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : []
  if (typeof value === 'string') {
    try {
      return parseIds(JSON.parse(value))
    } catch {
      return value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter(Number.isFinite)
    }
  }
  return []
}

function isHiddenColumn(column) {
  const props = parseProps(column?.componentPropsJson)
  return props.hiddenInForms === true || props.type === 'parent-link'
}

function getVisibleFormColumns(columns) {
  return columns.filter((column) => !isHiddenColumn(column))
}

function emptyRecord(columns) {
  return getVisibleFormColumns(columns).reduce((values, column) => {
    const props = parseProps(column.componentPropsJson)
    if (column.fieldType === 'checkbox') values[column.name] = false
    else if (column.fieldType === 'reference') values[column.name] = []
    else if (column.fieldType === 'select') values[column.name] = props.defaultValue ?? ''
    else values[column.name] = ''
    return values
  }, {})
}

function broadcastSchemaMetadataChanged(tableId) {
  localStorage.setItem(
    'notcobase:schema-metadata-changed',
    JSON.stringify({ tableId: tableId ?? null, at: Date.now() }),
  )
}

function coerceRecordValue(value, fieldType, componentPropsJson) {
  if (fieldType === 'number' || fieldType === 'finance') {
    return value === '' || value == null ? null : Number(value)
  }

  if (fieldType === 'checkbox') {
    return Boolean(value)
  }

  if (fieldType === 'reference') {
    const props = parseProps(componentPropsJson)
    return JSON.stringify(parseIds(value ?? props.defaultValue))
  }

  return value
}

function formatRecordValue(value, fieldType) {
  if (fieldType === 'checkbox') {
    return value === true || value === 'true' || value === '1' || value === 1 ? 'Yes' : 'No'
  }

  if (fieldType === 'reference') {
    const ids = parseIds(value)
    return ids.length ? ids.map((id) => `#${id}`).join(', ') : ''
  }

  return String(value ?? '')
}

function getRecordValue(record, columnName) {
  return record?.data?.[columnName] ?? ''
}

function Modal({ title, children, onClose }) {
  function handleClose(event) {
    event?.preventDefault()
    event?.stopPropagation()
    onClose?.()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={handleClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="secondary icon-button" onMouseDown={(event) => event.stopPropagation()} onClick={handleClose} aria-label={t('close')}>
            x
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

function renderRecordInput(column, recordForm, setRecordForm) {
  const type = String(column.fieldType || 'text').toLowerCase()
  const value = recordForm[column.name]
  const props = parseProps(column.componentPropsJson)
  const setValue = (nextValue) => setRecordForm({ ...recordForm, [column.name]: nextValue })

  if (type === 'checkbox') {
    return (
      <label className="check-row field-control">
        <input className='custom-checkbox' type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(event.target.checked)} />
        {t('checked')}
      </label>
    )
  }

  if (type === 'select') {
    return (
      <select value={value ?? ''} required={column.isRequired} onChange={(event) => setValue(event.target.value)}>
        <option value="">{t('selectPlaceholder')}</option>
        {(props.options || []).map((option) => {
          const optionValue = typeof option === 'object' ? option.value : option
          const optionLabel = typeof option === 'object' ? option.label : option
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          )
        })}
      </select>
    )
  }

  if (type === 'reference') {
    return (
      <input
        value={Array.isArray(value) ? value.join(', ') : value ?? ''}
        placeholder={t('recordIdsCommaSeparated')}
        required={column.isRequired}
        onChange={(event) => setValue(event.target.value)}
      />
    )
  }

  if (type === 'longtext') {
    return (
      <textarea
        rows="4"
        value={value ?? ''}
        required={column.isRequired}
        onChange={(event) => setValue(event.target.value)}
      />
    )
  }

  if (type === 'file') {
    return <input type="file" required={column.isRequired} onChange={(event) => setValue(event.target.files?.[0]?.name || '')} />
  }

  return (
    <input
      type={type === 'number' || type === 'finance' ? 'number' : type === 'date' ? 'date' : type === 'url' ? 'url' : 'text'}
      value={value ?? ''}
      required={column.isRequired}
      step={type === 'finance' ? '0.01' : undefined}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

function TableModal({ title, form, setForm, tables, editingTableId, saving, onSubmit, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <form className="modal-form" onSubmit={onSubmit}>
        <label>
          {t('fieldName')}
          <input value={form.name} autoFocus required onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          {t('fieldForm')}
          <textarea rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.inheritProperties}
            disabled={tables.length === 0}
            onChange={(event) =>
              setForm({
                ...form,
                inheritProperties: event.target.checked,
                parentTableId: event.target.checked ? form.parentTableId : '',
              })
            }
          />
          {t('inheritPropertiesFromAnotherTable')}
        </label>
        {form.inheritProperties && (
          <label>
            {t('parentTable')}
            <select required value={form.parentTableId} onChange={(event) => setForm({ ...form, parentTableId: event.target.value })}>
              <option value="">{t('selectParentTable')}</option>
              {tables
                .filter((table) => table.id !== editingTableId)
                .map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} ({table.columnCount || 0} {t('fields')})
                  </option>
                ))}
            </select>
          </label>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" onMouseDown={(event) => event.stopPropagation()} onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" disabled={saving || (form.inheritProperties && !form.parentTableId)}>
            {saving ? t('saving') : t('save')}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

function setFormProps(form, setForm, nextProps) {
  setForm({
    ...form,
    componentPropsJson: JSON.stringify({ ...parseProps(form.componentPropsJson), ...nextProps }),
  })
}

function SelectOptionsConfig({ form, setForm }) {
  const props = parseProps(form.componentPropsJson)
  const options = props.options || []
  const defaultValue = props.defaultValue || ''
  const [newOption, setNewOption] = useState('')

  function updateOptions(nextOptions, nextDefaultValue = defaultValue) {
    setFormProps(form, setForm, {
      options: nextOptions,
      defaultValue: nextOptions.includes(nextDefaultValue) ? nextDefaultValue : nextOptions[0] || '',
    })
  }

  function addOption() {
    const trimmed = newOption.trim()
    if (!trimmed || options.includes(trimmed)) return
    updateOptions([...options, trimmed], defaultValue || trimmed)
    setNewOption('')
  }

  return (
    <section className="field-config-panel">
      <h4>{t('selectOptions')}</h4>
      <label>
        {t('addOption')}
        <div className="inline-input">
          <input
            value={newOption}
            onChange={(event) => setNewOption(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addOption())}
          />
          <button type="button" onClick={addOption}>
            Add
          </button>
        </div>
      </label>
      <div className="list-stack">
        {options.map((option, index) => (
          <div key={`${option}-${index}`} className="option-row">
            <input
              type="radio"
              name="defaultValue"
              checked={defaultValue === option}
              onChange={() => setFormProps(form, setForm, { defaultValue: option })}
            />
            <input
              value={option}
              onChange={(event) => {
                const next = [...options]
                next[index] = event.target.value
                updateOptions(next, defaultValue === option ? event.target.value : defaultValue)
              }}
            />
            <button type="button" className="danger" onClick={() => updateOptions(options.filter((_, itemIndex) => itemIndex !== index))}>
              {t('remove')}
            </button>
          </div>
        ))}
        {options.length === 0 && <p className="muted">{t('noOptionsAddedYet')}</p>}
      </div>
    </section>
  )
}

function ReferenceConfig({ form, setForm, tables }) {
  const props = parseProps(form.componentPropsJson)
  const targetTableId = props.targetTableId ? String(props.targetTableId) : ''
  const relationshipMode = props.relationshipMode === 'related' ? 'related' : 'lookup'
  const parentFieldName = props.parentFieldName || form.name || ''

  function updateReference(nextProps) {
    const nextRelationshipMode = nextProps.relationshipMode || relationshipMode
    const nextTargetTableId = Number(nextProps.targetTableId ?? targetTableId) || ''
    setFormProps(form, setForm, {
      type: 'reference',
      displayColumnId: 'id',
      ...nextProps,
      targetTableId: nextTargetTableId,
      relationshipMode: nextRelationshipMode,
      parentFieldName:
        nextRelationshipMode === 'related' ? nextProps.parentFieldName ?? parentFieldName : '',
    })
  }

  return (
    <section className="field-config-panel">
      <h4>{t('referenceSettings')}</h4>
      <label>
        {t('targetTable')}
        <select required value={targetTableId} onChange={(event) => updateReference({ targetTableId: event.target.value })}>
          <option value="">{t('selectTable')}</option>
          {tables.map((table) => (
            <option key={table.id} value={table.id}>
              {table.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('relationshipMode')}
        <select value={relationshipMode} onChange={(event) => updateReference({ relationshipMode: event.target.value })}>
          <option value="lookup">{t('lookupMode')}</option>
          <option value="related">{t('relatedRecordMode')}</option>
        </select>
      </label>
      {relationshipMode === 'related' && (
        <label>
          {t('parentLinkFieldOnTargetTable')}
          <input required value={parentFieldName} onChange={(event) => updateReference({ parentFieldName: event.target.value })} />
        </label>
      )}
      <p className="muted">{t('displayDefaultsTargetRecordId')}</p>
    </section>
  )
}

function FieldForm({ form, setForm, title, saving, tables, onSubmit, onReset }) {
  const props = parseProps(form.componentPropsJson)
  const referenceIsIncomplete =
    form.fieldType === 'reference' &&
    (!props.targetTableId || (props.relationshipMode === 'related' && !String(props.parentFieldName || '').trim()))

  return (
    <form className="field-form panel-form" onSubmit={onSubmit}>
      <div className="field-form-header">
        <h3>{title}</h3>
      </div>
        <label>
          {t('fieldName')}
          <input value={form.name} autoFocus required onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          {t('fieldType')}
          <select
            value={form.fieldType}
            onChange={(event) => setForm({ ...form, fieldType: event.target.value, componentPropsJson: '{}' })}
          >
            {fieldTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input  className='custom-checkbox' type="checkbox" checked={form.isRequired} onChange={(event) => setForm({ ...form, isRequired: event.target.checked })} />
          {t('required')}
        </label>
        {form.fieldType === 'select' && <SelectOptionsConfig form={form} setForm={setForm} />}
        {form.fieldType === 'reference' && <ReferenceConfig form={form} setForm={setForm} tables={tables} />}
        <footer className="form-actions">
          <button type="button" className="secondary" onClick={onReset}>
            {t('clear')}
          </button>
          <button type="submit" disabled={saving || referenceIsIncomplete}>
            {saving ? t('saving') : t('saveField')}
          </button>
        </footer>
      </form>
  )
}

function RecordModal({ title, columns, form, setForm, saving, onSubmit, onClose }) {
  const formColumns = getVisibleFormColumns(columns)
  return (
    <Modal title={title} onClose={onClose}>
      <form className="modal-form" onSubmit={onSubmit}>
        {formColumns.map((column) => (
          <label key={column.id}>
            <span>
              {column.name}
              {column.isRequired && <span className="required-mark"> *</span>}
            </span>
            {renderRecordInput(column, form, setForm)}
          </label>
        ))}
        <footer className="modal-actions">
          <button type="button" className="secondary" onMouseDown={(event) => event.stopPropagation()} onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" disabled={saving || formColumns.length === 0}>
            {saving ? t('saving') : t('saveRecord')}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

function RecordsDataGrid({ columns, records, loading, canEditRecord, canDeleteRecord, onEditRecord, onDeleteRecord }) {
  const gridRows = useMemo(
    () =>
      records.map((record) => ({
        id: record.id,
        __record: record,
        ...columns.reduce((values, column) => {
          values[column.name] = getGridValue(record, column)
          return values
        }, {}),
      })),
    [columns, records],
  )

  const gridColumns = useMemo(
    () => [
      {
        field: 'id',
        headerName: t('id'),
        width: 90,
        type: 'number',
      },
      ...columns.map((column) => ({
        field: column.name,
        headerName: column.name,
        minWidth: 160,
        flex: 1,
        type: getGridColumnType(column),
        valueFormatter: (value) => formatRecordValue(value, column.fieldType),
      })),
      ...(canDeleteRecord ? [{
        field: '__actions',
        headerName: t('actions'),
        width: 170,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => (
          <div className="button-row compact grid-actions">
            <button type="button" className="danger" onClick={() => onDeleteRecord(params.row.__record)}>
              {t('delete')}
            </button>
          </div>
        ),
      }] : []),
    ],
    [canDeleteRecord, columns, onDeleteRecord],
  )

  return (
    <DataGrid
      rows={gridRows}
      columns={gridColumns}
      loading={loading}
      disableRowSelectionOnClick
      showToolbar
      slots={{ toolbar: GridToolbar }}
      initialState={{
        pagination: { paginationModel: { pageSize: 25, page: 0 } },
      }}
      pageSizeOptions={[10, 25, 50, 100]}
      onRowDoubleClick={(params) => canEditRecord && onEditRecord(params.row.__record)}
      getRowHeight={() => 'auto'}
    />
  )
}

export default function TablesApp({ user }) {
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [columns, setColumns] = useState([])
  const [records, setRecords] = useState([])
  const [tableForm, setTableForm] = useState(emptyTableForm)
  const [editingTable, setEditingTable] = useState(null)
  const [columnForm, setColumnForm] = useState(emptyColumnForm)
  const [editingColumn, setEditingColumn] = useState(null)
  const [recordForm, setRecordForm] = useState({})
  const [editingRecord, setEditingRecord] = useState(null)
  const [modal, setModal] = useState(null)
  const [draggedColumnId, setDraggedColumnId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const can = createPermissionChecker(user)
  const canCreateTable = can('tables.create')
  const canEditTable = can('tables.edit')
  const canDeleteTable = can('tables.delete')
  const canCreateField = can('columns.create')
  const canEditField = can('columns.edit')
  const canDeleteField = can('columns.delete')
  const canReorderFields = canEditField
  const canCreateRecord = can('records.create')
  const canEditRecord = can('records.edit')
  const canDeleteRecord = can('records.delete')

  const activeTable = useMemo(
    () => tables.find((table) => table.id === selectedTable?.id) || selectedTable,
    [selectedTable, tables],
  )

  async function loadTables() {
    setLoading(true)
    try {
      const nextTables = await fetchTables()
      setTables(nextTables)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadTable(table) {
    setSelectedTable(table)
    setEditingColumn(null)
    setColumnForm(emptyColumnForm)
    setLoading(true)
    try {
      const details = await fetchTableDetails(table.id)
      setColumns(details.columns)
      setRecords(details.records)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshActiveTable() {
    if (!activeTable) return
    const [nextTables, details] = await Promise.all([fetchTables(), fetchTableDetails(activeTable.id)])
    setTables(nextTables)
    setColumns(details.columns)
    setRecords(details.records)
    setSelectedTable(nextTables.find((table) => table.id === activeTable.id) || activeTable)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTables()
  }, [])

  function openCreateTable() {
    if (!canCreateTable) return
    setTableForm(emptyTableForm)
    setEditingTable(null)
    setModal('table')
  }

  function openEditTable(table) {
    if (!canEditTable) return
    setEditingTable(table)
    setTableForm({
      name: table.name || '',
      description: table.description || '',
      inheritProperties: Boolean(table.inheritProperties),
      parentTableId: table.parentTableId ? String(table.parentTableId) : '',
    })
    setModal('table')
  }

  function resetFieldForm() {
    setEditingColumn(null)
    setColumnForm(emptyColumnForm)
  }

  function openEditField(column) {
    if (!canEditField) return
    setEditingColumn(column)
    setColumnForm({
      name: column.name || '',
      fieldType: column.fieldType || 'text',
      isRequired: Boolean(column.isRequired),
      componentPropsJson: column.componentPropsJson || '{}',
    })
  }

  function openCreateRecord() {
    if (!canCreateRecord) return
    setEditingRecord(null)
    setRecordForm(emptyRecord(columns))
    setModal('record')
  }

  function openEditRecord(record) {
    if (!canEditRecord) return
    setEditingRecord(record)
    setRecordForm(
      getVisibleFormColumns(columns).reduce((values, column) => {
        values[column.name] = getRecordValue(record, column.name)
        return values
      }, {}),
    )
    setModal('record')
  }

  async function handleReorderColumn(targetColumn) {
    if (!canReorderFields) return
    if (!activeTable || !draggedColumnId || draggedColumnId === targetColumn.id || targetColumn.isInherited) return

    const draggedColumn = columns.find((column) => column.id === draggedColumnId)
    if (!draggedColumn || draggedColumn.isInherited) return

    const previousColumns = columns
    const ownColumns = columns.filter((column) => !column.isInherited)
    const fromIndex = ownColumns.findIndex((column) => column.id === draggedColumnId)
    const toIndex = ownColumns.findIndex((column) => column.id === targetColumn.id)

    if (fromIndex < 0 || toIndex < 0) return

    const reorderedOwnColumns = [...ownColumns]
    const [movedColumn] = reorderedOwnColumns.splice(fromIndex, 1)
    reorderedOwnColumns.splice(toIndex, 0, movedColumn)

    let nextOwnColumnIndex = 0
    const nextColumns = columns.map((column) => {
      if (column.isInherited) return column
      const nextColumn = reorderedOwnColumns[nextOwnColumnIndex]
      nextOwnColumnIndex += 1
      return nextColumn
    })

    setColumns(nextColumns)
    setDraggedColumnId(null)

    try {
      await reorderColumns(activeTable.id, reorderedOwnColumns.map((column) => column.id))
      await refreshActiveTable()
      broadcastSchemaMetadataChanged(activeTable.id)
      setError('')
    } catch (err) {
      setColumns(previousColumns)
      setError(err.message)
    }
  }

  async function handleSaveTable(event) {
    event.preventDefault()
    if (!tableForm.name.trim()) return
    if (editingTable?.id ? !canEditTable : !canCreateTable) return

    const payload = {
      name: tableForm.name.trim(),
      description: tableForm.description,
      inheritProperties: tableForm.inheritProperties,
      parentTableId: tableForm.inheritProperties ? Number(tableForm.parentTableId) : null,
    }

    setSaving(true)
    try {
      if (editingTable?.id) {
        await updateTable(editingTable.id, payload)
        await refreshActiveTable()
        broadcastSchemaMetadataChanged(editingTable.id)
      } else {
        const table = await createTable(payload)
        await loadTables()
        await loadTable(table)
        broadcastSchemaMetadataChanged(table.id)
      }
      setModal(null)
      setEditingTable(null)
      setTableForm(emptyTableForm)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteTable(table) {
    if (!canDeleteTable) return
    if (!confirm(t('deleteTableConfirm', { tableName: table.name }))) return
    setSaving(true)
    try {
      await deleteTable(table.id)
      if (activeTable?.id === table.id) {
        setSelectedTable(null)
        setColumns([])
        setRecords([])
      }
      await loadTables()
      broadcastSchemaMetadataChanged(table.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveColumn(event) {
    event.preventDefault()
    if (!activeTable || !columnForm.name.trim()) return
    if (editingColumn ? !canEditField : !canCreateField) return

    const payload = {
      name: columnForm.name.trim(),
      fieldType: columnForm.fieldType,
      isRequired: columnForm.isRequired,
      componentPropsJson: columnForm.componentPropsJson || '{}',
    }

    setSaving(true)
    try {
      await ensureParentLinkColumn(payload)
      if (editingColumn) await updateColumn(activeTable.id, editingColumn.id, payload)
      else await createColumn(activeTable.id, payload)

      setEditingColumn(null)
      setColumnForm(emptyColumnForm)
      await refreshActiveTable()
      broadcastSchemaMetadataChanged(activeTable.id)

      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteColumn(column) {
    if (!canDeleteField) return
    if (!confirm(t('deleteFieldConfirm', { fieldName: column.name }))) return
    setSaving(true)
    try {
      await deleteColumn(activeTable.id, column.id)
      await refreshActiveTable()
      broadcastSchemaMetadataChanged(activeTable.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveRecord(event) {
    event.preventDefault()
    if (!activeTable || columns.length === 0) return
    if (editingRecord ? !canEditRecord : !canCreateRecord) return

    const data = getVisibleFormColumns(columns).reduce((values, column) => {
      const value = coerceRecordValue(recordForm[column.name], column.fieldType, column.componentPropsJson)
      if (value !== '' && value !== null && value !== undefined) values[column.name] = value
      else if (column.isRequired) values[column.name] = value
      return values
    }, {})

    setSaving(true)
    try {
      if (editingRecord) await updateRecord(activeTable.id, editingRecord.id, data)
      else await createRecord(activeTable.id, data)
      setModal(null)
      setRecordForm({})
      setEditingRecord(null)
      await refreshActiveTable()
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRecord(record) {
    if (!canDeleteRecord) return
    if (!confirm(t('deleteRecordConfirm')) ) return
    setSaving(true)
    try {
      await deleteRecord(activeTable.id, record.id)
      await refreshActiveTable()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <h1>{t('brand')}</h1>
          <button type="button" onClick={loadTables} disabled={loading} className="outline">
            {t('refresh')}
          </button>
        </div>

        {canCreateTable && (
          <button type="button" className="wide-action" onClick={openCreateTable}>
            {t('createTable')}
          </button>
        )}

        <div className="table-list">
          <h2>{t('tablesList')}</h2>
          {tables.map((table) => (
            <button
              key={table.id}
              type="button"
              className={activeTable?.id === table.id ? 'table-item active' : 'table-item'}
              onClick={() => loadTable(table)}
            >
              <span>{table.name}</span>
              <small>{t('fieldsCount', { count: table.columnCount ?? 0 })}</small>
            </button>
          ))}
          {!loading && tables.length === 0 && <p className="muted">{t('noTablesYet')}</p>}
        </div>
      </aside>

      <main className="workspace">
        {error && <div className="error-banner">{error}</div>}

        {!activeTable ? (
          <section className="empty-state">
            <h2>{t('selectOrCreateTable')}</h2>
          </section>
        ) : (
          <>
            <header className="workspace-header">
              <div>
                <h2>{activeTable.name}</h2>
                <p>{activeTable.description || t('noDescription')}</p>
              </div>
              <div className="button-row">
                {canCreateRecord && (
                  <button type="button" onClick={openCreateRecord} disabled={getVisibleFormColumns(columns).length === 0}>
                    {t('addRecord')}
                  </button>
                )}
                {canEditTable && (
                  <button type="button" className="secondary" onClick={() => openEditTable(activeTable)}>
                    {t('editTable')}
                  </button>
                )}
                {canDeleteTable && (
                  <button type="button" className="danger" onClick={() => handleDeleteTable(activeTable)}>
                    {t('delete')}
                  </button>
                )}
              </div>
            </header>

            <div className="fields-layout">
              <section className="panel panel-short fields-panel">
                <h3>{t('fields')}</h3>
                <p className="muted">{t('dragDropFields')}</p>
                <div className="field-list compact-fields">
                  {columns.map((column) => (
                    <div
                      key={column.id}
                      className={draggedColumnId === column.id ? 'field-row dragging' : 'field-row'}
                      draggable={canReorderFields && !column.isInherited}
                      onDragStart={(event) => {
                        if (!canReorderFields || column.isInherited) return
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', String(column.id))
                        setDraggedColumnId(column.id)
                      }}
                      onDragOver={(event) => {
                        if (!column.isInherited && draggedColumnId && draggedColumnId !== column.id) {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        handleReorderColumn(column)
                      }}
                      onDragEnd={() => setDraggedColumnId(null)}
                    >
                      <div>
                        <strong>{column.name}</strong>
                        <div>
                          <span>
                            {column.fieldType || 'text'}
                            <span style={{ color: 'red' }}>{column.isRequired ? ' *' : ''}</span>
                            {column.isInherited ? ` ${t('inherited')}` : ''}
                            {isHiddenColumn(column) ? ` ${t('hidden')}` : ''}
                          </span>
                        </div>
                      </div>
                      {!column.isInherited && (canEditField || canDeleteField) && (
                        <div className="button-row compact">
                          {canEditField && (
                            <button type="button" className="secondary" onClick={() => openEditField(column)}>
                              {t('edit')}
                            </button>
                          )}
                          {canDeleteField && (
                            <button type="button" className="danger" onClick={() => handleDeleteColumn(column)}>
                              {t('delete')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {columns.length === 0 && <p className="muted">{t('noRecordsMessage')}</p>}
                </div>
              </section>

              {(canCreateField || (canEditField && editingColumn)) && (
                <FieldForm
                  title={editingColumn ? t('editField', { fieldName: editingColumn.name }) : t('addField')}
                  form={columnForm}
                  setForm={setColumnForm}
                  tables={tables}
                  saving={saving}
                  onSubmit={handleSaveColumn}
                  onReset={resetFieldForm}
                />
              )}
            </div>

            <section className="records-section">
              <div className="records-toolbar">
                <span className="muted">{t('recordsCount', { count: records.length })}</span>
              </div>
              <div className="data-grid-shell">
                <RecordsDataGrid
                  columns={columns}
                  records={records}
                  loading={loading}
                  canEditRecord={canEditRecord}
                  canDeleteRecord={canDeleteRecord}
                  onEditRecord={openEditRecord}
                  onDeleteRecord={handleDeleteRecord}
                />
              </div>
            </section>
          </>
        )}
      </main>

      {modal === 'table' && (
        <TableModal
          title={editingTable ? t('editTableTitle', { tableName: editingTable.name }) : t('createTableTitle')}
          form={tableForm}
          setForm={setTableForm}
          tables={tables}
          editingTableId={editingTable?.id}
          saving={saving}
          onSubmit={handleSaveTable}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'record' && (
        <RecordModal
          title={editingRecord ? t('editRecord', { id: editingRecord.id }) : t('addRecordToTable', { tableName: activeTable?.name || '' })}
          columns={columns}
          form={recordForm}
          setForm={setRecordForm}
          saving={saving}
          onSubmit={handleSaveRecord}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function getGridValue(record, column) {
  const value = record.data?.[column.name]
  if (column.fieldType === 'number' || column.fieldType === 'finance') {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }
  if (column.fieldType === 'date') {
    const timestamp = value ? Date.parse(value) : NaN
    return Number.isNaN(timestamp) ? null : new Date(timestamp)
  }
  if (column.fieldType === 'checkbox') {
    return value === true || value === 'true' || value === '1' || value === 1
  }
  return value ?? ''
}

function getGridColumnType(column) {
  if (column.fieldType === 'number' || column.fieldType === 'finance') return 'number'
  if (column.fieldType === 'date') return 'date'
  if (column.fieldType === 'checkbox') return 'boolean'
  return 'string'
}

async function ensureParentLinkColumn(columnForm) {
  if (columnForm.fieldType !== 'reference') return
  const props = parseProps(columnForm.componentPropsJson)
  if (props.relationshipMode !== 'related' || !props.targetTableId || !props.parentFieldName) return

  const { columns } = await fetchTableDetails(props.targetTableId)
  const existing = columns.find(
    (column) => String(column.name || '').toLowerCase() === String(props.parentFieldName).toLowerCase(),
  )
  const linkProps = JSON.stringify({ type: 'parent-link', hiddenInForms: true })

  if (existing) {
    const existingProps = parseProps(existing.componentPropsJson)
    if (
      existing.tableId === Number(props.targetTableId) &&
      (existing.fieldType !== 'number' || existing.isRequired || existingProps.type !== 'parent-link' || existingProps.hiddenInForms !== true)
    ) {
      await updateColumn(props.targetTableId, existing.id, {
        name: existing.name,
        fieldType: 'number',
        isRequired: false,
        componentPropsJson: linkProps,
      })
    }
    return
  }

  await createColumn(props.targetTableId, {
    name: props.parentFieldName,
    fieldType: 'number',
    isRequired: false,
    componentPropsJson: linkProps,
  })
}
