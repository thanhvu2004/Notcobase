(function (app) {
const { api } = app;

const ColumnOperations = {
  createColumn: async (tableId, fieldForm) => {
    return await api(`/tables/${tableId}/columns`, {
      method: "POST",
      body: JSON.stringify(fieldForm),
    });
  },

  updateColumn: async (tableId, columnId, data) => {
    return await api(`/tables/${tableId}/columns/${columnId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteColumn: async (tableId, columnId) => {
    return await api(`/tables/${tableId}/columns/${columnId}`, { method: "DELETE" });
  },
};

app.ColumnOperations = ColumnOperations;
})(window.Notcobase);
