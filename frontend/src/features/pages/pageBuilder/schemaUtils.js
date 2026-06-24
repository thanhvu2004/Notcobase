import { defaultSchema } from './constants'

export function createId(prefix = 'node') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createNode(component) {
  const id = createId(component.toLowerCase())
  const base = {
    id,
    type: component === 'Checkbox' || component === 'Switch' ? 'boolean' : 'string',
    name: id,
    title: component,
    'x-component': component,
    'x-component-props': {},
  }

  if (component === 'Container' || component === 'Section') {
    return {
      ...base,
      type: 'object',
      'x-component-props': { layout: 'vertical' },
      properties: {},
    }
  }
  if (component === 'Grid.Row') {
    return {
      ...base,
      type: 'void',
      title: 'Row',
      'x-component-props': { gutter: 16, columns: 2, align: 'top', justify: 'start', wrap: true },
      properties: {
        col1: {
          ...createNode('Grid.Col'),
          name: 'col1',
          title: 'Column 1',
          'x-component-props': { span: 12 },
          'x-index': 0,
        },
        col2: {
          ...createNode('Grid.Col'),
          name: 'col2',
          title: 'Column 2',
          'x-component-props': { span: 12 },
          'x-index': 1,
        },
      },
    }
  }
  if (component === 'Grid.Col') {
    return {
      ...base,
      type: 'void',
      title: 'Column',
      'x-component-props': { span: 12 },
      properties: {},
    }
  }
  if (component === 'Tabs') {
    return {
      ...base,
      type: 'object',
      title: 'Tabs',
      'x-component-props': { tabPlacement: 'top' },
      properties: {
        tabOne: {
          ...createNode('Section'),
          name: 'tabOne',
          title: 'Tab one',
        },
        tabTwo: {
          ...createNode('Section'),
          name: 'tabTwo',
          title: 'Tab two',
        },
      },
    }
  }
  if (component === 'Divider') return { ...base, title: 'Divider', 'x-component-props': { titlePlacement: 'left', text: 'Divider' } }
  if (component === 'Heading') return { ...base, title: 'Heading', 'x-component-props': { level: 2, text: 'Heading' } }
  if (component === 'Text') return { ...base, title: 'Text', 'x-component-props': { text: 'Add text here.' } }
  if (component === 'Button') return { ...base, title: 'Button', 'x-component-props': { text: 'Action' } }
  if (component === 'Select') return { ...base, enum: ['Option A', 'Option B'], 'x-component-props': { placeholder: 'Select an option' } }
  if (component === 'Input') return { ...base, 'x-component-props': { placeholder: 'Enter text' } }
  if (component === 'InputNumber') return { ...base, type: 'number', title: 'Number', 'x-component-props': { placeholder: 'Enter number' } }
  if (component === 'Input.TextArea' || component === 'Textarea') return { ...base, title: 'Text area', 'x-component-props': { placeholder: 'Enter details' } }
  if (component === 'Switch') return { ...base, type: 'boolean', title: 'Switch', 'x-component-props': {} }
  if (component === 'DatePicker') return { ...base, title: 'Date', 'x-component-props': {} }
  if (component === 'File') return { ...base, title: 'File', 'x-component-props': {} }
  if (component === 'Reference') {
    return {
      ...base,
      type: 'array',
      title: 'Reference',
      'x-component-props': {
        placeholder: 'Select records',
        targetTableId: null,
        displayColumnId: 'id',
        relationshipMode: 'lookup',
        parentFieldName: '',
        pickerVariant: 'table',
      },
    }
  }
  if (component === 'FormBlock') {
    return {
      ...base,
      type: 'object',
      title: 'Form',
      'x-component-props': {
        tableId: null,
        formColumns: [],
        mode: 'auto',
        recordId: null,
        recordIdParam: 'id',
        submitLabel: 'Save',
        allowCreate: true,
        allowEdit: true,
        allowDelete: false,
        useFormGroup: false,
        formGroupKey: '',
        showGroupSubmit: true,
      },
      properties: {},
    }
  }
  if (component === 'TableBlock') {
    return {
      ...base,
      type: 'object',
      title: 'Records',
      'x-component-props': {
        tableId: null,
        pageSize: 10,
        columns: [],
        allowCreate: true,
        allowEdit: true,
        allowDelete: true,
        createAction: 'modal',
        editAction: 'modal',
        rowClickAction: 'none',
        rowTargetPageId: null,
        createTargetPageId: null,
        editTargetPageId: null,
      },
      properties: {},
    }
  }
  return base
}

