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
  return api('/lowcode-pages').then((pages) => pages.map((page) => normalizePage(page)))
}

export function fetchPage(pageId) {
  return api(`/lowcode-pages/${pageId}`).then(normalizePage)
}

export function createPage(payload) {
  return api('/lowcode-pages', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then((page) => normalizePage(page, payload.sectionName))
}

export function updatePage(pageId, payload) {
  return api(`/lowcode-pages/${pageId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then((page) => normalizePage(page, payload.sectionName))
}

export function deletePage(pageId) {
  return api(`/lowcode-pages/${pageId}`, { method: 'DELETE' })
}

export function movePageToSection(page, sectionName) {
  return updatePage(page.id, {
    name: page.name,
    sectionName,
    requiredPermission: page.requiredPermission,
    showInNavbar: page.showInNavbar,
    schemaJson: page.schemaJson,
    isPublished: page.isPublished,
  })
}

function normalizePage(page, fallbackSectionName) {
  if (!page) return page
  const sectionName = normalizeSectionName(page.sectionName ?? page.SectionName ?? fallbackSectionName)
  const requiredPermission = normalizePermissionName(page.requiredPermission ?? page.RequiredPermission)
  const showInNavbar = page.showInNavbar ?? page.ShowInNavbar ?? true

  return {
    ...page,
    sectionName,
    requiredPermission,
    showInNavbar,
  }
}

function normalizeSectionName(sectionName) {
  if (typeof sectionName !== 'string') return null
  const trimmed = sectionName.trim()
  return trimmed || null
}

function normalizePermissionName(permissionName) {
  if (typeof permissionName !== 'string') return null
  const trimmed = permissionName.trim()
  return trimmed || null
}
