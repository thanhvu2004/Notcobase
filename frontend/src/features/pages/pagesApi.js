import { api } from '../../shared/api/client'

function createId(prefix = 'node') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultPageSchema(name) {
  return {
    type: 'object',
    id: createId('page'),
    name: name.replace(/[^a-zA-Z0-9]+/g, '') || 'NewPage',
    title: name,
    'x-component': 'Container',
    'x-component-props': { layout: 'vertical' },
    properties: {},
  }
}

export function fetchPages() {
  return api('/lowcode-pages')
}

export function fetchPage(pageId) {
  return api(`/lowcode-pages/${pageId}`)
}

export function createPage(payload) {
  return api('/lowcode-pages', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updatePage(pageId, payload) {
  return api(`/lowcode-pages/${pageId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deletePage(pageId) {
  return api(`/lowcode-pages/${pageId}`, { method: 'DELETE' })
}
