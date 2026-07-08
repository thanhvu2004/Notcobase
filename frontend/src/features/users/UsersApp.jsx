import { useCallback, useEffect, useState } from 'react'
import { permissionsApi, rolesApi, usersApi } from './usersApi'
import { createPermissionChecker } from '../auth/permissions'
import { t } from '../../shared/locale'

export default function UsersApp({ user }) {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [userForm, setUserForm] = useState({ username: '', password: '' })
  const [roleName, setRoleName] = useState('')
  const [permissionName, setPermissionName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const can = createPermissionChecker(user)
  const canViewUsers = can('users.view')
  const canCreateUser = can('users.create')
  const canDeleteUser = can('users.delete')
  const canViewRoles = can('roles.view')
  const canCreateRole = can('roles.create')
  const canDeleteRole = can('roles.delete')
  const canAssignRole = can('roles.assign')
  const canRemoveRole = can('roles.remove')
  const canViewPermissions = can('permissions.view')
  const canCreatePermission = can('permissions.create')
  const canDeletePermission = can('permissions.delete')
  const canAssignPermission = can('permissions.assign')
  const canRemovePermission = can('permissions.remove')
  const visibleTabs = [
    canViewUsers && 'users',
    canViewRoles && 'roles',
    canViewPermissions && 'permissions',
  ].filter(Boolean)
  const activeVisibleTab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0] || ''

  const loadAllData = useCallback(async function loadAllData() {
    setLoading(true)
    try {
      const [nextUsers, nextRoles, nextPermissions] = await Promise.all([
        canViewUsers ? usersApi.list() : Promise.resolve([]),
        canViewRoles ? rolesApi.list() : Promise.resolve([]),
        canViewPermissions ? permissionsApi.list() : Promise.resolve([]),
      ])
      setUsers(nextUsers)
      setRoles(nextRoles)
      setPermissions(nextPermissions)
      setSelectedUser((current) =>
        current ? nextUsers.find((user) => user.id === current.id) || null : null,
      )
      setSelectedRole((current) =>
        current ? nextRoles.find((role) => role.id === current.id) || null : null,
      )
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [canViewPermissions, canViewRoles, canViewUsers])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAllData()
  }, [loadAllData])

  async function handleCreateUser(event) {
    event.preventDefault()
    if (!canCreateUser) return
    try {
      await usersApi.create(userForm.username, userForm.password)
      setUserForm({ username: '', password: '' })
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteUser(user) {
    if (!canDeleteUser) return
    if (!confirm(t('deleteUserConfirm', { username: user.username }))) return
    try {
      await usersApi.delete(user.id)
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAssignRole(roleId) {
    if (!selectedUser) return
    if (!canAssignRole) return
    try {
      await usersApi.assignRole(selectedUser.id, roleId)
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemoveRole(roleName) {
    if (!selectedUser) return
    if (!canRemoveRole) return
    const role = roles.find((item) => item.roleName === roleName)
    if (!role) return
    try {
      await usersApi.removeRole(selectedUser.id, role.id)
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCreateRole(event) {
    event.preventDefault()
    if (!canCreateRole) return
    try {
      await rolesApi.create(roleName)
      setRoleName('')
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteRole(role) {
    if (!canDeleteRole) return
    if (!confirm(t('deleteRoleConfirm', { roleName: role.roleName }))) return
    try {
      await rolesApi.delete(role.id)
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handlePermissionToggle(permission, checked) {
    if (!selectedRole) return
    if (checked ? !canAssignPermission : !canRemovePermission) return
    try {
      if (checked) {
        await rolesApi.assignPermission(selectedRole.id, permission.id)
      } else {
        await rolesApi.removePermission(selectedRole.id, permission.id)
      }
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCreatePermission(event) {
    event.preventDefault()
    if (!canCreatePermission) return
    try {
      await permissionsApi.create(permissionName)
      setPermissionName('')
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeletePermission(permission) {
    if (!canDeletePermission) return
    if (!confirm(t('deletePermissionConfirm', { permissionName: permission.permissionName }))) return
    try {
      await permissionsApi.delete(permission.id)
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="page-content">
      <header className="page-header">
        <div>
          <h1>{t('usersPermissions')}</h1>
          <p>{t('manageUsersRoles')}</p>
        </div>
        <button type="button" className="outline" onClick={loadAllData} disabled={loading}>
          {t('refresh')}
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <nav className="tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeVisibleTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {t(`${tab}Tab`)}
          </button>
        ))}
      </nav>

      {activeVisibleTab === 'users' && canViewUsers && (
        <section className="grid-two admin-grid">
          <div className="panel">
            {canCreateUser && (
              <>
                <h2>{t('createUser')}</h2>
                <form className="panel-form inset" onSubmit={handleCreateUser}>
                  <label>
                    {t('username')}
                    <input
                      value={userForm.username}
                      onChange={(event) => setUserForm({ ...userForm, username: event.target.value })}
                      required
                    />
                  </label>
                  <label>
                    {t('password')}
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                      required
                    />
                  </label>
                  <button type="submit">{t('createUser')}</button>
                </form>
              </>
            )}

            <h2>{t('users')}</h2>
            <div className="list-stack">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={selectedUser?.id === user.id ? 'list-item active' : 'list-item'}
                  onClick={() => setSelectedUser(user)}
                >
                  <span>
                    <strong>{user.username}</strong>
                    <small>{user.roles?.join(', ') || t('noRoles')}</small>
                  </span>
                  {canDeleteUser && (
                    <span
                      role="button"
                      tabIndex="0"
                      className="text-danger"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteUser(user)
                      }}
                    >
                      {t('delete')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>
              {selectedUser ? t('selectedUserRolesTitle', { username: selectedUser.username }) : t('selectUser')}
            </h2>
            {selectedUser ? (
              <>
                <div className="tag-row">
                  {(selectedUser.roles || []).map((role) => (
                    canRemoveRole ? (
                      <button key={role} type="button" className="tag" onClick={() => handleRemoveRole(role)}>
                        {role} x
                      </button>
                    ) : (
                      <span key={role} className="tag">
                        {role}
                      </span>
                    )
                  ))}
                  {(selectedUser.roles || []).length === 0 && <p className="muted">{t('noRolesAssigned')}</p>}
                </div>
                <div className="list-stack">
                  {canViewRoles && roles.map((role) => {
                    const assigned = selectedUser.roles?.includes(role.roleName)
                    return (
                      <button
                        key={role.id}
                        type="button"
                        className={assigned ? 'list-item active' : 'list-item'}
                        onClick={() => !assigned && handleAssignRole(role.id)}
                        disabled={assigned || !canAssignRole}
                      >
                        <span>{role.roleName}</span>
                        <small>{t(assigned ? 'assigned' : 'assign')}</small>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="muted">{t('chooseUserToAssignRoles')}</p>
            )}
          </div>
        </section>
      )}

      {activeVisibleTab === 'roles' && canViewRoles && (
        <section className="grid-two admin-grid">
          <div className="panel">
            {canCreateRole && (
              <>
                <h2>{t('createRole')}</h2>
                <form className="panel-form inset" onSubmit={handleCreateRole}>
                  <label>
                    {t('roleLabel')}
                    <input value={roleName} onChange={(event) => setRoleName(event.target.value)} required />
                  </label>
                  <button type="submit">{t('createRole')}</button>
                </form>
              </>
            )}

            <h2>{t('roles')}</h2>
            <div className="list-stack">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  className={selectedRole?.id === role.id ? 'list-item active' : 'list-item'}
                  onClick={() => setSelectedRole(role)}
                >
                  <span>
                    <strong>{role.roleName}</strong>
                    <small>{t('permissionsCount', { count: role.permissions?.length || 0 })}</small>
                  </span>
                  {canDeleteRole && (
                    <span
                      role="button"
                      tabIndex="0"
                      className="text-danger"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteRole(role)
                      }}
                    >
                      {t('delete')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>
              {selectedRole ? t('selectedRolePermissionsTitle', { roleName: selectedRole.roleName }) : t('selectRole')}
            </h2>
            {selectedRole ? (
              <div className="check-list">
                {permissions.map((permission) => (
                  <label key={permission.id} className="check-card">
                    <input
                      type="checkbox"
                      checked={selectedRole.permissions?.includes(permission.permissionName) || false}
                      disabled={!canAssignPermission && !canRemovePermission}
                      onChange={(event) => handlePermissionToggle(permission, event.target.checked)}
                    />
                    {permission.permissionName}
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted">{t('chooseRoleToAssignPermissions')}</p>
            )}
          </div>
        </section>
      )}

      {activeVisibleTab === 'permissions' && canViewPermissions && (
        <section className="grid-two">
          <div className="panel">
            {canCreatePermission && (
              <>
                <h2>{t('createPermissionTitle')}</h2>
                <form className="panel-form inset" onSubmit={handleCreatePermission}>
                  <label>
                    {t('permissionName')}
                    <input
                      value={permissionName}
                      onChange={(event) => setPermissionName(event.target.value)}
                      required
                    />
                  </label>
                  <button type="submit">{t('createPermission')}</button>
                </form>
              </>
            )}
          </div>

          <div className="panel">
            <h2>{t('permissions')}</h2>
            <div className="list-stack">
              {permissions.map((permission) => (
                <div key={permission.id} className="list-item static">
                  <span>{permission.permissionName}</span>
                  {canDeletePermission && (
                    <button type="button" className="danger" onClick={() => handleDeletePermission(permission)}>
                      {t('delete')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </section>
      )}
    </main>
  )
}
