(function (window) {
  window.Notcobase = window.Notcobase || {};
  const { request } = window.Notcobase.ApiClient;

  window.Notcobase.RecordsApi = {
    list(tableId, params) {
      const query = new URLSearchParams();
      if (params?.skip != null) query.set("skip", String(params.skip));
      if (params?.limit != null) query.set("limit", String(params.limit));
      const suffix = query.toString() ? `?${query}` : "";
      return request(`/api/tables/${tableId}/records${suffix}`);
    },
    get(tableId, recordId) {
      return request(`/api/tables/${tableId}/records/${recordId}`);
    },
    create(tableId, data) {
      return request(`/api/tables/${tableId}/records`, {
        method: "POST",
        body: JSON.stringify({ data }),
      });
    },
    update(tableId, recordId, data) {
      return request(`/api/tables/${tableId}/records/${recordId}`, {
        method: "PUT",
        body: JSON.stringify({ data }),
      });
    },
    remove(tableId, recordId) {
      return request(`/api/tables/${tableId}/records/${recordId}`, {
        method: "DELETE",
      });
    },
  };
})(window);
