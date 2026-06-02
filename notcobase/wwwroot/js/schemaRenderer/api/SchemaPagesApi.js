(function (window) {
  window.Notcobase = window.Notcobase || {};

  async function request(url, options) {
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

  window.Notcobase.SchemaPagesApi = {
    list() {
      return request("/api/lowcode-pages");
    },
    get(id) {
      return request(`/api/lowcode-pages/${id}`);
    },
    create(payload) {
      return request("/api/lowcode-pages", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    update(id, payload) {
      return request(`/api/lowcode-pages/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
  };
})(window);
