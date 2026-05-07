(function (app) {
const { api } = app;

const RecordOperations = {
  createRecord: async (tableId, data) => {
    return await api(`/tables/${tableId}/records`, {
      method: "POST",
      body: JSON.stringify({ data }),
    });
  },

  updateRecord: async (tableId, recordId, data) => {
    return await api(`/tables/${tableId}/records/${recordId}`, {
      method: "PUT",
      body: JSON.stringify({ data }),
    });
  },

  deleteRecord: async (tableId, recordId) => {
    return await api(`/tables/${tableId}/records/${recordId}`, { method: "DELETE" });
  },
};

app.RecordOperations = RecordOperations;
})(window.Notcobase);
