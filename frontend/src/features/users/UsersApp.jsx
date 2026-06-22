import { useEffect, useState } from 'react'
import { permissionsApi, rolesApi, usersApi } from './usersApi'

export default function UsersApp() {
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

  async function loadAllData() {
    setLoading(true)
    try {
      const [nextUsers, nextRoles, nextPermissions] = await Promise.all([
        usersApi.list(),
        rolesApi.list(),
        permissionsApi.list(),
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
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAllData()
  }, [])

  async function handleCreateUser(event) {
    event.preventDefault()
    try {
      await usersApi.create(userForm.username, userForm.password)
      setUserForm({ username: '', password: '' })
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteUser(user) {
    if (!confirm(`Delete user "${user.username}"?`)) return
    try {
      await usersApi.delete(user.id)
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAssignRole(roleId) {
    if (!selectedUser) return
    try {
      await usersApi.assignRole(selectedUser.id, roleId)
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemoveRole(roleName) {
    if (!selectedUser) return
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
    try {
      await rolesApi.create(roleName)
      setRoleName('')
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteRole(role) {
    if (!confirm(`Delete role "${role.roleName}"?`)) return
    try {
      await rolesApi.delete(role.id)
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handlePermissionToggle(permission, checked) {
    if (!selectedRole) return
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
    try {
      await permissionsApi.create(permissionName)
      setPermissionName('')
      await loadAllData()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeletePermission(permission) {
    if (!confirm(`Delete permission "${permission.permissionName}"?`)) return
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
          <h1>Users & Permissions</h1>
          <p>Manage users, roles, and permission claims.</p>
        </div>
        <button type="button" className="secondary" onClick={loadAllData} disabled={loading}>
          Refresh
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <nav className="tabs">
        {['users', 'roles', 'permissions'].map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === 'users' && (
        <section className="grid-two admin-grid">
          <div className="panel">
            <h2>Create user</h2>
            <form className="panel-form inset" onSubmit={handleCreateUser}>
              <label>
                Username
                <input
                  value={userForm.username}
                  onChange={(event) => setUserForm({ ...userForm, username: event.target.value })}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                  required
                />
              </label>
              <button type="submit">Create user</button>
            </form>

            <h2>Users</h2>
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
                    <small>{user.roles?.join(', ') || 'No roles'}</small>
                  </span>
                  <span
                    role="button"
                    tabIndex="0"
                    className="text-danger"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDeleteUser(user)
                    }}
                  >
                    Delete
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>{selectedUser ? `${selectedUser.username} roles` : 'Select a user'}</h2>
            {selectedUser ? (
              <>
                <div className="tag-row">
                  {(selectedUser.roles || []).map((role) => (
                    <button key={role} type="button" className="tag" onClick={() => handleRemoveRole(role)}>
                      {role} x
                    </button>
                  ))}
                  {(selectedUser.roles || []).length === 0 && <p className="muted">No roles assigned.</p>}
                </div>
                <div className="list-stack">
                  {roles.map((role) => {
                    const assigned = selectedUser.roles?.includes(role.roleName)
                    return (
                      <button
                        key={role.id}
                        type="button"
                        className={assigned ? 'list-item active' : 'list-item'}
                        onClick={() => !assigned && handleAssignRole(role.id)}
                        disabled={assigned}
                      >
                        <span>{role.roleName}</span>
                        <small>{assigned ? 'Assigned' : 'Assign'}</small>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="muted">Choose a user to assign roles.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === 'roles' && (
        <section className="grid-two admin-grid">
          <div className="panel">
            <h2>Create role</h2>
            <form className="panel-form inset" onSubmit={handleCreateRole}>
              <label>
                Role name
                <input value={roleName} onChange={(event) => setRoleName(event.target.value)} required />
              </label>
              <button type="submit">Create role</button>
            </form>

            <h2>Roles</h2>
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
                    <small>{role.permissions?.length || 0} permissions</small>
                  </span>
                  <span
                    role="button"
                    tabIndex="0"
                    className="text-danger"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDeleteRole(role)
                    }}
                  >
                    Delete
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>{selectedRole ? `${selectedRole.roleName} permissions` : 'Select a role'}</h2>
            {selectedRole ? (
              <div className="check-list">
                {permissions.map((permission) => (
                  <label key={permission.id} className="check-card">
                    <input
                      type="checkbox"
                      checked={selectedRole.permissions?.includes(permission.permissionName) || false}
                      onChange={(event) => handlePermissionToggle(permission, event.target.checked)}
                    />
                    {permission.permissionName}
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted">Choose a role to assign permissions.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === 'permissions' && (
        <section className="grid-two">
          <div className="panel">
            <h2>Create permission</h2>
            <form className="panel-form inset" onSubmit={handleCreatePermission}>
              <label>
                Permission name
                <input
                  value={permissionName}
                  onChange={(event) => setPermissionName(event.target.value)}
                  required
                />
              </label>
              <button type="submit">Create permission</button>
            </form>
          </div>

          <div className="panel">
            <h2>Permissions</h2>
            <div className="list-stack">
              {permissions.map((permission) => (
                <div key={permission.id} className="list-item static">
                  <span>{permission.permissionName}</span>
                  <button type="button" className="danger" onClick={() => handleDeletePermission(permission)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

        </section>
      )}
    </main>
  )
}
