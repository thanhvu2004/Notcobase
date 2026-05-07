(function (app) {
const { api } = app;

const TableOperations = {
  fetchTables: async () => {
    return await api("/tables");
  },

  fetchTableDetails: async (tableId) => {
    const [columns, records] = await Promise.all([
      api(`/tables/${tableId}/columns`),
      api(`/tables/${tableId}/records`),
    ]);
    return { columns, records };
  },

  createTable: async (payload) => {
    return await api("/tables", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateTable: async (tableId, payload) => {
    return await api(`/tables/${tableId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  deleteTable: async (tableId) => {
    return await api(`/tables/${tableId}`, { method: "DELETE" });
  },
};

app.TableOperations = TableOperations;
})(window.Notcobase);
