const { useState, useEffect } = React;
const h = React.createElement;

function UsersApp() {
    const [activeTab, setActiveTab] = useState("users");
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        console.log("UsersApp mounted, loading data...");
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setLoading(true);
        setError("");
        try {
            console.log("Fetching users, roles, permissions...");
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
            h("li", { className: "nav-item" },
                h("button",
                    { 
                        className: `nav-link ${activeTab === "users" ? "active" : ""}`,
                        onClick: () => handleTabChange("users")
                    },
                    "Users"
                )
            ),
            h("li", { className: "nav-item" },
                h("button",
                    { 
                        className: `nav-link ${activeTab === "roles" ? "active" : ""}`,
                        onClick: () => handleTabChange("roles")
                    },
                    "Roles"
                )
            ),
            h("li", { className: "nav-item" },
                h("button",
                    { 
                        className: `nav-link ${activeTab === "permissions" ? "active" : ""}`,
                        onClick: () => handleTabChange("permissions")
                    },
                    "Permissions"
                )
            )
        ),
        activeTab === "users" && h(UsersTab, {
            users,
            roles,
            onUpdate: loadAllData,
            loading
        }),
        activeTab === "roles" && h(RolesTab, {
            roles,
            permissions,
            onUpdate: loadAllData,
            loading
        }),
        activeTab === "permissions" && h(PermissionsTab, {
            permissions,
            onUpdate: loadAllData,
            loading
        })
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
                h("button",
                    {
                        type: "button",
                        className: "btn btn-sm btn-danger",
                        onClick: (e) => {
                            e.stopPropagation();
                            handleDeleteUser(user.id);
                        }
                    },
                    "Delete"
                )
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
                    h("button",
                        {
                            type: "button",
                            className: "btn-close btn-close-white ms-1",
                            onClick: () => handleRemoveRole(selectedUser.id, role?.id),
                            style: { fontSize: "0.7rem" }
                        }
                    )
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
        h("button",
            {
                className: "btn btn-primary mb-3",
                onClick: () => setShowForm(!showForm)
            },
            showForm ? "Cancel" : "Add New User"
        ),
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
        if (confirm("Are you sure you want to delete this role?")) {
            try {
                await AdminApi.roles.delete(id);
                onUpdate();
                setSelectedRole(null);
            } catch (err) {
                alert("Error deleting role: " + err.message);
            }
        }
    };

    const handleAssignPermission = async (roleId, permissionId) => {
        try {
            await AdminApi.roles.assignPermission(roleId, permissionId);
            onUpdate();
            setSelectedRole(null);
        } catch (err) {
            alert("Error assigning permission: " + err.message);
        }
    };

    const handleRemovePermission = async (roleId, permissionId) => {
        try {
            await AdminApi.roles.removePermission(roleId, permissionId);
            onUpdate();
            setSelectedRole(null);
        } catch (err) {
            alert("Error removing permission: " + err.message);
        }
    };

    const roleListItems = roles.map(role =>
        h("button",
            {
                key: role.id,
                type: "button",
                className: `list-group-item list-group-item-action ${selectedRole?.id === role.id ? "active" : ""}`,
                onClick: () => setSelectedRole(role)
            },
            h("div", { className: "d-flex justify-content-between align-items-start" },
                h("div", null,
                    h("h6", { className: "mb-0" }, role.roleName),
                    h("small", null, "Permissions: " + (role.permissions?.length || 0))
                ),
                h("button",
                    {
                        type: "button",
                        className: "btn btn-sm btn-danger",
                        onClick: (e) => {
                            e.stopPropagation();
                            handleDeleteRole(role.id);
                        }
                    },
                    "Delete"
                )
            )
        )
    );

    const assignedPermItems = selectedRole && selectedRole.permissions && selectedRole.permissions.length > 0
        ? h("div", null,
            selectedRole.permissions.map((permName, idx) => {
                const perm = permissions.find(p => p.permissionName === permName);
                return h("span",
                    { key: idx, className: "badge bg-info me-2" },
                    permName,
                    h("button",
                        {
                            type: "button",
                            className: "btn-close btn-close-white ms-1",
                            onClick: () => handleRemovePermission(selectedRole.id, perm?.id),
                            style: { fontSize: "0.7rem" }
                        }
                    )
                );
            })
        )
        : h("span", { className: "text-muted" }, "No permissions assigned");

    const availablePermItems = permissions.map(perm => {
        const isAssigned = selectedRole?.permissions?.includes(perm.permissionName);
        return h("button",
            {
                key: perm.id,
                type: "button",
                className: `list-group-item list-group-item-action ${isAssigned ? "active" : ""}`,
                onClick: () => !isAssigned && handleAssignPermission(selectedRole.id, perm.id),
                disabled: isAssigned
            },
            h("div", { className: "d-flex justify-content-between" },
                h("span", null, perm.permissionName),
                isAssigned && h("span", { className: "badge bg-success" }, "Assigned")
            )
        );
    });

    return h("div", null,
        h("button",
            {
                className: "btn btn-primary mb-3",
                onClick: () => setShowForm(!showForm)
            },
            showForm ? "Cancel" : "Add New Role"
        ),
        showForm && h("div", { className: "card mb-3" },
            h("div", { className: "card-body" },
                h("form", { onSubmit: handleAddRole },
                    h("div", { className: "mb-3" },
                        h("label", { className: "form-label" }, "Role Name"),
                        h("input", {
                            type: "text",
                            className: "form-control",
                            value: formData.name,
                            onChange: (e) => setFormData({ name: e.target.value }),
                            required: true
                        })
                    ),
                    h("button", { type: "submit", className: "btn btn-success" }, "Create Role")
                )
            )
        ),
        h("div", { className: "row" },
            h("div", { className: "col-md-6" },
                h("h5", null, "Roles List"),
                h("div", { className: "list-group" }, ...roleListItems)
            ),
            selectedRole && h("div", { className: "col-md-6" },
                h("h5", null, `Assign Permissions to ${selectedRole.roleName}`),
                h("div", { className: "card" },
                    h("div", { className: "card-body" },
                        h("h6", null, "Current Permissions:"),
                        h("div", { className: "mb-3" }, assignedPermItems),
                        h("h6", null, "Available Permissions:"),
                        h("div", { className: "list-group" }, ...availablePermItems)
                    )
                )
            )
        )
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
            h("button",
                {
                    type: "button",
                    className: "btn btn-sm btn-danger",
                    onClick: () => handleDeletePermission(perm.id)
                },
                "Delete"
            )
        )
    );

    return h("div", null,
        h("button",
            {
                className: "btn btn-primary mb-3",
                onClick: () => setShowForm(!showForm)
            },
            showForm ? "Cancel" : "Add New Permission"
        ),
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
