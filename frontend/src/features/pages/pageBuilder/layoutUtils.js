export function numberOrUndefined(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

export function normalizeGutter(value) {
  if (Array.isArray(value)) return value.map((item) => Number(item) || 0)
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 16
}

export function getColResponsiveProps(props) {
  return ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'].reduce((values, key) => {
    if (props[key] !== undefined && props[key] !== '') values[key] = Number(props[key]) || 0
    return values
  }, {})
}

export function getColProps(props) {
  return {
    span: numberOrUndefined(props.span),
    offset: numberOrUndefined(props.offset),
    order: numberOrUndefined(props.order),
    flex: props.flex || undefined,
    ...getColResponsiveProps(props),
  }
}
