/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react'
import { Collapse, Col as AntCol, Divider as AntDivider, Row as AntRow, Select as AntSelect, Tabs as AntTabs, message } from 'antd'
import { DataGrid, GridToolbar } from '@mui/x-data-grid'
import { createRecord, updateRecord } from '../../tables/tablesApi'
import {
  areFormValuesEqual,
  applyGeneratedValues,
  coerceFormValue,
  collectInitialFormValuesFromSchema,
  createInitialFormData,
  formatValue,
  getColumnByFieldName,
  getDisplayValue,
  getDynamicSelectOptions,
  getFieldComponentForColumn,
  getOptionLabel,
  getOptionValue,
  getParentFieldName,
  getRecordDisplayColumns,
  getRecordIdFromLocation,
  getReferenceMode,
  getTableColumns,
  navigateToPage,
  normalizeReferenceValue,
  parseIds,
  parseProps,
  shouldRenderNode,
} from './dataUtils'
import { getFormGroupKey } from './formGroups'
import { getColProps, normalizeGutter } from './layoutUtils'

function RequiredLabel({ children, required }) {
  return (
    <>
      {children}
      {required && <span className="required-mark"> *</span>}
    </>
  )
}

function getDropPosition(event, node) {
  const rect = event.currentTarget.getBoundingClientRect()
  const relativeY = rect.height ? (event.clientY - rect.top) / rect.height : 0
  if (node.properties && relativeY > 0.25 && relativeY < 0.75) return 'inside'
  return relativeY < 0.5 ? 'before' : 'after'
}

function autoScrollForPointer(event) {
  if (typeof window === 'undefined' || !event?.clientY) return
  const edgeSize = 96
  const maxSpeed = 28
  const { clientY } = event
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  let delta = 0

  if (clientY < edgeSize) {
    delta = -Math.ceil(((edgeSize - clientY) / edgeSize) * maxSpeed)
  } else if (clientY > viewportHeight - edgeSize) {
    delta = Math.ceil(((clientY - (viewportHeight - edgeSize)) / edgeSize) * maxSpeed)
  }

  if (delta !== 0) {
    window.scrollBy({ top: delta, behavior: 'auto' })
  }
}

function collectSchemaFieldNames(node, names = new Set()) {
  if (!node || typeof node !== 'object') return names
  const fieldName = node['x-field'] || node.name
  if (fieldName && ['Input', 'InputNumber', 'Input.TextArea', 'Textarea', 'Select', 'Checkbox', 'Switch', 'DatePicker', 'File', 'Reference'].includes(node['x-component'])) {
    names.add(fieldName)
  }
  Object.values(node.properties || {}).forEach((child) => collectSchemaFieldNames(child, names))
  return names
}

function isBlankValue(value, column) {
  if (column?.fieldType === 'checkbox') return value !== true
  if (column?.fieldType === 'reference') return parseIds(value).length === 0
  if (Array.isArray(value)) return value.length === 0
  return value === undefined || value === null || value === ''
}

function getMissingRequiredColumn(columns, values) {
  return (columns || []).find((column) => column.isRequired && isBlankValue(values?.[column.name], column))
}

function closeModalEvent(event, close) {
  event?.preventDefault()
  event?.stopPropagation()
  close?.()
}

function getEditorDeleteButton(node, editorMode, runtimeData) {
  if (!editorMode || node.id === runtimeData?.rootNodeId || !runtimeData?.onDeleteNode) return null

  return (
    <button
      type="button"
      className="page-node-delete"
      draggable={false}
      aria-label={`Delete ${node.title || node.name || 'component'}`}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDragStart={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        runtimeData.onDeleteNode(node.id)
      }}
    >
      x
    </button>
  )
}

function renderFieldNode({ node, editorMode, selectProps, deleteButton, className = '', children }) {
  if (!editorMode) {
    return (
      <label key={node.id} {...selectProps} className={className || undefined}>
        {children}
      </label>
    )
  }

  return (
    <div key={node.id} {...selectProps} className={`${selectProps.className || ''}${className ? ` ${className}` : ''}`}>
      {deleteButton}
      <label>
        {children}
      </label>
    </div>
  )
}

function getFormDraftKey(node, tableId, mode, recordId) {
  if (typeof window === 'undefined') return ''
  const scope = new URLSearchParams(window.location.search).get('_ncDraftScope') || 'default'
  return `notcobase:form-draft:${scope}:${node?.id || 'form'}:${tableId || 'none'}:${mode || 'create'}:${recordId || 'new'}`
}

function createDraftScope(prefix = 'scope') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function loadFormDraft(key, fallback) {
  if (!key || typeof window === 'undefined') return fallback
  try {
    const stored = window.sessionStorage.getItem(key)
    if (!stored) return fallback
    const parsed = JSON.parse(stored)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...fallback, ...parsed }
      : fallback
  } catch {
    return fallback
  }
}

function saveFormDraft(key, values) {
  if (!key || typeof window === 'undefined') return
  window.sessionStorage.setItem(key, JSON.stringify(values || {}))
}

function clearFormDraft(key) {
  if (!key || typeof window === 'undefined') return
  window.sessionStorage.removeItem(key)
}

