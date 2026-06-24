import { addFieldValueAliases } from './dataUtils'

export const formGroupCoordinators = new Map()

export function getFormGroupKey(config, tableId) {
  if (!config.useFormGroup) return ''
  const explicitKey = String(config.formGroupKey || '').trim()
  if (explicitKey) return explicitKey
  return tableId ? `table:${tableId}` : ''
}

export function createFormGroupCoordinator() {
  const columnsBySchema = new Map()
  const listeners = new Set()
  let values = {}
  let tableId = null
  let recordId = null
  let mode = 'auto'
  let allowCreate = true

  function notify() {
    listeners.forEach((listener) => listener(values))
  }

  return {
    configure(config) {
      tableId = config.tableId ?? tableId
      recordId = config.recordId ?? recordId
      mode = config.mode || mode
      allowCreate = allowCreate !== false && config.allowCreate !== false
      if (config.schemaId) {
        columnsBySchema.set(config.schemaId, config.columns || [])
      }
    },
    getSnapshot() {
      const columns = new Map()
      columnsBySchema.forEach((schemaColumns) => {
        schemaColumns.forEach((column) => columns.set(column.name, column))
      })
      return {
        values,
        tableId,
        recordId,
        mode,
        allowCreate,
        columns: Array.from(columns.values()),
      }
    },
    mergeValues(schema, nextValues) {
      const nextMergedValues = addFieldValueAliases(schema, { ...values, ...(nextValues || {}) })
      const changed = Object.keys(nextMergedValues).some((key) => nextMergedValues[key] !== values[key]) ||
        Object.keys(values).some((key) => !(key in nextMergedValues))
      if (!changed) return values
      values = nextMergedValues
      notify()
      return values
    },
    clearValues() {
      values = {}
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
