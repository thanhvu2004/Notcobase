// Please see documentation at https://docs.microsoft.com/aspnet/core/client-side/bundling-and-minification
// for details on configuring this project to bundle and minify static web assets.

// Write your JavaScript code.

window.hideUnauthorizedElements = function () {
    if (!window.Auth) {
        return;
    }

    document
        .querySelectorAll("[data-permission]")
        .forEach((el) => {
            const permissionAttr = el.dataset.permission;

            // Support multiple permissions separated by comma
            // Example:
            // data-permission="users.view,roles.view"
            const permissions = permissionAttr
                .split(",")
                .map(p => p.trim())
                .filter(Boolean);

            // Show if user has AT LEAST ONE permission
            const hasPermission = permissions.some(permission =>
                Auth.hasPermission(permission)
            );

            if (!hasPermission) {
                el.style.display = "none";
            }
            else {
                el.style.display = "";
            }
        });
};

// Run automatically after page load
document.addEventListener(
    "DOMContentLoaded",
    function () {
        window.hideUnauthorizedElements();
    }
);
