const { useState, useEffect } = React;
const h = React.createElement;

function can(permission) {
  if (!permission) {
    return true;
  }

  return window.Auth?.hasPermission(permission);
}

function withPermission(permission, component) {
  return can(permission) ? component : null;
}

function UsersApp() {
    const [activeTab, setActiveTab] = useState("users");
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        // Auto-select first authorized tab
        const availableTabs = [];

        if (can("users.view")) {
            availableTabs.push("users");
        }

        if (can("roles.view")) {
            availableTabs.push("roles");
        }

        if (can("permissions.view")) {
            availableTabs.push("permissions");
        }

        // If current tab unauthorized, switch to first available tab
        if (!availableTabs.includes(activeTab)) {
            setActiveTab(availableTabs[0] || "");
        }

        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        setError("");
        try {
            const [u, r, p] = await Promise.all([
                AdminApi.users.list(),
                AdminApi.roles.list(),
                AdminApi.permissions.list()
            ]);
            console.log("Data loaded:", u, r, p);
            setUsers(u);
            setRoles(r);
            setPermissions(p);
        } catch (err) {
            console.error("Error loading data:", err);
            setError(err.message);
        }
        setLoading(false);
    };

    const handleTabChange = (tab) => {

        const permissionMap = {
            users: "users.view",
            roles: "roles.view",
            permissions: "permissions.view"
        };

        // Prevent switching to unauthorized tab
        if (!can(permissionMap[tab])) {
            return;
        }

        setActiveTab(tab);
        setError("");
    };

    return h("div", { className: "container mt-4" },
        h("h1", { className: "mb-4" }, "Users & Permissions Management"),
        error && h("div", 
            { className: "alert alert-danger alert-dismissible fade show", role: "alert" },
            error,
            h("button", 
                { type: "button", className: "btn-close", onClick: () => setError("") }
            )
        ),
        h("ul", { className: "nav nav-tabs mb-4" },
            withPermission("users.view", h("li", { className: "nav-item" },
                h("button",
                    { 
                        className: `nav-link ${activeTab === "users" ? "active" : ""}`,
                        onClick: () => handleTabChange("users")
                    },
                    "Users"
                )
            )),
            withPermission("roles.view", h("li", { className: "nav-item" },
                h("button",
                    { 
                        className: `nav-link ${activeTab === "roles" ? "active" : ""}`,
                        onClick: () => handleTabChange("roles")
                    },
                    "Roles"
                )
            )),
            withPermission("permissions.view", h("li", { className: "nav-item" },
                h("button",
                    { 
                        className: `nav-link ${activeTab === "permissions" ? "active" : ""}`,
                        onClick: () => handleTabChange("permissions")
                    },
                    "Permissions"
                )
            ))
        ),
        withPermission("users.view", activeTab === "users" && h(UsersTab, {
            users,
            roles,
            onUpdate: loadAllData,
            loading
        })),
        withPermission("roles.view", activeTab === "roles" && h(RolesTab, {
            roles,
            permissions,
            onUpdate: loadAllData,
            loading
        })),
        withPermission("permissions.view", activeTab === "permissions" && h(PermissionsTab, {
            permissions,
            onUpdate: loadAllData,
            loading
        }))
    );
}

