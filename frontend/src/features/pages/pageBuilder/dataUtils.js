import { blockComponents, fieldComponents } from './constants'

export function isHiddenColumn(column) {
  const props = parseProps(column?.componentPropsJson)
  return props.hiddenInForms === true || props.type === 'parent-link'
}

export function parseProps(source) {
  if (!source) return {}
  if (typeof source === 'object') return source
  try {
    return JSON.parse(source)
  } catch {
    return {}
  }
}

export function parseIds(value) {
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

export function getVisibleColumns(columns) {
  return (columns || []).filter((column) => !isHiddenColumn(column))
}

export function getTableColumns(tableDetailsById, tableId) {
  return getVisibleColumns(tableDetailsById[tableId]?.columns || [])
}

export function formatValue(value, fieldType, componentPropsJson, runtimeData) {
  if (fieldType === 'checkbox') return value === true || value === 'true' || value === '1' ? 'Yes' : 'No'
  if (fieldType === 'reference') {
    const props = parseProps(componentPropsJson)
    const ids = parseIds(value)
    const records = runtimeData?.tableDetailsById?.[props.targetTableId]?.records || []
    return ids
      .map((id) => {
        const record = records.find((item) => item.id === id)
        return record ? getDisplayValue(record, props.displayColumnId || 'id') : `#${id}`
      })
      .join(', ')
  }
  if (value == null) return ''
  return String(value)
}

export function getColumnByFieldName(columns, fieldName) {
  return columns.find((column) => column.name === fieldName)
}

export function getInitialValue(column, record) {
  if (record) {
    const value = record.data?.[column.name]
    return column.fieldType === 'reference' ? parseIds(value) : value ?? ''
  }

  const props = parseProps(column.componentPropsJson)
  if (column.fieldType === 'checkbox') return false
  if (column.fieldType === 'reference') return parseIds(props.defaultValue)
  if (column.fieldType === 'select') return props.defaultValue ?? ''
  if (column.fieldType === 'file') return props.defaultValue ?? ''
  return ''
}

export function createInitialFormData(columns, record) {
  return columns.reduce((values, column) => {
    values[column.name] = getInitialValue(column, record)
    return values
  }, {})
}

export function areFormValuesEqual(left = {}, right = {}) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key])
}

export function getInitialValueFromSchemaNode(node, column, record) {
  const props = { ...parseProps(column?.componentPropsJson), ...(node?.['x-component-props'] || {}) }
  const fieldType = String(column?.fieldType || '').toLowerCase()
  const component = node?.['x-component']
  const fieldName = node?.['x-field'] || node?.name

  if (record && fieldName) {
    const value = record.data?.[fieldName]
    return fieldType === 'reference' || component === 'Reference' ? parseIds(value) : value
  }

  if (props.defaultValue !== undefined) return props.defaultValue
  if (node?.default !== undefined) return node.default
  if (fieldType === 'checkbox' || component === 'Checkbox' || component === 'Switch') return false
  if (fieldType === 'reference' || component === 'Reference') return []
  return ''
}

export function collectInitialFormValuesFromSchema(node, columns, record, values = {}) {
  if (!node || typeof node !== 'object') return values

  const component = node['x-component']
  const fieldName = node['x-field'] || node.name
  if (fieldName && fieldComponents.includes(component)) {
    const column = getColumnByFieldName(columns || [], fieldName)
    if (values[fieldName] === undefined) {
      values[fieldName] = getInitialValueFromSchemaNode(node, column, record)
    }
  }

  Object.values(node.properties || {}).forEach((child) => collectInitialFormValuesFromSchema(child, columns, record, values))
  return values
}

export function coerceFormValue(value, column) {
  if (column.fieldType === 'number' || column.fieldType === 'finance') {
    return value === '' || value == null ? null : Number(value)
  }
  if (column.fieldType === 'checkbox') return Boolean(value)
  if (column.fieldType === 'reference') {
    const props = parseProps(column.componentPropsJson)
    return JSON.stringify(normalizeReferenceValue(value, props.relationshipMode === 'related').ids)
  }
  if (column.fieldType === 'file') return value || ''
  return value
}

export function getFieldComponentForColumn(column) {
  const type = String(column?.fieldType || 'text').toLowerCase()
  if (type === 'longtext') return 'Input.TextArea'
  if (type === 'number' || type === 'finance') return 'InputNumber'
  if (type === 'date') return 'DatePicker'
  if (type === 'checkbox') return 'Switch'
  if (type === 'select') return 'Select'
  if (type === 'reference') return 'Reference'
  if (type === 'file') return 'File'
  return 'Input'
}

export function getOptionValue(option) {
  return typeof option === 'object' ? option.value : option
}

export function getOptionLabel(option) {
  return typeof option === 'object' ? option.label : option
}

export function normalizeNavigationParams(params) {
  if (!params) return {}
  if (typeof params === 'string') {
    try {
      const parsed = JSON.parse(params)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof params === 'object' && !Array.isArray(params) ? params : {}
}

export function resolveNavigationValue(value, data = {}) {
  if (typeof value !== 'string') return value
  const exactMatch = value.match(/^\{([^}]+)\}$/)
  if (exactMatch) return data[exactMatch[1]] ?? ''
  return value.replace(/\{([^}]+)\}/g, (_, key) => data[key] ?? '')
}

