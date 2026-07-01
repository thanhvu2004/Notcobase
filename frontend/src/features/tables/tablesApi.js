import { api } from '../../shared/api/client'

export function fetchTables() {
  return api('/tables')
}

export async function fetchTableDetails(tableId) {
  const [columns, records] = await Promise.all([
    api(`/tables/${tableId}/columns`),
    api(`/tables/${tableId}/records`),
  ])

  return { columns, records }
}

export function createTable(payload) {
  return api('/tables', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateTable(tableId, payload) {
  return api(`/tables/${tableId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteTable(tableId) {
  return api(`/tables/${tableId}`, { method: 'DELETE' })
}

export function createColumn(tableId, payload) {
  return api(`/tables/${tableId}/columns`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateColumn(tableId, columnId, payload) {
  return api(`/tables/${tableId}/columns/${columnId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteColumn(tableId, columnId) {
  return api(`/tables/${tableId}/columns/${columnId}`, { method: 'DELETE' })
}

export function reorderColumns(tableId, columnIds) {
  return api(`/tables/${tableId}/columns/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ columnIds }),
  })
}

export function createRecord(tableId, data) {
  return api(`/tables/${tableId}/records`, {
    method: 'POST',
    body: JSON.stringify({ data }),
  })
}

export function updateRecord(tableId, recordId, data) {
  return api(`/tables/${tableId}/records/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify({ data }),
  })
}

export function deleteRecord(tableId, recordId) {
  return api(`/tables/${tableId}/records/${recordId}`, { method: 'DELETE' })
}