function UsersTab({ users, roles, onUpdate, loading }) {
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ username: "", password: "" });
    const [selectedUser, setSelectedUser] = useState(null);

    const handleAddUser = async (e) => {
        e.preventDefault();
        try {
            await AdminApi.users.create(formData.username, formData.password);
            setFormData({ username: "", password: "" });
            setShowForm(false);
            onUpdate();
        } catch (err) {
            alert("Error creating user: " + err.message);
        }
    };

    const handleDeleteUser = async (id) => {
        if (confirm("Are you sure you want to delete this user?")) {
            try {
                await AdminApi.users.delete(id);
                onUpdate();
            } catch (err) {
                alert("Error deleting user: " + err.message);
            }
        }
    };

    const handleAssignRole = async (userId, roleId) => {
        try {
            await AdminApi.users.assignRole(userId, roleId);
            onUpdate();
            setSelectedUser(null);
        } catch (err) {
            alert("Error assigning role: " + err.message);
        }
    };

    const handleRemoveRole = async (userId, roleId) => {
        try {
            await AdminApi.users.removeRole(userId, roleId);
            onUpdate();
            setSelectedUser(null);
        } catch (err) {
            alert("Error removing role: " + err.message);
        }
    };

    const userListItems = users.map(user =>
        h("button",
            {
                key: user.id,
                type: "button",
                className: `list-group-item list-group-item-action ${selectedUser?.id === user.id ? "active" : ""}`,
                onClick: () => setSelectedUser(user)
            },
            h("div", { className: "d-flex justify-content-between align-items-start" },
                h("div", null,
                    h("h6", { className: "mb-0" }, user.username),
                    h("small", null, "Roles: " + (user.roles?.join(", ") || "None"))
                ),
                withPermission("users.delete", h(
                    "button",
                    {
                        type: "button",
                        className: "btn btn-sm btn-danger",
                        onClick: (e) => {
                            e.stopPropagation();
                            handleDeleteUser(user.id);
                        }
                    },
                    "Delete"
                ))
            )
        )
    );

    const assignedRoleItems = selectedUser && selectedUser.roles && selectedUser.roles.length > 0
        ? h("div", null,
            selectedUser.roles.map((roleName, idx) => {
                const role = roles.find(r => r.roleName === roleName);
                return h("span",
                    { key: idx, className: "badge bg-info me-2" },
                    roleName,
                    withPermission("roles.delete", h("button",
                        {
                            type: "button",
                            className: "btn-close btn-close-white ms-1",
                            onClick: () => handleRemoveRole(selectedUser.id, role?.id),
                            style: { fontSize: "0.7rem" }
                        }
                    ))
                );
            })
        )
        : h("span", { className: "text-muted" }, "No roles assigned");

    const availableRoleItems = roles.map(role => {
        const isAssigned = selectedUser?.roles?.includes(role.roleName);
        return h("button",
            {
                key: role.id,
                type: "button",
                className: `list-group-item list-group-item-action ${isAssigned ? "active" : ""}`,
                onClick: () => !isAssigned && handleAssignRole(selectedUser.id, role.id),
                disabled: isAssigned
            },
            h("div", { className: "d-flex justify-content-between" },
                h("span", null, role.roleName),
                isAssigned && h("span", { className: "badge bg-success" }, "Assigned")
            )
        );
    });

    return h("div", null,
        withPermission("users.create", h(
            "button",
            {
                className: "btn btn-primary mb-3",
                onClick: () => setShowForm(!showForm)
            },
            showForm ? "Cancel" : "Add New User"
        )),
        showForm && h("div", { className: "card mb-3" },
            h("div", { className: "card-body" },
                h("form", { onSubmit: handleAddUser },
                    h("div", { className: "mb-3" },
                        h("label", { className: "form-label" }, "Username"),
                        h("input", {
                            type: "text",
                            className: "form-control",
                            value: formData.username,
                            onChange: (e) => setFormData({ ...formData, username: e.target.value }),
                            required: true
                        })
                    ),
                    h("div", { className: "mb-3" },
                        h("label", { className: "form-label" }, "Password"),
                        h("input", {
                            type: "password",
                            className: "form-control",
                            value: formData.password,
                            onChange: (e) => setFormData({ ...formData, password: e.target.value }),
                            required: true
                        })
                    ),
                    h("button", { type: "submit", className: "btn btn-success" }, "Create User")
                )
            )
        ),
        h("div", { className: "row" },
            h("div", { className: "col-md-6" },
                h("h5", null, "Users List"),
                h("div", { className: "list-group" }, ...userListItems)
            ),
            selectedUser && h("div", { className: "col-md-6" },
                h("h5", null, `Assign Roles to ${selectedUser.username}`),
                h("div", { className: "card" },
                    h("div", { className: "card-body" },
                        h("h6", null, "Current Roles:"),
                        h("div", { className: "mb-3" }, assignedRoleItems),
                        h("h6", null, "Available Roles:"),
                        h("div", { className: "list-group" }, ...availableRoleItems)
                    )
                )
            )
        )
    );
}

