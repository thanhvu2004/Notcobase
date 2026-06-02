(function (window) {
  window.Notcobase = window.Notcobase || {};

  async function apiRequest(url, options) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${window.Auth?.getToken?.() || ""}`,
        ...(options?.headers || {}),
      },
      ...options,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed with ${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  window.Notcobase.ApiClient = {
    request: apiRequest,
  };
})(window);
