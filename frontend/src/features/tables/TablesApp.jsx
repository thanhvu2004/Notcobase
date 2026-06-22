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
  updateColumn,
  updateRecord,
  updateTable,
} from './tablesApi'

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
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="secondary icon-button" onClick={onClose} aria-label="Close">
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
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(event.target.checked)} />
        Checked
      </label>
    )
  }

  if (type === 'select') {
    return (
      <select value={value ?? ''} required={column.isRequired} onChange={(event) => setValue(event.target.value)}>
        <option value="">-- Select --</option>
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
        placeholder="Record IDs, comma-separated"
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
          Name
          <input value={form.name} autoFocus required onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          Description
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
          Inherit properties from another table
        </label>
        {form.inheritProperties && (
          <label>
            Parent table
            <select required value={form.parentTableId} onChange={(event) => setForm({ ...form, parentTableId: event.target.value })}>
              <option value="">Select parent table</option>
              {tables
                .filter((table) => table.id !== editingTableId)
                .map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} ({table.columnCount || 0} fields)
                  </option>
                ))}
            </select>
          </label>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving || (form.inheritProperties && !form.parentTableId)}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

function FieldModal({ form, setForm, title, saving, onSubmit, onClose, onConfigure }) {
  return (
    <Modal title={title} onClose={onClose}>
      <form className="modal-form" onSubmit={onSubmit}>
        <label>
          Field name
          <input value={form.name} autoFocus required onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          Field type
          <select value={form.fieldType} onChange={(event) => setForm({ ...form, fieldType: event.target.value })}>
            {fieldTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={form.isRequired} onChange={(event) => setForm({ ...form, isRequired: event.target.checked })} />
          Required
        </label>
        {form.fieldType === 'select' && (
          <button type="button" className="secondary" onClick={() => onConfigure('select')}>
            Configure options
          </button>
        )}
        {form.fieldType === 'reference' && (
          <button type="button" className="secondary" onClick={() => onConfigure('reference')}>
            Configure reference
          </button>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save field'}
          </button>
        </footer>
      </form>
    </Modal>
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
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving || formColumns.length === 0}>
            {saving ? 'Saving...' : 'Save record'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

function SelectOptionsModal({ form, setForm, onClose }) {
  const props = parseProps(form.componentPropsJson)
  const [options, setOptions] = useState(() => props.options || [])
  const [defaultValue, setDefaultValue] = useState(() => props.defaultValue || '')
  const [newOption, setNewOption] = useState('')

  function addOption() {
    const trimmed = newOption.trim()
    if (!trimmed || options.includes(trimmed)) return
    setOptions([...options, trimmed])
    setNewOption('')
    if (!defaultValue) setDefaultValue(trimmed)
  }

  function save() {
    setForm({
      ...form,
      componentPropsJson: JSON.stringify({ ...props, options, defaultValue }),
    })
    onClose()
  }

  return (
    <Modal title={`Configure "${form.name || 'select'}" options`} onClose={onClose}>
      <div className="modal-form">
        <label>
          Add option
          <div className="inline-input">
            <input value={newOption} onChange={(event) => setNewOption(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addOption())} />
            <button type="button" onClick={addOption}>
              Add
            </button>
          </div>
        </label>
        <div className="list-stack">
          {options.map((option, index) => (
            <div key={`${option}-${index}`} className="option-row">
              <input type="radio" name="defaultValue" checked={defaultValue === option} onChange={() => setDefaultValue(option)} />
              <input
                value={option}
                onChange={(event) => {
                  const next = [...options]
                  next[index] = event.target.value
                  setOptions(next)
                  if (defaultValue === option) setDefaultValue(event.target.value)
                }}
              />
              <button type="button" className="danger" onClick={() => setOptions(options.filter((_, itemIndex) => itemIndex !== index))}>
                Remove
              </button>
            </div>
          ))}
          {options.length === 0 && <p className="muted">No options added yet.</p>}
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={save}>
            Save options
          </button>
        </footer>
      </div>
    </Modal>
  )
}

function ReferenceConfigModal({ form, setForm, tables, onClose }) {
  const props = parseProps(form.componentPropsJson)
  const [targetTableId, setTargetTableId] = useState(props.targetTableId ? String(props.targetTableId) : '')
  const [relationshipMode, setRelationshipMode] = useState(props.relationshipMode === 'related' ? 'related' : 'lookup')
  const [parentFieldName, setParentFieldName] = useState(props.parentFieldName || form.name || '')

  function save() {
    setForm({
      ...form,
      componentPropsJson: JSON.stringify({
        ...props,
        type: 'reference',
        targetTableId: Number(targetTableId),
        displayColumnId: 'id',
        relationshipMode,
        parentFieldName: relationshipMode === 'related' ? parentFieldName.trim() : '',
      }),
    })
    onClose()
  }

  return (
    <Modal title={`Configure "${form.name || 'reference'}" reference`} onClose={onClose}>
      <div className="modal-form">
        <label>
          Target table
          <select required value={targetTableId} onChange={(event) => setTargetTableId(event.target.value)}>
            <option value="">Select table</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship mode
          <select value={relationshipMode} onChange={(event) => setRelationshipMode(event.target.value)}>
            <option value="lookup">Lookup mode</option>
            <option value="related">Related record mode</option>
          </select>
        </label>
        {relationshipMode === 'related' && (
          <label>
            Parent link field on target table
            <input value={parentFieldName} required onChange={(event) => setParentFieldName(event.target.value)} />
          </label>
        )}
        <p className="muted">Display currently defaults to the target record ID.</p>
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={!targetTableId || (relationshipMode === 'related' && !parentFieldName.trim())} onClick={save}>
            Save reference
          </button>
        </footer>
      </div>
    </Modal>
  )
}

function RecordsDataGrid({ columns, records, loading, onEditRecord, onDeleteRecord }) {
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
        headerName: 'ID',
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
      {
        field: '__actions',
        headerName: 'Actions',
        width: 170,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => (
          <div className="button-row compact grid-actions">
            <button type="button" className="danger" onClick={() => onDeleteRecord(params.row.__record)}>
              Delete
            </button>
          </div>
        ),
      },
    ],
    [columns, onDeleteRecord, onEditRecord],
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
      onRowDoubleClick={(params) => onEditRecord(params.row.__record)}
      getRowHeight={() => 'auto'}
    />
  )
}

export default function TablesApp() {
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
  const [configModal, setConfigModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    setTableForm(emptyTableForm)
    setEditingTable(null)
    setModal('table')
  }

  function openEditTable(table) {
    setEditingTable(table)
    setTableForm({
      name: table.name || '',
      description: table.description || '',
      inheritProperties: Boolean(table.inheritProperties),
      parentTableId: table.parentTableId ? String(table.parentTableId) : '',
    })
    setModal('table')
  }

  function openCreateField() {
    setEditingColumn(null)
    setColumnForm(emptyColumnForm)
    setModal('field')
  }

  function openEditField(column) {
    setEditingColumn(column)
    setColumnForm({
      name: column.name || '',
      fieldType: column.fieldType || 'text',
      isRequired: Boolean(column.isRequired),
      componentPropsJson: column.componentPropsJson || '{}',
    })
    setModal('field')
  }

  function openCreateRecord() {
    setEditingRecord(null)
    setRecordForm(emptyRecord(columns))
    setModal('record')
  }

  function openEditRecord(record) {
    setEditingRecord(record)
    setRecordForm(
      getVisibleFormColumns(columns).reduce((values, column) => {
        values[column.name] = getRecordValue(record, column.name)
        return values
      }, {}),
    )
    setModal('record')
  }

  async function handleSaveTable(event) {
    event.preventDefault()
    if (!tableForm.name.trim()) return

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
    if (!confirm(`Delete "${table.name}" and all of its data?`)) return
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

    const payload = {
      name: columnForm.name.trim(),
      fieldType: columnForm.fieldType,
      isRequired: columnForm.isRequired,
      componentPropsJson: columnForm.componentPropsJson || '{}',
    }

    setSaving(true)
    try {
      await ensureParentLinkColumn(payload)
      const savedColumn = editingColumn
        ? (await updateColumn(activeTable.id, editingColumn.id, payload), { ...editingColumn, ...payload })
        : await createColumn(activeTable.id, payload)

      setModal(null)
      setEditingColumn(null)
      setColumnForm(emptyColumnForm)
      await refreshActiveTable()
      broadcastSchemaMetadataChanged(activeTable.id)

      if (!editingColumn && savedColumn.fieldType === 'select' && payload.componentPropsJson === '{}') {
        setColumnForm({ ...emptyColumnForm, ...savedColumn })
        setConfigModal('select')
      }

      if (!editingColumn && savedColumn.fieldType === 'reference' && payload.componentPropsJson === '{}') {
        setColumnForm({ ...emptyColumnForm, ...savedColumn })
        setConfigModal('reference')
      }

      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveConfiguredColumn(nextColumnForm) {
    if (!activeTable || !nextColumnForm.id) return
    setSaving(true)
    try {
      await ensureParentLinkColumn(nextColumnForm)
      await updateColumn(activeTable.id, nextColumnForm.id, {
        name: nextColumnForm.name,
        fieldType: nextColumnForm.fieldType,
        isRequired: nextColumnForm.isRequired,
        componentPropsJson: nextColumnForm.componentPropsJson,
      })
      setConfigModal(null)
      setColumnForm(emptyColumnForm)
      await refreshActiveTable()
      broadcastSchemaMetadataChanged(activeTable.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteColumn(column) {
    if (!confirm(`Delete field "${column.name}"? Existing record data will remain hidden.`)) return
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
    if (!confirm('Delete this record?')) return
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
          <h1>Notcobase</h1>
          <button type="button" onClick={loadTables} disabled={loading}>
            Refresh
          </button>
        </div>

        <button type="button" className="wide-action" onClick={openCreateTable}>
          Create table
        </button>

        <div className="table-list">
          <h2>Tables</h2>
          {tables.map((table) => (
            <button
              key={table.id}
              type="button"
              className={activeTable?.id === table.id ? 'table-item active' : 'table-item'}
              onClick={() => loadTable(table)}
            >
              <span>{table.name}</span>
              <small>{table.columnCount ?? 0} fields</small>
            </button>
          ))}
          {!loading && tables.length === 0 && <p className="muted">No tables yet.</p>}
        </div>
      </aside>

      <main className="workspace">
        {error && <div className="error-banner">{error}</div>}

        {!activeTable ? (
          <section className="empty-state">
            <h2>Select or create a table</h2>
            <p>Tables created here are stored through the existing Notcobase API.</p>
          </section>
        ) : (
          <>
            <header className="workspace-header">
              <div>
                <h2>{activeTable.name}</h2>
                <p>{activeTable.description || 'No description'}</p>
              </div>
              <div className="button-row">
                <button type="button" onClick={openCreateField}>
                  Add field
                </button>
                <button type="button" onClick={openCreateRecord} disabled={getVisibleFormColumns(columns).length === 0}>
                  Add record
                </button>
                <button type="button" className="secondary" onClick={() => openEditTable(activeTable)}>
                  Edit table
                </button>
                <button type="button" className="danger" onClick={() => handleDeleteTable(activeTable)}>
                  Delete
                </button>
              </div>
            </header>

            <section className="panel panel-short fields-panel">
              <h3>Fields</h3>
              <div className="field-list compact-fields">
                {columns.map((column) => (
                  <div key={column.id} className="field-row">
                    <div>
                      <strong>{column.name}</strong>
                      <div>
                        <span>
                          {column.fieldType || 'text'}
                          <span style={{ color: 'red' }}>{column.isRequired ? ' *' : ''}</span>
                          {column.isInherited ? ' inherited' : ''}
                          {isHiddenColumn(column) ? ' hidden' : ''}
                        </span>
                      </div>
                    </div>
                    {!column.isInherited && (
                      <div className="button-row compact">
                        <button type="button" className="secondary" onClick={() => openEditField(column)}>
                          Edit
                        </button>
                        <button type="button" className="danger" onClick={() => handleDeleteColumn(column)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {columns.length === 0 && <p className="muted">Add a field before creating records.</p>}
              </div>
            </section>

            <section className="records-section">
              <div className="records-toolbar">
                <span className="muted">{records.length} records</span>
              </div>
              <div className="data-grid-shell">
                <RecordsDataGrid
                  columns={columns}
                  records={records}
                  loading={loading}
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
          title={editingTable ? `Edit ${editingTable.name}` : 'Create table'}
          form={tableForm}
          setForm={setTableForm}
          tables={tables}
          editingTableId={editingTable?.id}
          saving={saving}
          onSubmit={handleSaveTable}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'field' && (
        <FieldModal
          title={editingColumn ? `Edit field ${editingColumn.name}` : 'Add field'}
          form={columnForm}
          setForm={setColumnForm}
          saving={saving}
          onSubmit={handleSaveColumn}
          onClose={() => setModal(null)}
          onConfigure={setConfigModal}
        />
      )}
      {modal === 'record' && (
        <RecordModal
          title={editingRecord ? `Edit record #${editingRecord.id}` : `Add record to ${activeTable?.name}`}
          columns={columns}
          form={recordForm}
          setForm={setRecordForm}
          saving={saving}
          onSubmit={handleSaveRecord}
          onClose={() => setModal(null)}
        />
      )}
      {configModal === 'select' && (
        <SelectOptionsModal
          form={columnForm}
          setForm={(nextForm) => {
            setColumnForm(nextForm)
            if (nextForm.id) handleSaveConfiguredColumn(nextForm)
          }}
          onClose={() => setConfigModal(null)}
        />
      )}
      {configModal === 'reference' && (
        <ReferenceConfigModal
          form={columnForm}
          setForm={(nextForm) => {
            setColumnForm(nextForm)
            if (nextForm.id) handleSaveConfiguredColumn(nextForm)
          }}
          tables={tables}
          onClose={() => setConfigModal(null)}
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
