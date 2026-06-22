import { api } from '../../shared/api/client'

export const usersApi = {
  list: () => api('/users'),
  create: (username, password) =>
    api('/users', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  delete: (id) => api(`/users/${id}`, { method: 'DELETE' }),
  assignRole: (id, roleId) =>
    api(`/users/${id}/roles`, {
      method: 'POST',
      body: JSON.stringify({ roleId }),
    }),
  removeRole: (id, roleId) => api(`/users/${id}/roles/${roleId}`, { method: 'DELETE' }),
}

export const rolesApi = {
  list: () => api('/roles'),
  create: (name) =>
    api('/roles', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  delete: (id) => api(`/roles/${id}`, { method: 'DELETE' }),
  assignPermission: (id, permissionId) =>
    api(`/roles/${id}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ permissionId }),
    }),
  removePermission: (id, permissionId) =>
    api(`/roles/${id}/permissions/${permissionId}`, { method: 'DELETE' }),
}

export const permissionsApi = {
  list: () => api('/permissions'),
  create: (name) =>
    api('/permissions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  delete: (id) => api(`/permissions/${id}`, { method: 'DELETE' }),
}
