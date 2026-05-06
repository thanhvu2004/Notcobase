const { useEffect, useMemo, useState } = React;
const h = React.createElement;
const API_ROOT = "/api";

const FIELD_TYPES = ["text", "number", "date", "checkbox", "list"];

async function api(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function emptyRecord(columns) {
  return columns.reduce((values, column) => {
    if (column.fieldType === "checkbox") {
      values[column.name] = false;
    } else if (column.fieldType === "list") {
      values[column.name] = [""];
    } else {
      values[column.name] = "";
    }

    return values;
  }, {});
}

function cleanListItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}

function coerceRecordValue(value, fieldType) {
  if (fieldType === "number") {
    return value === "" ? null : Number(value);
  }

  if (fieldType === "checkbox") {
    return Boolean(value);
  }

  if (fieldType === "list") {
    return cleanListItems(value);
  }

  return value;
}

function formatRecordValue(value, fieldType) {
  if (fieldType === "checkbox") {
    return value ? "Yes" : "No";
  }

  if (fieldType === "list") {
    const items = cleanListItems(value);
    return items.length > 0 ? items.join(", ") : "";
  }

  return String(value ?? "");
}

function TablesApp() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [columns, setColumns] = useState([]);
  const [records, setRecords] = useState([]);
  const [tableForm, setTableForm] = useState({
    name: "",
    description: "",
    inheritProperties: false,
    parentTableId: "",
  });
  const [fieldForm, setFieldForm] = useState({
    name: "",
    fieldType: "text",
    isRequired: false,
  });
  const [recordForm, setRecordForm] = useState({});
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [showCreateRecord, setShowCreateRecord] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const selectedTableId = selectedTable?.id;
  const parentTableOptions = tables;

  useEffect(() => {
    fetchTables();
  }, []);

  useEffect(() => {
    setRecordForm(emptyRecord(columns));
  }, [columns]);

  const fetchTables = async () => {
    try {
      setLoading(true);
      setTables(await api("/tables"));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableDetails = async (table) => {
    try {
      setSelectedTable(table);
      setLoading(true);
      const [nextColumns, nextRecords] = await Promise.all([
        api(`/tables/${table.id}/columns`),
        api(`/tables/${table.id}/records`),
      ]);
      setColumns(nextColumns);
      setRecords(nextRecords);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshSelectedTable = async () => {
    if (!selectedTableId) return;

    const [nextColumns, nextRecords] = await Promise.all([
      api(`/tables/${selectedTableId}/columns`),
      api(`/tables/${selectedTableId}/records`),
    ]);
    setColumns(nextColumns);
    setRecords(nextRecords);
    await fetchTables();
  };

  const createTable = async (event) => {
    event.preventDefault();
    if (!tableForm.name.trim()) return;

    try {
      setSaving(true);
      const payload = {
        name: tableForm.name.trim(),
        description: tableForm.description,
        inheritProperties: tableForm.inheritProperties,
        parentTableId: tableForm.inheritProperties ? Number(tableForm.parentTableId) : null,
      };

      const table = await api("/tables", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setTableForm({
        name: "",
        description: "",
        inheritProperties: false,
        parentTableId: "",
      });
      setShowCreateTable(false);
      await fetchTables();
      await fetchTableDetails(table);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteTable = async (table) => {
    if (!window.confirm(`Delete "${table.name}" and all of its data?`)) return;

    try {
      await api(`/tables/${table.id}`, { method: "DELETE" });
      if (selectedTableId === table.id) {
        setSelectedTable(null);
        setColumns([]);
        setRecords([]);
      }
      await fetchTables();
    } catch (err) {
      setError(err.message);
    }
  };

  const createColumn = async (event) => {
    event.preventDefault();
    if (!selectedTableId || !fieldForm.name.trim()) return;

    try {
      setSaving(true);
      await api(`/tables/${selectedTableId}/columns`, {
        method: "POST",
        body: JSON.stringify(fieldForm),
      });
      setFieldForm({ name: "", fieldType: "text", isRequired: false });
      await refreshSelectedTable();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteColumn = async (column) => {
    if (!window.confirm(`Delete field "${column.name}"? Existing record data will remain hidden.`)) return;

    try {
      await api(`/tables/${selectedTableId}/columns/${column.id}`, { method: "DELETE" });
      await refreshSelectedTable();
    } catch (err) {
      setError(err.message);
    }
  };

  const createRecord = async (event) => {
    event.preventDefault();
    if (!selectedTableId || columns.length === 0) return;

    const data = columns.reduce((values, column) => {
      values[column.name] = coerceRecordValue(recordForm[column.name], column.fieldType);
      return values;
    }, {});

    try {
      setSaving(true);
      await api(`/tables/${selectedTableId}/records`, {
        method: "POST",
        body: JSON.stringify({ data }),
      });
      setShowCreateRecord(false);
      setRecordForm(emptyRecord(columns));
      await refreshSelectedTable();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (record) => {
    if (!window.confirm("Delete this record?")) return;

    try {
      await api(`/tables/${selectedTableId}/records/${record.id}`, { method: "DELETE" });
      await refreshSelectedTable();
    } catch (err) {
      setError(err.message);
    }
  };

  const setListItem = (columnName, itemIndex, value) => {
    const items = Array.isArray(recordForm[columnName]) ? [...recordForm[columnName]] : [""];
    items[itemIndex] = value;
    setRecordForm({ ...recordForm, [columnName]: items });
  };

  const addListItem = (columnName) => {
    const items = Array.isArray(recordForm[columnName]) ? recordForm[columnName] : [];
    setRecordForm({ ...recordForm, [columnName]: [...items, ""] });
  };

  const removeListItem = (columnName, itemIndex) => {
    const items = Array.isArray(recordForm[columnName]) ? [...recordForm[columnName]] : [""];
    const nextItems = items.filter((_, index) => index !== itemIndex);
    setRecordForm({ ...recordForm, [columnName]: nextItems.length > 0 ? nextItems : [""] });
  };

  const activeTable = useMemo(
    () => tables.find((table) => table.id === selectedTableId) || selectedTable,
    [tables, selectedTable, selectedTableId],
  );

  return h(
    "div",
    { className: "container-fluid py-4" },
    h(
      "div",
      { className: "d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4" },
      h(
        "div",
        null,
        h("h1", { className: "h3 mb-1" }, "Notcobase"),
      ),
      h(
        "div",
        { className: "d-flex gap-2" },
        h("button", { className: "btn btn-outline-secondary", onClick: fetchTables }, "Refresh"),
        h("button", { className: "btn btn-primary", onClick: () => setShowCreateTable(true) }, "Create table"),
      ),
    ),

    error && h("div", { className: "alert alert-danger" }, error),

    h(
      "div",
      { className: "row g-4" },
      h(
        "aside",
        { className: "col-lg-3" },
        h(
          "div",
          { className: "list-group shadow-sm" },
          loading && tables.length === 0
            ? h("div", { className: "list-group-item text-muted" }, "Loading tables...")
            : tables.length === 0
              ? h("div", { className: "list-group-item text-muted" }, "No tables yet")
              : tables.map((table) =>
                  h(
                    "button",
                    {
                      key: table.id,
                      className: `list-group-item list-group-item-action text-start ${selectedTableId === table.id ? "active" : ""}`,
                      onClick: () => fetchTableDetails(table),
                    },
                    h("div", { className: "fw-semibold" }, table.name),
                    h(
                      "small",
                      { className: selectedTableId === table.id ? "text-white-50" : "text-muted" },
                      `${table.columnCount || 0} fields, ${table.recordCount || 0} records`,
                    ),
                    table.inheritProperties &&
                      h(
                        "small",
                        { className: selectedTableId === table.id ? "d-block text-white-50" : "d-block text-muted" },
                        `inherits from ${table.parentTableName || `table #${table.parentTableId}`}`,
                      ),
                  ),
                ),
        ),
      ),

      h(
        "main",
        { className: "col-lg-9" },
        !activeTable
          ? h(
              "div",
              { className: "border rounded bg-light p-5 text-center" },
              h("h2", { className: "h5" }, "Select or create a table"),
            )
          : h(
              "div",
              null,
              h(
                "div",
                { className: "d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3" },
                h(
                  "div",
                  null,
                  h("h2", { className: "h4 mb-1" }, activeTable.name),
                  h("p", { className: "text-muted mb-0" }, activeTable.description || "No description"),
                  activeTable.inheritProperties &&
                    h(
                      "div",
                      { className: "small text-muted mt-1" },
                      `Inherits properties from ${activeTable.parentTableName || `table #${activeTable.parentTableId}`}`,
                    ),
                ),
                h(
                  "div",
                  { className: "d-flex gap-2" },
                  h(
                    "button",
                    {
                      className: "btn btn-outline-danger btn-sm",
                      onClick: () => deleteTable(activeTable),
                    },
                    "Delete table",
                  ),
                  h(
                    "button",
                    {
                      className: "btn btn-success btn-sm",
                      disabled: columns.length === 0,
                      onClick: () => setShowCreateRecord(true),
                    },
                    "Add record",
                  ),
                ),
              ),

              h(
                "div",
                { className: "row g-3 mb-4" },
                h(
                  "div",
                  { className: "col-xl-5" },
                  h(
                    "div",
                    { className: "border rounded p-3 h-100" },
                    h("h3", { className: "h6 mb-3" }, "Fields"),
                    h(
                      "form",
                      { className: "row g-2 mb-3", onSubmit: createColumn },
                      h(
                        "div",
                        { className: "col-sm-5" },
                        h("input", {
                          className: "form-control form-control-sm",
                          placeholder: "Field name",
                          value: fieldForm.name,
                          onChange: (event) => setFieldForm({ ...fieldForm, name: event.target.value }),
                        }),
                      ),
                      h(
                        "div",
                        { className: "col-sm-4" },
                        h(
                          "select",
                          {
                            className: "form-select form-select-sm",
                            value: fieldForm.fieldType,
                            onChange: (event) => setFieldForm({ ...fieldForm, fieldType: event.target.value }),
                          },
                          FIELD_TYPES.map((type) => h("option", { key: type, value: type }, type)),
                        ),
                      ),
                      h(
                        "div",
                        { className: "col-sm-3 d-grid" },
                        h("button", { className: "btn btn-sm btn-primary", disabled: saving }, "Add"),
                      ),
                      h(
                        "label",
                        { className: "form-check ms-2 small" },
                        h("input", {
                          className: "form-check-input",
                          type: "checkbox",
                          checked: fieldForm.isRequired,
                          onChange: (event) => setFieldForm({ ...fieldForm, isRequired: event.target.checked }),
                        }),
                        " Required",
                      ),
                    ),
                    columns.length === 0
                      ? h("div", { className: "text-muted small" }, "Add fields before creating records.")
                      : h(
                          "div",
                          { className: "d-flex flex-column gap-2" },
                          columns.map((column) =>
                            h(
                              "div",
                              { key: column.id, className: "d-flex align-items-center justify-content-between border rounded px-2 py-1" },
                              h(
                                "div",
                                null,
                                h("span", { className: "fw-semibold" }, column.name),
                                h("span", { className: "badge text-bg-light ms-2" }, column.fieldType),
                                column.isRequired && h("span", { className: "badge text-bg-warning ms-2" }, "required"),
                                column.isInherited && h("span", { className: "badge text-bg-info ms-2" }, "inherited"),
                              ),
                              h(
                                "button",
                                {
                                  className: "btn btn-sm btn-outline-danger",
                                  disabled: column.isInherited,
                                  title: column.isInherited ? "Inherited fields must be changed on the parent table" : "Delete field",
                                  onClick: () => deleteColumn(column),
                                },
                                "Delete",
                              ),
                            ),
                          ),
                        ),
                  ),
                ),
                h(
                  "div",
                  { className: "col-xl-7" },
                  h(
                    "div",
                    { className: "border rounded p-3 h-100" },
                    h("h3", { className: "h6 mb-3" }, "Table stats"),
                    h(
                      "div",
                      { className: "row text-center" },
                      h("div", { className: "col" }, h("div", { className: "h4 mb-0" }, columns.length), h("small", { className: "text-muted" }, "Fields")),
                      h("div", { className: "col" }, h("div", { className: "h4 mb-0" }, records.length), h("small", { className: "text-muted" }, "Loaded records")),
                      h("div", { className: "col" }, h("div", { className: "h4 mb-0" }, activeTable.recordCount || records.length), h("small", { className: "text-muted" }, "Total records")),
                    ),
                  ),
                ),
              ),

              h(
                "div",
                { className: "table-responsive border rounded" },
                columns.length === 0
                  ? h("div", { className: "p-4 text-muted" }, "This table has no fields yet.")
                  : h(
                      "table",
                      { className: "table table-hover align-middle mb-0" },
                      h(
                        "thead",
                        { className: "table-light" },
                        h(
                          "tr",
                          null,
                          columns.map((column) => h("th", { key: column.id }, column.name)),
                          h("th", { className: "text-end", style: { width: 96 } }, "Actions"),
                        ),
                      ),
                      h(
                        "tbody",
                        null,
                        records.length === 0
                          ? h("tr", null, h("td", { colSpan: columns.length + 1, className: "text-muted p-4" }, "No records yet."))
                          : records.map((record) =>
                              h(
                                "tr",
                                { key: record.id },
                                columns.map((column) =>
                                  h("td", { key: column.id }, formatRecordValue(record.data?.[column.name], column.fieldType)),
                                ),
                                h(
                                  "td",
                                  { className: "text-end" },
                                  h(
                                    "button",
                                    {
                                      className: "btn btn-sm btn-outline-danger",
                                      onClick: () => deleteRecord(record),
                                    },
                                    "Delete",
                                  ),
                                ),
                              ),
                            ),
                      ),
                    ),
              ),
            ),
      ),
    ),

    showCreateTable &&
      h(
        Modal,
        { title: "Create table", onClose: () => setShowCreateTable(false) },
        h(
          "form",
          { onSubmit: createTable },
          h(
            "div",
            { className: "modal-body" },
            h("label", { className: "form-label" }, "Name"),
            h("input", {
              className: "form-control mb-3",
              autoFocus: true,
              required: true,
              value: tableForm.name,
              onChange: (event) => setTableForm({ ...tableForm, name: event.target.value }),
            }),
            h("label", { className: "form-label" }, "Description"),
            h("textarea", {
              className: "form-control mb-3",
              rows: 3,
              value: tableForm.description,
              onChange: (event) => setTableForm({ ...tableForm, description: event.target.value }),
            }),
            h(
              "div",
              { className: "form-check mb-3" },
              h("input", {
                id: "inheritProperties",
                className: "form-check-input",
                type: "checkbox",
                checked: tableForm.inheritProperties,
                disabled: parentTableOptions.length === 0,
                onChange: (event) =>
                  setTableForm({
                    ...tableForm,
                    inheritProperties: event.target.checked,
                    parentTableId: event.target.checked ? tableForm.parentTableId : "",
                  }),
              }),
              h("label", { className: "form-check-label", htmlFor: "inheritProperties" }, "Inherit properties from another table"),
            ),
            tableForm.inheritProperties &&
              h(
                "div",
                { className: "mb-1" },
                h("label", { className: "form-label" }, "Parent table"),
                h(
                  "select",
                  {
                    className: "form-select",
                    required: true,
                    value: tableForm.parentTableId,
                    onChange: (event) => setTableForm({ ...tableForm, parentTableId: event.target.value }),
                  },
                  h("option", { value: "" }, "Select parent table"),
                  parentTableOptions.map((table) =>
                    h(
                      "option",
                      { key: table.id, value: table.id },
                      `${table.name} (${table.columnCount || 0} fields)`,
                    ),
                  ),
                ),
              ),
            parentTableOptions.length === 0 &&
              h("div", { className: "form-text" }, "Create one table first before enabling inherited properties."),
          ),
          h(
            "div",
            { className: "modal-footer" },
            h("button", { type: "button", className: "btn btn-secondary", onClick: () => setShowCreateTable(false) }, "Cancel"),
            h(
              "button",
              {
                className: "btn btn-primary",
                disabled: saving || (tableForm.inheritProperties && !tableForm.parentTableId),
              },
              saving ? "Creating..." : "Create",
            ),
          ),
        ),
      ),

    showCreateRecord &&
      h(
        Modal,
        { title: `Add record to ${activeTable?.name || "table"}`, onClose: () => setShowCreateRecord(false) },
        h(
          "form",
          { onSubmit: createRecord },
          h(
            "div",
            { className: "modal-body" },
            columns.map((column) =>
              h(
                "div",
                { className: "mb-3", key: column.id },
                h("label", { className: "form-label" }, column.name),
                column.fieldType === "checkbox"
                  ? h(
                      "div",
                      { className: "form-check" },
                      h("input", {
                        className: "form-check-input",
                        type: "checkbox",
                        checked: Boolean(recordForm[column.name]),
                        onChange: (event) => setRecordForm({ ...recordForm, [column.name]: event.target.checked }),
                      }),
                      h("label", { className: "form-check-label" }, "Checked"),
                    )
                  : column.fieldType === "list"
                    ? h(
                        "div",
                        null,
                        (Array.isArray(recordForm[column.name]) ? recordForm[column.name] : [""]).map((item, itemIndex) =>
                          h(
                            "div",
                            { className: "input-group mb-2", key: itemIndex },
                            h("input", {
                              className: "form-control",
                              required: column.isRequired && itemIndex === 0,
                              value: item,
                              placeholder: `Item ${itemIndex + 1}`,
                              onChange: (event) => setListItem(column.name, itemIndex, event.target.value),
                            }),
                            h(
                              "button",
                              {
                                type: "button",
                                className: "btn btn-outline-danger",
                                disabled: (recordForm[column.name] || [""]).length === 1,
                                onClick: () => removeListItem(column.name, itemIndex),
                              },
                              "Remove",
                            ),
                          ),
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            className: "btn btn-sm btn-outline-primary",
                            onClick: () => addListItem(column.name),
                          },
                          "Add item",
                        ),
                      )
                  : h("input", {
                      className: "form-control",
                      type: column.fieldType === "number" ? "number" : column.fieldType === "date" ? "date" : "text",
                      required: column.isRequired,
                      value: recordForm[column.name] ?? "",
                      onChange: (event) => setRecordForm({ ...recordForm, [column.name]: event.target.value }),
                    }),
              ),
            ),
          ),
          h(
            "div",
            { className: "modal-footer" },
            h("button", { type: "button", className: "btn btn-secondary", onClick: () => setShowCreateRecord(false) }, "Cancel"),
            h("button", { className: "btn btn-success", disabled: saving }, saving ? "Saving..." : "Save record"),
          ),
        ),
      ),
  );
}

function Modal({ title, onClose, children }) {
  return h(
    "div",
    {
      className: "modal show d-block",
      tabIndex: "-1",
      style: { backgroundColor: "rgba(0,0,0,0.5)" },
    },
    h(
      "div",
      { className: "modal-dialog" },
      h(
        "div",
        { className: "modal-content" },
        h(
          "div",
          { className: "modal-header" },
          h("h5", { className: "modal-title" }, title),
          h("button", { type: "button", className: "btn-close", onClick: onClose }),
        ),
        children,
      ),
    ),
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(h(TablesApp));