export function normalizeSchema(schema) {
  const withRoot = schema?.['x-component'] ? schema : defaultSchema
  return ensureIds(withRoot)
}

export function ensureIds(node) {
  const next = { ...node, id: node.id || createId('schema') }
  if (next.properties) {
    next.properties = Object.fromEntries(Object.entries(next.properties).map(([key, child]) => [key, ensureIds(child)]))
  }
  return next
}

export function findNode(schema, nodeId, parent = null, key = null) {
  if (!schema || schema.id === nodeId) return schema ? { node: schema, parent, key } : null
  for (const [childKey, child] of Object.entries(schema.properties || {})) {
    const found = findNode(child, nodeId, schema, childKey)
    if (found) return found
  }
  return null
}

export function updateNode(schema, nodeId, updater) {
  if (schema.id === nodeId) return updater(schema)
  if (!schema.properties) return schema
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([key, child]) => [key, updateNode(child, nodeId, updater)]),
    ),
  }
}

export function removeNode(schema, nodeId) {
  if (!schema.properties) return schema
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(schema.properties)
        .filter(([, child]) => child.id !== nodeId)
        .map(([key, child]) => [key, removeNode(child, nodeId)]),
    ),
  }
}

export function insertNode(schema, parentId, node) {
  return updateNode(schema, parentId, (parent) => ({
    ...parent,
    properties: {
      ...(parent.properties || {}),
      [node.name]: node,
    },
  }))
}

export function moveNode(schema, nodeId, direction) {
  const found = findNode(schema, nodeId)
  if (!found?.parent) return schema
  const entries = Object.entries(found.parent.properties || {})
  const index = entries.findIndex(([, child]) => child.id === nodeId)
  const nextIndex = direction === 'up' ? index - 1 : index + 1
  if (nextIndex < 0 || nextIndex >= entries.length) return schema
  const nextEntries = [...entries]
  const [item] = nextEntries.splice(index, 1)
  nextEntries.splice(nextIndex, 0, item)
  return updateNode(schema, found.parent.id, (parent) => ({ ...parent, properties: Object.fromEntries(nextEntries) }))
}

function isDescendant(node, nodeId) {
  if (!node?.properties) return false
  return Object.values(node.properties).some((child) => child.id === nodeId || isDescendant(child, nodeId))
}

function withOrderedProperties(node, entries) {
  return {
    ...node,
    properties: Object.fromEntries(entries.map(([key, child], index) => [
      key,
      { ...child, 'x-index': index },
    ])),
  }
}

export function moveNodeToPosition(schema, draggedNodeId, targetNodeId, position) {
  if (!draggedNodeId || !targetNodeId || draggedNodeId === targetNodeId) return schema

  const dragged = findNode(schema, draggedNodeId)
  const target = findNode(schema, targetNodeId)
  if (!dragged?.parent || !target?.node) return schema
  if (dragged.node.id === schema.id || isDescendant(dragged.node, targetNodeId)) return schema

  const canNest = position === 'inside' && target.node.properties
  const dropParent = canNest ? target.node : target.parent
  if (!dropParent) return schema

  const withoutDragged = removeNode(schema, draggedNodeId)
  const freshDropParent = findNode(withoutDragged, dropParent.id)?.node
  const freshTarget = findNode(withoutDragged, targetNodeId)?.node
  if (!freshDropParent || (!canNest && !freshTarget)) return schema

  const entries = Object.entries(freshDropParent.properties || {})
  const draggedEntry = [dragged.key || dragged.node.name, dragged.node]

  if (canNest) {
    return updateNode(withoutDragged, freshDropParent.id, (parent) => withOrderedProperties(parent, [...entries, draggedEntry]))
  }

  const targetIndex = entries.findIndex(([, child]) => child.id === targetNodeId)
  if (targetIndex < 0) return schema

  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  const nextEntries = [...entries]
  nextEntries.splice(insertIndex, 0, draggedEntry)
  return updateNode(withoutDragged, freshDropParent.id, (parent) => withOrderedProperties(parent, nextEntries))
}
