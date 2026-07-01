/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react'
import { Collapse, Col as AntCol, Divider as AntDivider, Row as AntRow, Select as AntSelect, Tabs as AntTabs, message } from 'antd'
import { createRecord, updateRecord } from '../../tables/tablesApi'
import {
  areFormValuesEqual,
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

function collectSchemaFieldNames(node, names = new Set()) {
  if (!node || typeof node !== 'object') return names
  const fieldName = node['x-field'] || node.name
  if (fieldName && ['Input', 'InputNumber', 'Input.TextArea', 'Textarea', 'Select', 'Checkbox', 'Switch', 'DatePicker', 'File', 'Reference'].includes(node['x-component'])) {
    names.add(fieldName)
  }
  Object.values(node.properties || {}).forEach((child) => collectSchemaFieldNames(child, names))
  return names
}

function ReferenceTableField({ value, onChange, config, fieldName, disabled, runtimeData, parentRecordId }) {
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
    setEditingRecord(null)
    setDraft({})
    setModalOpen(true)
  }

  function openEdit(record) {
    setEditingRecord(record)
    setDraft({ ...(record.data || {}) })
    setModalOpen(true)
  }

  async function saveReferenceRecord() {
    if (!targetTableId) return

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
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModalOpen(false)}>
          <section className="modal-panel reference-modal-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h2>{editingRecord ? 'Edit referenced record' : 'Create referenced record'}</h2>
              <button type="button" className="secondary icon-button" onClick={() => setModalOpen(false)} aria-label="Close">x</button>
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
              <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="button" onClick={saveReferenceRecord}>Save</button>
            </footer>
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
  const disabled = props.disabled || formContext?.disabled
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
      : (node.enum || props.options || []).map((option) => ({
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
  const records = runtimeData.tableDetailsById[tableId]?.records || []
  const urlRecordId = getRecordIdFromLocation(props.recordIdParam)
  const recordId = Number(props.recordId || urlRecordId) || null
  const editingRecord = records.find((record) => record.id === recordId)
  const mode = props.mode === 'edit' || (props.mode === 'auto' && recordId) ? 'edit' : 'create'
  const disabled = editorMode || (mode === 'create' && props.allowCreate === false) || (mode === 'edit' && props.allowEdit === false)
  const initialValues = useMemo(() => ({
    ...createInitialFormData(formColumns, editingRecord),
    ...collectInitialFormValuesFromSchema(node, formColumns, editingRecord),
  }), [formColumns, editingRecord, node])
  const [values, setValues] = useState(() => initialValues)
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
    formGroup.mergeValues(node, initialValues)
  }, [formGroup, tableId, recordId, mode, props.allowCreate, formColumns, node, initialValues])

  const formContext = {
    values,
    columns: formColumns,
    tableId,
    recordId,
    schema: node,
    disabled,
    setValue(fieldName, nextValue) {
      updateValues((current) => ({ ...current, [fieldName]: nextValue }))
    },
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (disabled || !tableId || formColumns.length === 0) return

    const submitSnapshot = formGroup?.getSnapshot()
    const submitValues = formGroup ? { ...(submitSnapshot?.values || {}), ...values } : values
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
        const createdId = Number(created?.id || created?.value?.id)

        if (createdId) {
          const relatedUpdates = await saveRelatedDrafts(createdId)

          if (Object.keys(relatedUpdates).length) {
            await updateRecord(tableId, createdId, relatedUpdates)
          }
        }
      }

      await runtimeData.reloadTableDetails?.(tableId)
      formGroup?.clearValues()
      message.success('Saved')
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
  const className = editorMode && selectedNodeId === node.id ? `page-node selected${dropActive}${isDragging}` : editorMode ? `page-node${dropActive}${isDragging}` : ''
  const selectProps = editorMode
    ? {
        className,
        draggable: node.id !== runtimeData?.rootNodeId,
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

  if (!shouldRenderNode(node, editorMode, formContext)) return null

  if (component === 'Container') return <div key={node.id} {...selectProps} className={`${selectProps.className || ''} page-container`}>{children}</div>
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
        {children}
      </AntRow>
    )
  }
  if (component === 'Grid.Col') {
    return (
      <AntCol key={node.id} {...selectProps} className={`${selectProps.className || ''} page-grid-col`} {...getColProps(props)}>
        {children}
      </AntCol>
    )
  }
  if (component === 'Section') {
    return (
      <div key={node.id} {...selectProps} className={`${selectProps.className || ''} page-section-collapse`}>
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
        <AntTabs tabPlacement={props.tabPlacement || 'top'} items={tabItems} />
      </div>
    )
  }
  if (component === 'Divider') return <div key={node.id} {...selectProps}><AntDivider titlePlacement={props.titlePlacement || 'left'}>{props.text || node.title}</AntDivider></div>
  if (component === 'Heading') return <h2 key={node.id} {...selectProps}>{props.text || node.title}</h2>
  if (component === 'Text') return <p key={node.id} {...selectProps}>{props.text || node.title}</p>
  if (component === 'Button') {
    function handleButtonClick(event) {
      selectProps.onClick?.(event)
      if (editorMode || props.action !== 'navigate') return
      navigateToPage(runtimeData, props.targetPageId, props.navigationParams, formContext?.values || {})
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
          <FieldInput node={node} column={column} formContext={formContext} runtimeData={runtimeData} />
          {node.title && <span className="field-label"><RequiredLabel required={required}>{node.title}</RequiredLabel></span>}
        </div>
      )
    }
    return <label key={node.id} {...selectProps}><RequiredLabel required={required}>{node.title}</RequiredLabel><FieldInput node={node} column={column} formContext={formContext} runtimeData={runtimeData} /></label>
  }
  if (component === 'Input') return <label key={node.id} {...selectProps}><RequiredLabel required={node.required}>{node.title}</RequiredLabel><input placeholder={props.placeholder} /></label>
  if (component === 'InputNumber') return <label key={node.id} {...selectProps}><RequiredLabel required={node.required}>{node.title}</RequiredLabel><input type="number" placeholder={props.placeholder} /></label>
  if (component === 'Textarea' || component === 'Input.TextArea') return <label key={node.id} {...selectProps}><RequiredLabel required={node.required}>{node.title}</RequiredLabel><textarea rows="4" placeholder={props.placeholder} /></label>
  if (component === 'Select') {
    const options = props.optionMode === 'dynamic'
      ? getDynamicSelectOptions(props, runtimeData)
      : (node.enum || props.options || []).map((option) => ({ value: getOptionValue(option), label: getOptionLabel(option) }))
    return (
      <label key={node.id} {...selectProps}>
        <RequiredLabel required={node.required}>{node.title}</RequiredLabel>
        <AntSelect
          placeholder={props.placeholder || 'Select'}
          options={options}
          allowClear
          style={{ width: '100%' }}
        />
      </label>
    )
  }
  if (component === 'Checkbox') return <label key={node.id} {...selectProps} className={`${selectProps.className || ''} check-row`}><input type="checkbox" /><RequiredLabel required={node.required}>{node.title}</RequiredLabel></label>
  if (component === 'Switch') return <label key={node.id} {...selectProps} className={`${selectProps.className || ''} check-row`}><input className="custom-checkbox" type="checkbox" /><RequiredLabel required={node.required}>{node.title}</RequiredLabel></label>
  if (component === 'DatePicker') return <label key={node.id} {...selectProps}><RequiredLabel required={node.required}>{node.title}</RequiredLabel><input type="date" /></label>
  if (component === 'File') return <label key={node.id} {...selectProps}><RequiredLabel required={node.required}>{node.title}</RequiredLabel><input type="file" /></label>
  if (component === 'Reference') {
    if (formContext) {
      const fieldName = node['x-field'] || node.name
      const column = getColumnByFieldName(formContext.columns || getTableColumns(runtimeData.tableDetailsById, formContext.tableId), fieldName)
      return <label key={node.id} {...selectProps}><RequiredLabel required={node.required || column?.isRequired}>{node.title}</RequiredLabel><FieldInput node={node} column={column} formContext={formContext} runtimeData={runtimeData} /></label>
    }
    const targetTable = runtimeData.tables?.find((table) => table.id === Number(props.targetTableId))
    const targetDetails = runtimeData.tableDetailsById[props.targetTableId]
    const displayColumn = props.displayColumnId || 'id'
    const referenceOptions = (targetDetails?.records || []).map((record) => ({
      value: record.id,
      label: getDisplayValue(record, displayColumn),
    }))
    return (
      <label key={node.id} {...selectProps}>
        <RequiredLabel required={node.required}>{node.title}</RequiredLabel>
        <AntSelect
          mode="multiple"
          allowClear
          placeholder={targetTable ? props.placeholder || `Select ${targetTable.name}` : 'Select target table first'}
          options={referenceOptions}
          disabled={!targetTable}
          style={{ width: '100%' }}
        />
      </label>
    )
  }
  if (component === 'FormBlock') {
    const formKey = [
      node.id,
      props.tableId || '',
      props.recordId || getRecordIdFromLocation(props.recordIdParam) || '',
      Array.isArray(props.formColumns) ? props.formColumns.join('|') : '',
      runtimeData.tableDetailsById[props.tableId]?.columns?.length || 0,
    ].join(':')
    return <FormBlockRenderer key={formKey} node={node} editorMode={editorMode} selectedNodeId={selectedNodeId} onSelect={onSelect} selectProps={selectProps} runtimeData={runtimeData} />
  }
  if (component === 'TableBlock') {
    const tableColumns = getTableColumns(runtimeData.tableDetailsById, props.tableId)
    const selectedColumns = Array.isArray(props.columns)
      ? tableColumns.filter((column) => props.columns.some((item) => (typeof item === 'string' ? item : item.dataIndex) === column.name))
      : tableColumns
    const records = runtimeData.tableDetailsById[props.tableId]?.records || []
    function openCreate() {
      if (editorMode) return
      if (props.createAction === 'navigate') {
        navigateToPage(runtimeData, props.createTargetPageId, {
          tableId: props.tableId,
          mode: 'create',
          ...(props.createNavigationParams || {}),
        }, { tableId: props.tableId, mode: 'create' })
      }
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

    return (
      <div key={node.id} {...selectProps} className={`${selectProps.className || ''} rendered-block`}>
        <div className="rendered-block-header">
          <h2>{node.title || 'Records'}</h2>
          {props.allowCreate !== false && <button type="button" onClick={openCreate}>New</button>}
        </div>
        {!props.tableId ? <p className="muted">Select a table in block settings.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {selectedColumns.map((column) => <th key={column.id}>{column.name}</th>)}
                  {(props.allowEdit !== false || props.allowDelete) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {records.slice(0, props.pageSize || 10).map((record) => (
                  <tr key={record.id} className={!editorMode && props.rowClickAction === 'navigate' ? 'clickable-row' : ''} onClick={() => openRow(record)}>
                    {selectedColumns.map((column) => <td key={column.id}>{formatValue(record.data?.[column.name], column.fieldType, column.componentPropsJson, runtimeData)}</td>)}
                    {(props.allowEdit !== false || props.allowDelete) && (
                      <td onClick={(event) => event.stopPropagation()}>
                        {props.allowEdit !== false && <button type="button" className="secondary" onClick={() => openEdit(record)}>Edit</button>} {props.allowDelete && <button type="button" className="danger">Delete</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }
  return <div key={node.id} {...selectProps}>{children}</div>
}