export function resolveNavigationParams(params, data = {}) {
  return Object.fromEntries(
    Object.entries(normalizeNavigationParams(params))
      .map(([key, value]) => [key, resolveNavigationValue(value, data)])
      .filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}

export function navigateToPage(runtimeData, targetPageId, params, data) {
  return runtimeData.onNavigate?.({
    targetPageId,
    params: resolveNavigationParams(params, data),
  })
}

export function getRecordColumnValue(record, columnName) {
  return columnName === 'id' ? record.id : record.data?.[columnName]
}

export function getDisplayValue(record, displayColumn) {
  const value = getRecordColumnValue(record, displayColumn || 'id')
  return value == null || value === '' ? `#${record.id}` : String(value)
}

export function getDynamicSelectOptions(props, runtimeData, formValues = {}) {
  const sourceTableId = Number(props.sourceTableId)
  if (!sourceTableId) return []

  const sourceRecords = runtimeData.tableDetailsById[sourceTableId]?.records || []
  const dependsOnField = props.dependsOnField || ''
  const filterField = props.filterField || ''
  const parentValue = dependsOnField ? formValues[dependsOnField] : null
  const parentIds = parseIds(parentValue)

  return sourceRecords
    .filter((record) => {
      if (!dependsOnField || !filterField) return true
      const filterValue = getRecordColumnValue(record, filterField)
      const filterIds = parseIds(filterValue)
      if (parentIds.length) return filterIds.some((id) => parentIds.includes(id)) || parentIds.includes(Number(filterValue))
      return String(filterValue ?? '') === String(parentValue ?? '')
    })
    .map((record) => ({
      value: getRecordColumnValue(record, props.valueColumn || 'id') ?? record.id,
      label: getDisplayValue(record, props.displayColumn || 'id'),
    }))
}

export function getColumnOptions(tableDetails) {
  return [
    { value: 'id', label: 'Record ID (id)' },
    ...getVisibleColumns(tableDetails?.columns || []).map((column) => ({
      value: column.name,
      label: `${column.name} (${column.fieldType || 'text'})`,
    })),
  ]
}

export function normalizeReferenceValue(value, related) {
  if (related && value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      ids: parseIds(value.ids),
      drafts: Array.isArray(value.drafts) ? value.drafts : [],
    }
  }
  return { ids: parseIds(value), drafts: [] }
}

export function getReferenceMode(config) {
  return config.relationshipMode === 'related' ? 'related' : 'lookup'
}

export function getParentFieldName(config, fallbackFieldName) {
  return String(config.parentFieldName || config.sourceFieldName || fallbackFieldName || '').trim()
}

export function getRecordDisplayColumns(tableDetails, displayColumnId) {
  const visibleColumns = getVisibleColumns(tableDetails?.columns || [])
  const displayColumn = displayColumnId && displayColumnId !== 'id'
    ? visibleColumns.find((column) => String(column.id) === String(displayColumnId) || column.name === displayColumnId)
    : null
  return {
    visibleColumns,
    displayColumnName: displayColumn?.name || 'id',
  }
}

export function addFieldValueAliases(schema, values) {
  const nextValues = { ...(values || {}) }
  function visit(node, key) {
    if (!node || typeof node !== 'object') return
    const fieldName = node['x-field'] || node.name || key
    if (fieldName && nextValues[fieldName] === undefined && nextValues[node.name] !== undefined) {
      nextValues[fieldName] = nextValues[node.name]
    }
    Object.entries(node.properties || {}).forEach(([childKey, child]) => visit(child, childKey))
  }
  visit(schema, schema?.name || 'root')
  return nextValues
}

export function evaluateVisibleWhen(rule, values) {
  if (!rule?.field) return true
  const currentValue = values?.[rule.field]
  const expectedValue = rule.value
  if (rule.operator === '!=') return String(currentValue ?? '') !== String(expectedValue ?? '')
  if (rule.operator === 'contains') {
    if (Array.isArray(currentValue)) return currentValue.map(String).includes(String(expectedValue ?? ''))
    return String(currentValue ?? '').includes(String(expectedValue ?? ''))
  }
  return String(currentValue ?? '') === String(expectedValue ?? '')
}

export function shouldRenderNode(node, editorMode, formContext) {
  const props = node?.['x-component-props'] || {}
  if (!node || node['x-hidden'] || props.hiddenInForms === true || props.type === 'parent-link') return false
  if (editorMode || !props.visibleWhen) return true
  return evaluateVisibleWhen(props.visibleWhen, addFieldValueAliases(formContext?.schema || {}, formContext?.values || {}))
}

export function collectFieldOptions(schema, selectedNodeId) {
  const options = []
  function visit(node, key) {
    if (!node || typeof node !== 'object') return
    const props = node['x-component-props'] || {}
    if (node.id !== selectedNodeId && !node['x-hidden'] && props.hiddenInForms !== true) {
      const component = node['x-component']
      const fieldName = node['x-field'] || node.name || key
      const isBlock = blockComponents.includes(component)
      const isContainer = ['Container', 'Section', 'Grid.Row', 'Grid.Col', 'Tabs'].includes(component)
      if (fieldName && !isBlock && !isContainer) {
        options.push({ value: fieldName, label: `${node.title || fieldName} (${fieldName})` })
      }
    }
    Object.entries(node.properties || {}).forEach(([childKey, child]) => visit(child, childKey))
  }
  visit(schema, schema?.name || 'root')
  return options
}

export function getRecordIdFromLocation(paramName) {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get(paramName || 'id')
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}