function RolesTab({ roles, permissions, onUpdate, loading }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "" });
  const [selectedRole, setSelectedRole] = useState(null);

  const handleAddRole = async (e) => {
    e.preventDefault();

    try {
      await AdminApi.roles.create(formData.name);

      setFormData({ name: "" });
      setShowForm(false);

      onUpdate();
    } catch (err) {
      alert("Error creating role: " + err.message);
    }
  };

  const handleDeleteRole = async (id) => {
    if (!confirm("Are you sure you want to delete this role?")) {
      return;
    }

    try {
      await AdminApi.roles.delete(id);

      onUpdate();

      setSelectedRole(null);
    } catch (err) {
      alert("Error deleting role: " + err.message);
    }
  };

  const handlePermissionToggle = async (permission, checked) => {
    if (!selectedRole) {
      return;
    }

    try {
      if (checked) {
        await AdminApi.roles.assignPermission(selectedRole.id, permission.id);
      } else {
        await AdminApi.roles.removePermission(selectedRole.id, permission.id);
      }

      // Update selectedRole immediately in frontend
      setSelectedRole((prev) => {
        if (!prev) {
          return prev;
        }

        let updatedPermissions = [...(prev.permissions || [])];

        if (checked) {
          if (!updatedPermissions.includes(permission.permissionName)) {
            updatedPermissions.push(permission.permissionName);
          }
        } else {
          updatedPermissions = updatedPermissions.filter(
            (p) => p !== permission.permissionName,
          );
        }

        return {
          ...prev,
          permissions: updatedPermissions,
        };
      });

      // Refresh backend data
      await onUpdate();
    } catch (err) {
      alert("Error updating permission: " + err.message);
    }
  };

  const roleListItems = roles.map((role) =>
    h(
      "button",
      {
        key: role.id,
        type: "button",
        className: `list-group-item list-group-item-action ${
          selectedRole?.id === role.id ? "active" : ""
        }`,
        onClick: () => setSelectedRole(role),
      },

      h(
        "div",
        {
          className: "d-flex justify-content-between align-items-center",
        },

        h(
          "div",
          null,

          h("h6", { className: "mb-0" }, role.roleName),

          withPermission(
            "permissions.view",

            h("small", null, `${role.permissions?.length || 0} permissions`),
          ),
        ),

        withPermission("roles.delete", h(
            "button",
            {
              type: "button",
              className: "btn btn-sm btn-danger",

              onClick: (e) => {
                e.stopPropagation();
                handleDeleteRole(role.id);
              },
            },
            "Delete",
          ),
        ),
      ),
    ),
  );

  const permissionCheckboxes =
    selectedRole &&
    permissions.map((permission) => {
      const checked = selectedRole.permissions?.includes(
        permission.permissionName,
      );

      return h(
        "div",
        {
          key: permission.id,
          className:
            "form-check p-3 mb-2 rounded border d-flex align-items-center",
        },

        h("input", {
          type: "checkbox",

          className: "form-check-input me-3",

          checked: checked,

          disabled: !can("permissions.assign") && !can("permissions.remove"),

          onChange: (e) => handlePermissionToggle(permission, e.target.checked),

          style: {
            width: "1.4rem",
            height: "1.4rem",
            marginLeft: "0.5rem",
            cursor: "pointer",
          },
        }),

        h(
          "label",
          {
            className: "form-check-label ms-2 mb-0",
            style: {
              fontSize: "1rem",
              cursor: "pointer",
            },
          },

          permission.permissionName,
        ),
      );
    });

  return h("div", null,
    withPermission("roles.create", h(
        "button",
        {
          className: "btn btn-primary mb-3",
          onClick: () => setShowForm(!showForm),
        },
        showForm ? "Cancel" : "Add New Role",
      ),
    ),

    showForm &&
      h("div", { className: "card mb-3" },

        h( "div", { className: "card-body" },
          h("form", { onSubmit: handleAddRole },
            h( "div", { className: "mb-3" },
              h("label", { className: "form-label" }, "Role Name"),
              h("input", {
                type: "text",
                className: "form-control",
                value: formData.name,
                onChange: (e) =>
                  setFormData({
                    name: e.target.value,
                  }),
                required: true,
              }),
            ),

            h(
              "button",
              {
                type: "submit",
                className: "btn btn-success",
              },
              "Create Role",
            ),
          ),
        ),
      ),

    h( "div", { className: "row" },
      h(
        "div",
        { className: "col-md-4" },
        h("h5", null, "Roles"),
        h(
          "div",
          { className: "list-group" },
          ...roleListItems,
        ),
      ),

      selectedRole &&
        h(
          "div",
          { className: "col-md-8" },
          h(
            "div",
            { className: "card" },
            h(
              "div",
              { className: "card-body" },
              h(
                "h5",
                { className: "mb-3" },
                `${selectedRole.roleName} Permissions`,
              ),

              withPermission("permissions.view", h(
                  "div",
                  null,
                  ...permissionCheckboxes,
                ),
              ),
            ),
          ),
        ),
    ),
  );
}