function ReferenceTableField({ value, onChange, config, fieldName, disabled, runtimeData, parentRecordId, parentValues }) {
  const targetTableId = Number(config.targetTableId)
  const mode = getReferenceMode(config)
  const related = mode === 'related'
  const parentFieldName = getParentFieldName(config, fieldName)
  const tableDetails = runtimeData.tableDetailsById[targetTableId]
  const { visibleColumns, displayColumnName } = getRecordDisplayColumns(tableDetails, config.displayColumnId)
  const relatedValue = normalizeReferenceValue(value, related)
  const selectedIds = related ? relatedValue.ids : parseIds(value)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [draft, setDraft] = useState({})
  const records = (tableDetails?.records || []).filter((record) => {
    if (!related) return true
    if (!parentFieldName || !parentRecordId) return false
    return String(record.data?.[parentFieldName] ?? '') === String(parentRecordId)
  })
  const allIds = records.map((record) => Number(record.id))
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))
  const someSelected = allIds.some((id) => selectedIds.includes(id))

  function emit(ids, drafts = relatedValue.drafts) {
    const nextIds = parseIds(ids)
    onChange?.(related ? { ids: nextIds, drafts } : nextIds)
  }

  function toggleId(id, checked) {
    const next = new Set(selectedIds)
    if (checked) next.add(Number(id))
    else next.delete(Number(id))
    emit(Array.from(next))
  }

  function openCreate() {
    if (config.referenceCreateAction === 'navigate') {
      const draftScope = createDraftScope('reference-create')
      navigateToPage(runtimeData, config.referenceCreateTargetPageId, {
        tableId: targetTableId,
        mode: 'create',
        sourceField: fieldName,
        parentTableId: config.parentTableId,
        parentFieldName,
        ...(parentRecordId ? { parentRecordId } : {}),
        ...(config.referenceCreateNavigationParams || {}),
        _ncDraftScope: draftScope,
      }, {
        ...(parentValues || {}),
        tableId: targetTableId,
        mode: 'create',
        sourceField: fieldName,
        parentFieldName,
        ...(parentRecordId ? { parentRecordId } : {}),
      })
      return
    }
    setEditingRecord(null)
    setDraft({})
    setModalOpen(true)
  }

  function openEdit(record) {
    setEditingRecord(record)
    setDraft({ ...(record.data || {}) })
    setModalOpen(true)
  }

  function closeModal(event) {
    closeModalEvent(event, () => setModalOpen(false))
  }

  async function saveReferenceRecord() {
    if (!targetTableId) return
    const missingRequiredColumn = getMissingRequiredColumn(visibleColumns, draft)
    if (missingRequiredColumn) {
      message.error(`${missingRequiredColumn.name} is required`)
      return
    }

    if (related && !parentRecordId) {
      emit(selectedIds, [...relatedValue.drafts, draft])
      setDraft({})
      setModalOpen(false)
      return
    }

    const payload = related && parentFieldName && parentRecordId
      ? { ...draft, [parentFieldName]: parentRecordId }
      : draft

    if (editingRecord?.id) {
      await updateRecord(targetTableId, editingRecord.id, payload)
    } else {
      const created = await createRecord(targetTableId, payload)
      const createdId = Number(created?.id || created?.value?.id)
      if (createdId) emit([...selectedIds, createdId])
    }

    await runtimeData.reloadTableDetails?.(targetTableId)
    setModalOpen(false)
    setDraft({})
  }

  if (!targetTableId) return <p className="muted">Configure a target table for this reference field.</p>

  return (
    <div className="reference-table-field">
      <div className="reference-table-toolbar">
        <span className="muted">{related ? `${records.length + relatedValue.drafts.length} related` : `${selectedIds.length} selected`}</span>
        <button type="button" className="secondary" disabled={disabled} onClick={openCreate}>Add record</button>
      </div>
      {related && !parentRecordId && relatedValue.drafts.length > 0 && (
        <p className="muted">{relatedValue.drafts.length} new related record{relatedValue.drafts.length === 1 ? '' : 's'} will be created after the parent record is saved.</p>
      )}
      <div className="table-wrap reference-table-wrap">
        <table>
          <thead>
            <tr>
              <th className="reference-select-col">
                <input
                  className="custom-checkbox"
                  type="checkbox"
                  disabled={disabled || !records.length}
                  checked={allSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = !allSelected && someSelected
                  }}
                  onChange={(event) => emit(event.target.checked ? allIds : [])}
                />
              </th>
              {visibleColumns.map((column) => <th key={column.id}>{column.name}</th>)}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>
                  <input
                    className="custom-checkbox"
                    type="checkbox"
                    disabled={disabled}
                    checked={selectedIds.includes(Number(record.id))}
                    onChange={(event) => toggleId(record.id, event.target.checked)}
                  />
                </td>
                {visibleColumns.map((column) => (
                  <td key={column.id}>{formatValue(record.data?.[column.name], column.fieldType, column.componentPropsJson, runtimeData)}</td>
                ))}
                <td><button type="button" className="secondary" disabled={disabled} onClick={() => openEdit(record)}>Edit</button></td>
              </tr>
            ))}
            {relatedValue.drafts.map((item, index) => (
              <tr key={`draft-${index}`}>
                <td />
                {visibleColumns.map((column) => <td key={column.id}>{String(item?.[column.name] ?? '')}</td>)}
                <td><span className="muted">Draft</span></td>
              </tr>
            ))}
            {!records.length && !relatedValue.drafts.length && (
              <tr><td colSpan={visibleColumns.length + 2} className="muted">No records</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <small className="muted">Display column: {displayColumnName}</small>
      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section className="modal-panel reference-modal-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h2>{editingRecord ? 'Edit referenced record' : 'Create referenced record'}</h2>
              <button type="button" className="secondary icon-button" onMouseDown={(event) => event.stopPropagation()} onClick={closeModal} aria-label="Close">x</button>
            </header>
            <div className="modal-form">
              {visibleColumns.map((column) => (
                <label key={column.id}>
                  <span>{column.name}{column.isRequired && <span className="required-mark"> *</span>}</span>
                  <FieldInput
                    node={{
                      id: `ref_${column.id}`,
                      name: column.name,
                      title: column.name,
                      required: column.isRequired,
                      'x-field': column.name,
                      'x-component': getFieldComponentForColumn(column),
                      'x-component-props': parseProps(column.componentPropsJson),
                    }}
                    column={column}
                    formContext={{
                      values: draft,
                      columns: visibleColumns,
                      tableId: targetTableId,
                      disabled: false,
                      setValue(nextFieldName, nextValue) {
                        setDraft((current) => ({ ...current, [nextFieldName]: nextValue }))
                      },
                    }}
                    runtimeData={runtimeData}
                  />
                </label>
              ))}
            </div>
            <footer className="modal-actions">
              <button type="button" className="secondary" onMouseDown={(event) => event.stopPropagation()} onClick={closeModal}>Cancel</button>
              <button type="button" onClick={saveReferenceRecord}>Save</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

function TableBlockRenderer({ node, editorMode, selectProps, runtimeData }) {
  const props = node['x-component-props'] || {}
  const deleteButton = getEditorDeleteButton(node, editorMode, runtimeData)
  const tableId = Number(props.tableId)
  const tableColumns = getTableColumns(runtimeData.tableDetailsById, tableId)
  const selectedColumns = Array.isArray(props.columns)
    ? tableColumns.filter((column) => props.columns.some((item) => (typeof item === 'string' ? item : item.dataIndex) === column.name))
    : tableColumns
  const records = runtimeData.tableDetailsById[props.tableId]?.records || []
  const [modalOpen, setModalOpen] = useState(false)
  const [recordDraft, setRecordDraft] = useState(() => createInitialFormData(tableColumns))
  const [saving, setSaving] = useState(false)

  const gridRows = records.map((record) => ({
    id: record.id,
    __record: record,
    ...selectedColumns.reduce((values, column) => {
      values[column.name] = record.data?.[column.name]
      return values
    }, {}),
  }))
  const gridColumns = [
    ...selectedColumns.map((column) => ({
      field: column.name,
      headerName: column.name,
      minWidth: 160,
      flex: 1,
      sortable: true,
      renderCell: (params) => formatValue(params.row.__record?.data?.[column.name], column.fieldType, column.componentPropsJson, runtimeData),
    })),
    ...(props.allowEdit !== false || props.allowDelete ? [{
      field: '__actions',
      headerName: 'Actions',
      width: 180,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <div className="button-row compact grid-actions" onClick={(event) => event.stopPropagation()}>
          {props.allowEdit !== false && (
            <button type="button" className="secondary" onClick={() => openEdit(params.row.__record)}>
              Edit
            </button>
          )}
          {props.allowDelete && <button type="button" className="danger">Delete</button>}
        </div>
      ),
    }] : []),
  ]

  function closeModal(event) {
    closeModalEvent(event, () => setModalOpen(false))
  }

  function openCreate() {
    if (editorMode) return
    if (props.createAction === 'navigate') {
      navigateToPage(runtimeData, props.createTargetPageId, {
        tableId: props.tableId,
        mode: 'create',
        ...(props.createNavigationParams || {}),
      }, { tableId: props.tableId, mode: 'create' })
      return
    }
    setRecordDraft(createInitialFormData(tableColumns))
    setModalOpen(true)
  }

  function openEdit(record) {
    if (editorMode) return
    if (props.editAction === 'navigate') {
      const recordId = record.id
      navigateToPage(runtimeData, props.editTargetPageId, {
        id: recordId,
        recordId,
        tableId: props.tableId,
        mode: 'edit',
        ...(props.editNavigationParams || {}),
      }, { ...(record.data || {}), id: recordId, recordId, tableId: props.tableId, mode: 'edit' })
    }
  }

  function openRow(record) {
    if (editorMode) return
    if (props.rowClickAction !== 'navigate') return
    const recordId = record.id
    navigateToPage(runtimeData, props.rowTargetPageId, {
      id: recordId,
      recordId,
      tableId: props.tableId,
      mode: props.rowMode || 'view',
      ...(props.rowNavigationParams || {}),
    }, { ...(record.data || {}), id: recordId, recordId, tableId: props.tableId, mode: props.rowMode || 'view' })
  }

  async function saveRecord(event) {
    event.preventDefault()
    if (!tableId || saving) return
    const missingRequiredColumn = getMissingRequiredColumn(tableColumns, recordDraft)
    if (missingRequiredColumn) {
      message.error(`${missingRequiredColumn.name} is required`)
      return
    }

    const payload = tableColumns.reduce((data, column) => {
      data[column.name] = coerceFormValue(recordDraft[column.name], column)
      return data
    }, {})

    setSaving(true)
    try {
      await createRecord(tableId, payload)
      await runtimeData.reloadTableDetails?.(tableId)
      message.success('Saved')
      setModalOpen(false)
      setRecordDraft(createInitialFormData(tableColumns))
    } catch (err) {
      message.error(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div key={node.id} {...selectProps} className={`${selectProps.className || ''} rendered-block`}>
      {deleteButton}
      <div className="rendered-block-header">
        <h2>{node.title || 'Records'}</h2>
        {props.allowCreate !== false && <button type="button" onClick={openCreate}>New</button>}
      </div>
      {!props.tableId ? <p className="muted">Select a table in block settings.</p> : (
        <div className="table-block-grid data-grid-shell">
          <DataGrid
            rows={gridRows}
            columns={gridColumns}
            disableRowSelectionOnClick
            showToolbar
            slots={{ toolbar: GridToolbar }}
            initialState={{
              pagination: { paginationModel: { pageSize: props.pageSize || 10, page: 0 } },
            }}
            pageSizeOptions={[5, 10, 25, 50, 100]}
            onRowClick={(params) => openRow(params.row.__record)}
            getRowClassName={() => (!editorMode && props.rowClickAction === 'navigate' ? 'clickable-row' : '')}
            getRowHeight={() => 'auto'}
          />
        </div>
      )}
      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section className="modal-panel reference-modal-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h2>{`Add record${runtimeData.tables?.find((table) => table.id === tableId)?.name ? ` to ${runtimeData.tables.find((table) => table.id === tableId).name}` : ''}`}</h2>
              <button type="button" className="secondary icon-button" onMouseDown={(event) => event.stopPropagation()} onClick={closeModal} aria-label="Close">x</button>
            </header>
            <form className="modal-form" onSubmit={saveRecord}>
              {tableColumns.map((column) => (
                <label key={column.id}>
                  <span>{column.name}{column.isRequired && <span className="required-mark"> *</span>}</span>
                  <FieldInput
                    node={{
                      id: `table_block_${column.id}`,
                      name: column.name,
                      title: column.name,
                      required: column.isRequired,
                      'x-field': column.name,
                      'x-component': getFieldComponentForColumn(column),
                      'x-component-props': parseProps(column.componentPropsJson),
                    }}
                    column={column}
                    formContext={{
                      values: recordDraft,
                      columns: tableColumns,
                      tableId,
                      mode: 'create',
                      disabled: false,
                      setValue(nextFieldName, nextValue) {
                        setRecordDraft((current) => ({ ...current, [nextFieldName]: nextValue }))
                      },
                    }}
                    runtimeData={runtimeData}
                  />
                </label>
              ))}
              <footer className="modal-actions">
                <button type="button" className="secondary" onMouseDown={(event) => event.stopPropagation()} onClick={closeModal}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function FieldInput({ node, column, formContext, runtimeData }) {
  const props = { ...parseProps(column?.componentPropsJson), ...(node['x-component-props'] || {}) }
  const fieldName = node['x-field'] || node.name || column?.name
  const component = node['x-component'] || 'Input'
  const value = formContext?.values?.[fieldName]
  const generatorLocked = formContext?.mode === 'create' && props.valueGeneratorEnabled && props.valueGeneratorEditable === false
  const disabled = props.disabled || formContext?.disabled || generatorLocked
  const setValue = (nextValue) => formContext?.setValue(fieldName, nextValue)
  const fieldType = String(column?.fieldType || '').toLowerCase()

  if (component === 'Switch' || component === 'Checkbox' || fieldType === 'checkbox') {
    return (
      <label className="check-row field-control">
        <input className="custom-checkbox" type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => setValue(event.target.checked)} />
      </label>
    )
  }

  if (component === 'Textarea' || component === 'Input.TextArea' || fieldType === 'longtext') {
    return <textarea rows="4" value={value ?? ''} required={node.required || column?.isRequired} disabled={disabled} placeholder={props.placeholder} onChange={(event) => setValue(event.target.value)} />
  }

  if (component === 'Select' || fieldType === 'select') {
    const options = props.optionMode === 'dynamic'
      ? getDynamicSelectOptions(props, runtimeData, formContext?.values || {})
      : (props.options || node.enum || []).map((option) => ({
          value: getOptionValue(option),
          label: getOptionLabel(option),
        }))
    const waitingForDependency = props.optionMode === 'dynamic' && props.dependsOnField && !formContext?.values?.[props.dependsOnField]
    return (
      <AntSelect
        value={value === '' || value == null ? undefined : value}
        placeholder={waitingForDependency
          ? props.emptyDependencyPlaceholder || 'Select a parent value first'
          : props.placeholder || 'Select an option'}
        options={options}
        disabled={disabled || waitingForDependency}
        allowClear
        style={{ width: '100%' }}
        onChange={(nextValue) => setValue(nextValue ?? '')}
      />
    )
  }

  if (component === 'Reference' || fieldType === 'reference') {
    const targetTableId = Number(props.targetTableId)
    const variant = props.pickerVariant || (props.relationshipMode === 'related' ? 'table' : 'select')
    if (variant === 'table' || props.relationshipMode === 'related') {
      return (
        <ReferenceTableField
          value={value}
          onChange={setValue}
          config={{ ...props, sourceFieldName: fieldName, parentTableId: formContext?.tableId }}
          fieldName={fieldName}
          disabled={disabled}
          runtimeData={runtimeData}
          parentRecordId={formContext?.recordId}
          parentValues={formContext?.values}
        />
      )
    }
    const targetDetails = runtimeData.tableDetailsById[targetTableId]
    const displayColumn = props.displayColumnId || 'id'
    const options = (targetDetails?.records || []).map((record) => ({
      value: record.id,
      label: getDisplayValue(record, displayColumn),
    }))

    return (
      <div className="reference-select-field">
        <AntSelect
          mode="multiple"
          allowClear
          value={parseIds(value)}
          placeholder={props.placeholder || 'Select records'}
          options={options}
          disabled={disabled || !targetTableId}
          style={{ width: '100%' }}
          onChange={(nextValue) => setValue(nextValue)}
        />
        <button
          type="button"
          className="secondary"
          disabled={disabled || !targetTableId || props.referenceCreateAction !== 'navigate'}
          onClick={() => {
            if (props.referenceCreateAction === 'navigate') {
              const draftScope = createDraftScope('reference-create')
              navigateToPage(runtimeData, props.referenceCreateTargetPageId, {
                tableId: targetTableId,
                mode: 'create',
                sourceField: fieldName,
                parentTableId: formContext?.tableId,
                ...(props.referenceCreateNavigationParams || {}),
                _ncDraftScope: draftScope,
              }, {
                ...(formContext?.values || {}),
                tableId: targetTableId,
                mode: 'create',
                sourceField: fieldName,
              })
            }
          }}
        >
          Add record
        </button>
      </div>
    )
  }

  if (component === 'File' || fieldType === 'file') {
    return (
      <>
        <input
          type="file"
          required={node.required || column?.isRequired}
          disabled={disabled}
          onChange={(event) => setValue(event.target.files?.[0]?.name || '')}
        />
        {value && <small className="muted">Current: {value}</small>}
      </>
    )
  }

  const type = component === 'InputNumber' ? 'number' : component === 'DatePicker' ? 'date' : fieldType || node.type
  return (
    <input
      type={type === 'number' || type === 'finance' ? 'number' : type === 'date' ? 'date' : type === 'url' ? 'url' : 'text'}
      value={value ?? ''}
      required={node.required || column?.isRequired}
      disabled={disabled}
      step={type === 'finance' ? '0.01' : undefined}
      placeholder={props.placeholder}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

function FormBlockRenderer({ node, editorMode, selectedNodeId, onSelect, selectProps, runtimeData }) {
  const props = node['x-component-props'] || {}
  const deleteButton = getEditorDeleteButton(node, editorMode, runtimeData)
  const tableId = Number(props.tableId)
  const groupKey = getFormGroupKey(props, tableId)
  const formGroup = !editorMode && groupKey ? runtimeData.getFormGroup?.(groupKey) : null
  const tableColumns = useMemo(
    () => getTableColumns(runtimeData.tableDetailsById, tableId),
    [runtimeData.tableDetailsById, tableId],
  )
  const selectedNames = useMemo(
    () => Array.from(new Set([
      ...(Array.isArray(props.formColumns) ? props.formColumns : []),
      ...collectSchemaFieldNames(node),
    ])),
    [props.formColumns, node],
  )
  const formColumns = useMemo(
    () => tableColumns.filter((column) => selectedNames.includes(column.name)),
    [tableColumns, selectedNames],
  )
  const records = useMemo(
    () => runtimeData.tableDetailsById[tableId]?.records || [],
    [runtimeData.tableDetailsById, tableId],
  )
  const urlRecordId = getRecordIdFromLocation(props.recordIdParam)
  const recordId = Number(props.recordId || urlRecordId) || null
  const editingRecord = records.find((record) => record.id === recordId)
  const mode = props.mode === 'edit' || (props.mode === 'auto' && recordId) ? 'edit' : 'create'
  const disabled = editorMode || (mode === 'create' && props.allowCreate === false) || (mode === 'edit' && props.allowEdit === false)
  const initialValues = useMemo(() => ({
    ...createInitialFormData(formColumns, editingRecord),
    ...collectInitialFormValuesFromSchema(node, formColumns, editingRecord),
  }), [formColumns, editingRecord, node])
  const draftKey = getFormDraftKey(node, tableId, mode, recordId)
  const loadedInitialValues = useMemo(() => loadFormDraft(draftKey, initialValues), [draftKey, initialValues])
  const [values, setValues] = useState(() => loadedInitialValues)
  const [saving, setSaving] = useState(false)

  function updateValues(updater) {
    const nextValues = typeof updater === 'function' ? updater(values) : updater
    if (formGroup) {
      formGroup.mergeValues(node, nextValues)
    }
    setValues(nextValues)
  }

  useEffect(() => {
    if (!formGroup) return undefined
    return formGroup.subscribe((nextValues) => {
      setValues((current) => {
        const mergedValues = { ...current, ...nextValues }
        return areFormValuesEqual(current, mergedValues) ? current : mergedValues
      })
    })
  }, [formGroup])

  useEffect(() => {
    if (!formGroup) return
    formGroup.configure({
      schemaId: node.id,
      tableId,
      recordId,
      mode,
      allowCreate: props.allowCreate,
      columns: formColumns,
    })
    formGroup.mergeValues(node, loadedInitialValues)
  }, [formGroup, tableId, recordId, mode, props.allowCreate, formColumns, node, loadedInitialValues])

  const formContext = {
    values,
    columns: formColumns,
    tableId,
    recordId,
    mode,
    schema: node,
    disabled,
    setValue(fieldName, nextValue) {
      updateValues((current) => {
        const nextValues = { ...current, [fieldName]: nextValue }
        if (mode !== 'create') return nextValues
        return applyGeneratedValues(node, nextValues, records, {
          overwriteLocked: true,
          onlyEmptyEditable: false,
          skipField: fieldName,
        })
      })
    },
  }

  useEffect(() => {
    if (mode !== 'create') return
    queueMicrotask(() => {
      setValues((current) => {
        const nextValues = applyGeneratedValues(node, current, records)
        return areFormValuesEqual(current, nextValues) ? current : nextValues
      })
    })
  }, [mode, node, records])

  useEffect(() => {
    saveFormDraft(draftKey, values)
  }, [draftKey, values])

  async function handleSubmit(event) {
    event.preventDefault()
    if (disabled || !tableId || formColumns.length === 0) return

    const submitSnapshot = formGroup?.getSnapshot()
    const rawSubmitValues = formGroup ? { ...(submitSnapshot?.values || {}), ...values } : values
    const submitValues = mode === 'create'
      ? applyGeneratedValues(node, rawSubmitValues, records, { overwriteLocked: true, onlyEmptyEditable: true })
      : rawSubmitValues
    const submitColumns = formGroup ? submitSnapshot.columns : formColumns

    async function saveRelatedDrafts(parentId) {
      const updates = {}
      for (const column of submitColumns) {
        if (column.fieldType !== 'reference') continue
        const columnProps = parseProps(column.componentPropsJson)
        if (columnProps.relationshipMode !== 'related') continue
        const relatedValue = normalizeReferenceValue(submitValues[column.name], true)
        if (!relatedValue.drafts.length) {
          updates[column.name] = JSON.stringify(relatedValue.ids)
          continue
        }

        const targetTableId = Number(columnProps.targetTableId)
        const parentFieldName = getParentFieldName(columnProps, column.name)
        if (!targetTableId || !parentFieldName || !parentId) continue

        const createdIds = []
        for (const draft of relatedValue.drafts) {
          const created = await createRecord(targetTableId, { ...(draft || {}), [parentFieldName]: parentId })
          const createdId = Number(created?.id || created?.value?.id)
          if (createdId) createdIds.push(createdId)
        }
        updates[column.name] = JSON.stringify([...relatedValue.ids, ...createdIds])
        await runtimeData.reloadTableDetails?.(targetTableId)
      }
      return updates
    }

    const payload = submitColumns.reduce((data, column) => {
      data[column.name] = coerceFormValue(submitValues[column.name], column)
      return data
    }, {})

    let createdId = null
    setSaving(true)
    try {
      if (mode === 'edit' && recordId) {
        const relatedUpdates = await saveRelatedDrafts(recordId)
        await updateRecord(tableId, recordId, {
          ...payload,
          ...relatedUpdates,
        })
      } else {
        const created = await createRecord(tableId, payload)
        createdId = Number(created?.id || created?.value?.id)

        if (createdId) {
          const relatedUpdates = await saveRelatedDrafts(createdId)

          if (Object.keys(relatedUpdates).length) {
            await updateRecord(tableId, createdId, relatedUpdates)
          }
        }
      }

      await runtimeData.reloadTableDetails?.(tableId)
      formGroup?.clearValues()
      clearFormDraft(draftKey)
      setValues(initialValues)
      message.success('Saved')

      const savedRecordId = mode === 'edit' ? recordId : createdId
      if (props.saveAction === 'navigate' && props.saveTargetPageId) {
        navigateToPage(runtimeData, props.saveTargetPageId, {
          tableId,
          mode,
          ...(savedRecordId ? { id: savedRecordId, recordId: savedRecordId } : {}),
          ...(props.saveNavigationParams || {}),
        }, {
          ...(formContext?.values || {}),
          ...(savedRecordId ? { id: savedRecordId, recordId: savedRecordId } : {}),
          tableId,
          mode,
        })
      } else if (props.saveAction === 'back') {
        runtimeData.onNavigateBack?.()
      }
    } catch (err) {
      const errorMessage =
        err?.response?.data?.message ??
        err?.message ??
        'Failed to save'

      const requiredField =
        errorMessage.match(/Column '(.*?)' is required/)?.[1]

      message.error(
        requiredField
          ? `${requiredField} is required`
          : errorMessage
      )
    } finally {
      setSaving(false)
    }
  }

  const customChildren = Object.values(node.properties || {})
  const content = customChildren.map((child) => renderNode(child, editorMode, selectedNodeId, onSelect, runtimeData, formContext))

  return (
    <form key={node.id} {...selectProps} className={`${selectProps.className || ''} rendered-block form-block`} onSubmit={handleSubmit}>
      {deleteButton}
      <h2>{node.title || 'Form'}</h2>
      {!props.tableId && <p className="muted">Select a table in block settings.</p>}
      <div className="form-block-custom-layout">{content}</div>
      {(!props.useFormGroup || props.showGroupSubmit !== false) && (
        <div className="form-actions">
          <button type="submit" disabled={disabled || saving || !tableId || formColumns.length === 0}>{saving ? 'Saving...' : props.submitLabel || 'Save'}</button>
        </div>
      )}
    </form>
  )
}

export function renderNode(node, editorMode, selectedNodeId, onSelect, runtimeData, formContext = null) {
  const component = node['x-component'] || 'Text'
  const props = node['x-component-props'] || {}
  const children = Object.values(node.properties || {}).map((child) => renderNode(child, editorMode, selectedNodeId, onSelect, runtimeData, formContext))
  const dragState = runtimeData?.dragState
  const dropActive = dragState?.dropTarget?.nodeId === node.id ? ` drop-${dragState.dropTarget.position}` : ''
  const isDragging = dragState?.draggedNodeId === node.id ? ' dragging' : ''
  const isHovered = runtimeData?.hoveredNodeId === node.id
  const className = editorMode
    ? `page-node${selectedNodeId === node.id ? ' selected' : ''}${isHovered ? ' hovered' : ''}${dropActive}${isDragging}`
    : ''
  const selectProps = editorMode
    ? {
        className,
        draggable: node.id !== runtimeData?.rootNodeId,
        onMouseEnter: (event) => {
          event.stopPropagation()
          runtimeData?.setHoveredNodeId?.(node.id)
        },
        onMouseLeave: (event) => {
          event.stopPropagation()
          runtimeData?.setHoveredNodeId?.((current) => (current === node.id ? null : current))
        },
        onClick: (event) => {
          event.stopPropagation()
          onSelect(node.id)
        },
        onDragStart: (event) => {
          if (node.id === runtimeData?.rootNodeId) {
            event.preventDefault()
            return
          }
          event.stopPropagation()
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', node.id)
          runtimeData?.setDragState?.({ draggedNodeId: node.id, dropTarget: null })
        },
        onDragOver: (event) => {
          autoScrollForPointer(event)
          const draggedNodeId = dragState?.draggedNodeId || event.dataTransfer.getData('text/plain')
          if (!draggedNodeId || draggedNodeId === node.id) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          const position = getDropPosition(event, node)
          if (dragState?.dropTarget?.nodeId !== node.id || dragState?.dropTarget?.position !== position) {
            runtimeData?.setDragState?.({ draggedNodeId, dropTarget: { nodeId: node.id, position } })
          }
        },
        onDragLeave: (event) => {
          event.stopPropagation()
          if (!event.currentTarget.contains(event.relatedTarget)) {
            runtimeData?.setDragState?.((current) => current?.dropTarget?.nodeId === node.id
              ? { ...current, dropTarget: null }
              : current)
          }
        },
        onDrop: (event) => {
          const draggedNodeId = dragState?.draggedNodeId || event.dataTransfer.getData('text/plain')
          if (!draggedNodeId || draggedNodeId === node.id) return
          event.preventDefault()
          event.stopPropagation()
          runtimeData?.onNodeDrop?.({ nodeId: node.id, position: getDropPosition(event, node) })
        },
        onDragEnd: (event) => {
          event.stopPropagation()
          runtimeData?.setDragState?.(null)
        },
      }
    : {}
  const deleteButton = getEditorDeleteButton(node, editorMode, runtimeData)

  if (!shouldRenderNode(node, editorMode, formContext)) return null

  if (component === 'Container') return <div key={node.id} {...selectProps} className={`${selectProps.className || ''} page-container`}>{deleteButton}{children}</div>
  if (component === 'Grid.Row') {
    return (
      <AntRow
        key={node.id}
        {...selectProps}
        className={`${selectProps.className || ''} page-grid-row`}
        gutter={normalizeGutter(props.gutter)}
        align={props.align || 'top'}
        justify={props.justify || 'start'}
        wrap={props.wrap !== false}
      >
        {deleteButton}
        {children}
      </AntRow>
    )
  }
  if (component === 'Grid.Col') {
    return (
      <AntCol key={node.id} {...selectProps} className={`${selectProps.className || ''} page-grid-col`} {...getColProps(props)}>
        {deleteButton}
        {children}
      </AntCol>
    )
  }
  if (component === 'Section') {
    return (
      <div key={node.id} {...selectProps} className={`${selectProps.className || ''} page-section-collapse`}>
        {deleteButton}
        <Collapse
          defaultActiveKey={[node.id]}
          items={[
            {
              key: node.id,
              label: node.title || 'Section',
              children,
            },
          ]}
        />
      </div>
    )
  }
  if (component === 'Tabs') {
    const tabItems = Object.values(node.properties || {}).map((child) => ({
      key: child.id,
      label: child.title || child.name,
      children: renderNode(child, editorMode, selectedNodeId, onSelect, runtimeData, formContext),
    }))
    return (
      <div key={node.id} {...selectProps} className={`${selectProps.className || ''} page-tabs`}>
        {deleteButton}
        <AntTabs tabPlacement={props.tabPlacement || 'top'} items={tabItems} />
      </div>
    )
  }
  if (component === 'Divider') return <div key={node.id} {...selectProps}>{deleteButton}<AntDivider titlePlacement={props.titlePlacement || 'left'}>{props.text || node.title}</AntDivider></div>
  if (component === 'Heading') return <h2 key={node.id} {...selectProps}>{deleteButton}{props.text || node.title}</h2>
  if (component === 'Text') return <p key={node.id} {...selectProps}>{deleteButton}{props.text || node.title}</p>
  if (component === 'Button') {
    function handleButtonClick(event) {
      selectProps.onClick?.(event)
      if (editorMode || props.action !== 'navigate') return
      navigateToPage(runtimeData, props.targetPageId, props.navigationParams, formContext?.values || {})
    }
    if (editorMode) {
      return (
        <div key={node.id} {...selectProps} className={`${selectProps.className || ''} page-button-node`}>
          {deleteButton}
          <button type="button">{props.text || node.title}</button>
        </div>
      )
    }
    return <button key={node.id} type="button" {...selectProps} onClick={handleButtonClick}>{props.text || node.title}</button>
  }
  if (['Input', 'InputNumber', 'Input.TextArea', 'Textarea', 'Select', 'Checkbox', 'Switch', 'DatePicker', 'File'].includes(component) && formContext) {
    const fieldName = node['x-field'] || node.name
    const column = getColumnByFieldName(formContext.columns || getTableColumns(runtimeData.tableDetailsById, formContext.tableId), fieldName)
    const required = Boolean(node.required || column?.isRequired)
    if (component === 'Checkbox' || component === 'Switch') {
      return (
        <div
          key={node.id}
          {...selectProps}
          className={`${selectProps.className || ''} check-row`}
        >
          {deleteButton}
          <FieldInput node={node} column={column} formContext={formContext} runtimeData={runtimeData} />
          {node.title && <span className="field-label"><RequiredLabel required={required}>{node.title}</RequiredLabel></span>}
        </div>
      )
    }
    return renderFieldNode({
      node,
      editorMode,
      selectProps,
      deleteButton,
      children: (
        <>
          <RequiredLabel required={required}>{node.title}</RequiredLabel>
          <FieldInput node={node} column={column} formContext={formContext} runtimeData={runtimeData} />
        </>
      ),
    })
  }
  if (component === 'Input') return renderFieldNode({ node, editorMode, selectProps, deleteButton, children: <><RequiredLabel required={node.required}>{node.title}</RequiredLabel><input placeholder={props.placeholder} /></> })
  if (component === 'InputNumber') return renderFieldNode({ node, editorMode, selectProps, deleteButton, children: <><RequiredLabel required={node.required}>{node.title}</RequiredLabel><input type="number" placeholder={props.placeholder} /></> })
  if (component === 'Textarea' || component === 'Input.TextArea') return renderFieldNode({ node, editorMode, selectProps, deleteButton, children: <><RequiredLabel required={node.required}>{node.title}</RequiredLabel><textarea rows="4" placeholder={props.placeholder} /></> })
  if (component === 'Select') {
    const options = props.optionMode === 'dynamic'
      ? getDynamicSelectOptions(props, runtimeData)
      : (node.enum || props.options || []).map((option) => ({ value: getOptionValue(option), label: getOptionLabel(option) }))
    return renderFieldNode({
      node,
      editorMode,
      selectProps,
      deleteButton,
      children: (
        <>
          <RequiredLabel required={node.required}>{node.title}</RequiredLabel>
          <AntSelect
            placeholder={props.placeholder || 'Select'}
            options={options}
            allowClear
            style={{ width: '100%' }}
          />
        </>
      ),
    })
  }
  if (component === 'Checkbox') return renderFieldNode({ node, editorMode, selectProps, deleteButton, className: 'check-row', children: <><input type="checkbox" /><RequiredLabel required={node.required}>{node.title}</RequiredLabel></> })
  if (component === 'Switch') return renderFieldNode({ node, editorMode, selectProps, deleteButton, className: 'check-row', children: <><input className="custom-checkbox" type="checkbox" /><RequiredLabel required={node.required}>{node.title}</RequiredLabel></> })
  if (component === 'DatePicker') return renderFieldNode({ node, editorMode, selectProps, deleteButton, children: <><RequiredLabel required={node.required}>{node.title}</RequiredLabel><input type="date" /></> })
  if (component === 'File') return renderFieldNode({ node, editorMode, selectProps, deleteButton, children: <><RequiredLabel required={node.required}>{node.title}</RequiredLabel><input type="file" /></> })
  if (component === 'Reference') {
    if (formContext) {
      const fieldName = node['x-field'] || node.name
      const column = getColumnByFieldName(formContext.columns || getTableColumns(runtimeData.tableDetailsById, formContext.tableId), fieldName)
      return renderFieldNode({
        node,
        editorMode,
        selectProps,
        deleteButton,
        children: (
          <>
            <RequiredLabel required={node.required || column?.isRequired}>{node.title}</RequiredLabel>
            <FieldInput node={node} column={column} formContext={formContext} runtimeData={runtimeData} />
          </>
        ),
      })
    }
    const targetTable = runtimeData.tables?.find((table) => table.id === Number(props.targetTableId))
    const targetDetails = runtimeData.tableDetailsById[props.targetTableId]
    const displayColumn = props.displayColumnId || 'id'
    const referenceOptions = (targetDetails?.records || []).map((record) => ({
      value: record.id,
      label: getDisplayValue(record, displayColumn),
    }))
    return renderFieldNode({
      node,
      editorMode,
      selectProps,
      deleteButton,
      children: (
        <>
          <RequiredLabel required={node.required}>{node.title}</RequiredLabel>
          <AntSelect
            mode="multiple"
            allowClear
            placeholder={targetTable ? props.placeholder || `Select ${targetTable.name}` : 'Select target table first'}
            options={referenceOptions}
            disabled={!targetTable}
            style={{ width: '100%' }}
          />
        </>
      ),
    })
  }
  if (component === 'FormBlock') {
    const formKey = [
      node.id,
      props.tableId || '',
      props.recordId || getRecordIdFromLocation(props.recordIdParam) || '',
      Array.isArray(props.formColumns) ? props.formColumns.join('|') : '',
      runtimeData.tableDetailsById[props.tableId]?.columns?.length || 0,
      runtimeData.navigationSearch || '',
    ].join(':')
    return <FormBlockRenderer key={formKey} node={node} editorMode={editorMode} selectedNodeId={selectedNodeId} onSelect={onSelect} selectProps={selectProps} runtimeData={runtimeData} />
  }
  if (component === 'TableBlock') {
    return <TableBlockRenderer key={node.id} node={node} editorMode={editorMode} selectProps={selectProps} runtimeData={runtimeData} />
  }
  return <div key={node.id} {...selectProps}>{deleteButton}{children}</div>
}
