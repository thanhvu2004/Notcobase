export function normalizePermissions(user) {
  return Array.isArray(user?.permissions) ? user.permissions.filter(Boolean) : []
}

export function hasPermission(user, permission) {
  if (!permission) return true
  return normalizePermissions(user).includes(permission)
}

export function hasAnyPermission(user, permissions) {
  const required = Array.isArray(permissions) ? permissions : [permissions]
  const filtered = required.filter(Boolean)
  if (filtered.length === 0) return true
  return filtered.some((permission) => hasPermission(user, permission))
}

export function createPermissionChecker(user) {
  return (permissions) => hasAnyPermission(user, permissions)
}