function PermissionsTab({ permissions, onUpdate, loading }) {
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: "" });

    const handleAddPermission = async (e) => {
        e.preventDefault();
        try {
            await AdminApi.permissions.create(formData.name);
            setFormData({ name: "" });
            setShowForm(false);
            onUpdate();
        } catch (err) {
            alert("Error creating permission: " + err.message);
        }
    };

    const handleDeletePermission = async (id) => {
        if (confirm("Are you sure you want to delete this permission?")) {
            try {
                await AdminApi.permissions.delete(id);
                onUpdate();
            } catch (err) {
                alert("Error deleting permission: " + err.message);
            }
        }
    };

    const permListItems = permissions.map(perm =>
        h("div",
            {
                key: perm.id,
                className: "list-group-item d-flex justify-content-between align-items-center"
            },
            h("span", null, perm.permissionName),
            withPermission("permissions.delete", h("button",
                {
                    type: "button",
                    className: "btn btn-sm btn-danger",
                    onClick: () => handleDeletePermission(perm.id)
                },
                "Delete"
            ))
        )
    );

    return h("div", null,
        withPermission("permissions.create", h("button",
            {
                className: "btn btn-primary mb-3",
                onClick: () => setShowForm(!showForm)
            },
            showForm ? "Cancel" : "Add New Permission"
        )),
        showForm && h("div", { className: "card mb-3" },
            h("div", { className: "card-body" },
                h("form", { onSubmit: handleAddPermission },
                    h("div", { className: "mb-3" },
                        h("label", { className: "form-label" }, "Permission Name"),
                        h("input", {
                            type: "text",
                            className: "form-control",
                            value: formData.name,
                            onChange: (e) => setFormData({ name: e.target.value }),
                            required: true
                        })
                    ),
                    h("button", { type: "submit", className: "btn btn-success" }, "Create Permission")
                )
            )
        ),
        h("div", { className: "row" },
            h("div", { className: "col-md-6" },
                h("h5", null, "Permissions List"),
                h("div", { className: "list-group" }, ...permListItems)
            )
        )
    );
}

// Render the app
ReactDOM.render(h(UsersApp), document.getElementById("root"));
