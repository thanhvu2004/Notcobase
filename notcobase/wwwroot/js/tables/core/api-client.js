(function (app) {
  const API_ROOT = "/api";

  async function api(path, options = {}) {
    // Get JWT token from localStorage
    const token = localStorage.getItem("jwtToken");

    // Build headers
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    // Add Authorization header if token exists
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    console.log(`[API] ${options.method || "GET"} ${API_ROOT}${path}`);

    const response = await fetch(`${API_ROOT}${path}`, {
      ...options,

      headers,
    });

    console.log(`[API] Response: ${response.status} ${response.statusText}`);

    // Handle unauthorized
    if (response.status === 401) {
      console.warn("[API] Unauthorized");

      // Optional: redirect to login
      // window.location.href = "/Login";
      throw new Error("Unauthorized");
    }

    // Handle forbidden
    if (response.status === 403) {
      console.warn("[API] Forbidden");

      throw new Error("You do not have permission.");
    }

    // Handle other errors
    if (!response.ok) {
      const message = await response.text();

      throw new Error(
        message || `Request failed with status ${response.status}`,
      );
    }

    // No content
    if (response.status === 204) {
      return null;
    }

    // Return JSON response
    return response.json();
  }

  // Expose API globally
  app.api = api;
})(window.Notcobase || (window.Notcobase = {}));
