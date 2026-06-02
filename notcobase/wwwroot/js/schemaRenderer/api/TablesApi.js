(function (window) {
  window.Notcobase = window.Notcobase || {};
  const { request } = window.Notcobase.ApiClient;

  window.Notcobase.TablesApi = {
    list() {
      return request("/api/tables");
    },
    get(id) {
      return request(`/api/tables/${id}`);
    },
  };
})(window);
