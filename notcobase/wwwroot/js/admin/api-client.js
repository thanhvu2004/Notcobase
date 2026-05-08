const AdminApi = {
    async request(method, endpoint, body = null) {
        const options = {
            method,
            headers: { "Content-Type": "application/json" }
        };

        // Add JWT token if available
        if (window.jwtToken) {
            options.headers["Authorization"] = `Bearer ${window.jwtToken}`;
        }

        if (body) options.body = JSON.stringify(body);

        console.log(`[AdminApi] ${method} /api/${endpoint}`, body);
        const response = await fetch(`/api/${endpoint}`, options);
        console.log(`[AdminApi] Response:`, response.status, response.statusText);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || response.statusText);
        }
        return response.json();
    },

    users: {
        list: () => AdminApi.request("GET", "users"),
        get: (id) => AdminApi.request("GET", `users/${id}`),
        create: (username, password) =>
            AdminApi.request("POST", "users", { username, password }),
        update: (id, username) =>
            AdminApi.request("PUT", `users/${id}`, { username }),
        delete: (id) => AdminApi.request("DELETE", `users/${id}`),
        assignRole: (id, roleId) =>
            AdminApi.request("POST", `users/${id}/roles`, { roleId }),
        removeRole: (id, roleId) =>
            AdminApi.request("DELETE", `users/${id}/roles/${roleId}`)
    },

    roles: {
        list: () => AdminApi.request("GET", "roles"),
        get: (id) => AdminApi.request("GET", `roles/${id}`),
        create: (name) => AdminApi.request("POST", "roles", { name }),
        update: (id, name) => AdminApi.request("PUT", `roles/${id}`, { name }),
        delete: (id) => AdminApi.request("DELETE", `roles/${id}`),
        assignPermission: (id, permissionId) =>
            AdminApi.request("POST", `roles/${id}/permissions`, { permissionId }),
        removePermission: (id, permissionId) =>
            AdminApi.request("DELETE", `roles/${id}/permissions/${permissionId}`)
    },

    permissions: {
        list: () => AdminApi.request("GET", "permissions"),
        get: (id) => AdminApi.request("GET", `permissions/${id}`),
        create: (name) => AdminApi.request("POST", "permissions", { name }),
        update: (id, name) => AdminApi.request("PUT", `permissions/${id}`, { name }),
        delete: (id) => AdminApi.request("DELETE", `permissions/${id}`)
    }
};
