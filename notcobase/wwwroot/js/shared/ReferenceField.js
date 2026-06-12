(function (window, React) {
  window.Notcobase = window.Notcobase || {};

  const h = React.createElement;
  const { useEffect, useMemo, useState } = React;

  function parseProps(source) {
    if (!source) return {};
    if (typeof source === "object") return source;
    try {
      return JSON.parse(source);
    } catch {
      return {};
    }
  }

  function parseIds(value) {
    if (Array.isArray(value)) {
      return value.map(Number).filter(Number.isFinite);
    }

    if (value == null || value === "") {
      return [];
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? [value] : [];
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parseIds(parsed);
      } catch {
        return value
          .split(",")
          .map((item) => Number(item.trim()))
          .filter(Number.isFinite);
      }
    }

    return [];
  }

  function stringifyIds(value) {
    return JSON.stringify(parseIds(value));
  }

  async function request(path, options = {}) {
    if (window.Notcobase.ApiClient?.request) {
      return window.Notcobase.ApiClient.request(path, options);
    }

    if (window.Notcobase.api) {
      return window.Notcobase.api(path.replace(/^\/api/, ""), options);
    }

    const token = localStorage.getItem("jwtToken");
    const isFormData = options.body instanceof FormData;
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text() || "Request failed");
    }

    return response.json();
  }

  function getRecordDisplay(record, displayColumn) {
    if (!record) return "";
    if (!displayColumn) return `#${record.id}`;
    const value = record.data?.[displayColumn.name];
    return value == null || value === "" ? `#${record.id}` : String(value);
  }

  function renderBasicFieldInput(field, value, onChange) {
    const type = String(field.fieldType || "text").toLowerCase();
    const common = {
      value: value ?? "",
      onChange: (event) => onChange(event.target.value),
    };

    if (type === "checkbox" || type === "boolean") {
      return h("input", {
        type: "checkbox",
        checked: value === true || value === "1" || String(value).toLowerCase() === "true",
        onChange: (event) => onChange(event.target.checked),
      });
    }

    if (type === "longtext") {
      return h("textarea", { ...common, className: "form-control", rows: 3 });
    }

    return h("input", {
      ...common,
      className: "form-control",
      type: type === "number" || type === "finance" ? "number" : type === "date" ? "date" : type === "url" ? "url" : "text",
    });
  }

  function ReferenceTablePicker({ value, onChange, config, disabled, designerMode }) {
    const selectedIds = useMemo(() => parseIds(value), [value]);
    const [table, setTable] = useState(null);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [draft, setDraft] = useState({});

    const antd = window.antd;
    const AntTable = antd?.Table;
    const Button = antd?.Button;
    const Modal = antd?.Modal;
    const Space = antd?.Space;

    const displayColumn = useMemo(
      () => (table?.columns || []).find((column) => Number(column.id) === Number(config.displayColumnId)),
      [table, config.displayColumnId],
    );

    const allIds = useMemo(
      () => records.map((record) => Number(record.id)),
      [records],
    );

    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
    const someSelected = allIds.some((id) => selectedIds.includes(id));

    function toggleAll(checked) {
      onChange?.(checked ? allIds : []);
    }

    async function loadData() {
      if (designerMode) {
        setTable(null);
        setRecords([]);
        return;
      }
      if (!config.targetTableId) {
        setTable(null);
        setRecords([]);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const [tableDetails, recordList] = await Promise.all([
          request(`/api/tables/${config.targetTableId}`),
          request(`/api/tables/${config.targetTableId}/records`),
        ]);
        setTable(tableDetails);
        setRecords(recordList);
      } catch (loadError) {
        setError(loadError.message || "Failed to load reference records");
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => {
      if (designerMode) {
        setTable(null);
        setRecords([]);
        return;
      }

      loadData();
    }, [config.targetTableId, designerMode]);

    function toggleId(id, checked) {
      const next = new Set(selectedIds);
      if (checked) next.add(Number(id));
      else next.delete(Number(id));
      onChange?.(Array.from(next));
    }

    function openCreate() {
      setEditingRecord(null);
      setDraft({});
      setModalOpen(true);
    }

    function openEdit(record) {
      setEditingRecord(record);
      setDraft({ ...(record.data || {}) });
      setModalOpen(true);
    }

    async function saveRecord() {
      if (!config.targetTableId) return;

      try {
        setLoading(true);
        if (editingRecord?.id) {
          await request(`/api/tables/${config.targetTableId}/records/${editingRecord.id}`, {
            method: "PUT",
            body: JSON.stringify({ data: draft }),
          });
        } else {
          await request(`/api/tables/${config.targetTableId}/records`, {
            method: "POST",
            body: JSON.stringify({ data: draft }),
          });
        }
        setModalOpen(false);
        await loadData();
      } catch (saveError) {
        setError(saveError.message || "Failed to save reference record");
      } finally {
        setLoading(false);
      }
    }

    const rows = designerMode
      ? []
      : records.map((record) => ({ ...record.data, id: record.id, __record: record }));
    const dataColumns = designerMode
      ? []
      : (table?.columns || []).map((column) => ({
        title: column.name,
        dataIndex: column.name,
        key: column.name,
        render: (cellValue) => column.fieldType === "reference"
          ? h(ReferenceDisplay, { value: cellValue, componentPropsJson: column.componentPropsJson })
          : String(cellValue ?? ""),
      }));

    const columns = [
      {
        title: h("input", {
          type: "checkbox",
          disabled,
          checked: allSelected,
          ref: (el) => {
            if (el) {
              el.indeterminate = !allSelected && someSelected;
            }
          },
          onChange: (event) => toggleAll(event.target.checked),
        }),
        key: "__select",
        width: 48,
        render: (_, row) => h("input", {
          type: "checkbox",
          disabled,
          checked: selectedIds.includes(Number(row.id)),
          onChange: (event) => toggleId(row.id, event.target.checked),
        }),
      },
      ...dataColumns,
      {
        title: "Actions",
        key: "__actions",
        width: 96,
        render: (_, row) => Button
          ? h(Button, { size: "small", disabled, onClick: () => openEdit(row.__record) }, "Edit")
          : h("button", { type: "button", className: "btn btn-sm btn-outline-secondary", disabled, onClick: () => openEdit(row.__record) }, "Edit"),
      },
    ];

    if (designerMode) {
      return h(
        "div",
        { className: "reference-table-picker text-muted" },
        "Reference table field (designer mode)",
      );
    }
    if (!config.targetTableId) {
      return h("div", { className: "text-muted" }, "Configure a target table for this reference field.");
    }

    const tableNode = AntTable
      ? h(AntTable, {
          rowKey: "id",
          size: "small",
          loading,
          columns,
          dataSource: rows,
          pagination: false,
        })
      : h(
          "table",
          { className: "table table-sm align-middle" },
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h(
                "th",
                null,
                h("input", {
                  type: "checkbox",
                  disabled,
                  checked: allSelected,
                  ref: (el) => {
                    if (el) {
                      el.indeterminate = !allSelected && someSelected;
                    }
                  },
                  onChange: (event) => toggleAll(event.target.checked),
                }),
              ),
              h("th", null, displayColumn?.name || "Record"),
              h("th", null, "Actions"),
            ),
          ),
          h(
            "tbody",
            null,
            records.map((record) => h(
              "tr",
              { key: record.id },
              h("td", null, h("input", {
                type: "checkbox",
                disabled,
                checked: selectedIds.includes(Number(record.id)),
                onChange: (event) => toggleId(record.id, event.target.checked),
              })),
              h("td", null, getRecordDisplay(record, displayColumn)),
              h("td", null, h("button", { type: "button", className: "btn btn-sm btn-outline-secondary", disabled, onClick: () => openEdit(record) }, "Edit")),
            )),
          ),
        );

    const modalBody = h(
      "div",
      null,
      (table?.columns || []).map((column) =>
        h(
          "div",
          { key: column.id || column.name, className: "mb-3" },
          h("label", { className: "form-label" }, column.name),
          renderBasicFieldInput(column, draft[column.name], (nextValue) => setDraft((current) => ({ ...current, [column.name]: nextValue }))),
        ),
      ),
    );

    return h(
      "div",
      { className: "reference-table-picker" },
      error && h("div", { className: "alert alert-danger py-2" }, error),
      h(
        "div",
        { className: "reference-table-picker-toolbar" },
        h("span", { className: "text-muted small" }, `${selectedIds.length} selected`),
        Button
          ? h(Button, { size: "small", type: "primary", disabled, onClick: openCreate }, "Add record")
          : h("button", { type: "button", className: "btn btn-sm btn-primary", disabled, onClick: openCreate }, "Add record"),
      ),
      tableNode,
      Modal
        ? h(Modal, {
            title: editingRecord ? "Edit referenced record" : "Create referenced record",
            open: modalOpen,
            onCancel: () => setModalOpen(false),
            onOk: saveRecord,
            confirmLoading: loading,
            destroyOnClose: true,
          }, modalBody)
        : modalOpen && h(
            "div",
            { className: "reference-modal-backdrop", onClick: () => setModalOpen(false) },
            h(
              "div",
              { className: "reference-modal-panel", onClick: (event) => event.stopPropagation() },
              h("div", { className: "reference-modal-header" }, h("h5", null, editingRecord ? "Edit referenced record" : "Create referenced record")),
              h("div", { className: "reference-modal-body" }, modalBody),
              h("div", { className: "reference-modal-footer" },
                h("button", { type: "button", className: "btn btn-secondary", onClick: () => setModalOpen(false) }, "Cancel"),
                h("button", { type: "button", className: "btn btn-primary", onClick: saveRecord }, "Save"),
              ),
            ),
          ),
    );
  }

  function ReferencePicker({ value, onChange, componentPropsJson, targetTableId, displayColumnId, pickerVariant, disabled, placeholder, designerMode }) {
    const config = {
      ...parseProps(componentPropsJson),
      ...(targetTableId != null ? { targetTableId } : {}),
      ...(displayColumnId != null ? { displayColumnId } : {}),
    };

    if (pickerVariant === "table") {
      return h(ReferenceTablePicker, { value, onChange, config, disabled, designerMode });
    }

    const selectedIds = useMemo(() => parseIds(value), [value]);
    const [open, setOpen] = useState(false);
    const [table, setTable] = useState(null);
    const [records, setRecords] = useState([]);
    const [draftIds, setDraftIds] = useState(selectedIds);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const displayColumn = useMemo(
      () => (table?.columns || []).find((column) => Number(column.id) === Number(config.displayColumnId)),
      [table, config.displayColumnId],
    );

    const label = useMemo(() => {
      if (!selectedIds.length) return placeholder || "Select records";
      if (!records.length) return `${selectedIds.length} selected`;

      const names = selectedIds
        .map((id) => getRecordDisplay(records.find((record) => Number(record.id) === Number(id)), displayColumn))
        .filter(Boolean);

      return names.length ? names.join(", ") : `${selectedIds.length} selected`;
    }, [displayColumn, placeholder, records, selectedIds]);

    const allIds = useMemo(
      () => records.map((record) => Number(record.id)),
      [records],
    );

    const allSelected = allIds.length > 0 && allIds.every((id) => draftIds.includes(id));
    const someSelected = allIds.some((id) => draftIds.includes(id));

    useEffect(() => {
      setDraftIds(selectedIds);
    }, [selectedIds.join(",")]);

    useEffect(() => {
      if (designerMode || !config.targetTableId) {
        setTable(null);
        setRecords([]);
        return;
      }

      let cancelled = false;
      setLoading(true);
      setError("");

      Promise.all([
        request(`/api/tables/${config.targetTableId}`),
        request(`/api/tables/${config.targetTableId}/records`),
      ])
        .then(([tableDetails, recordList]) => {
          if (!cancelled) {
            setTable(tableDetails);
            setRecords(recordList);
          }
        })
        .catch((loadError) => {
          if (!cancelled) setError(loadError.message || "Failed to load reference records");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [config.targetTableId, designerMode]);

    function toggleId(id, checked) {
      setDraftIds((current) => {
        const next = new Set(current);
        if (checked) next.add(Number(id));
        else next.delete(Number(id));
        return Array.from(next);
      });
    }

    function commit() {
      onChange?.(parseIds(draftIds));
      setOpen(false);
    }

    if (designerMode) {
      return h(
        "div",
        { className: "text-muted small" },
        "Reference field (designer mode)",
      );
    }
    return h(
      "div",
      { className: "reference-field" },
      h(
        "button",
        {
          type: "button",
          className: "btn btn-outline-secondary btn-sm reference-field-trigger",
          disabled: disabled || !config.targetTableId,
          onClick: () => setOpen(true),
        },
        label,
      ),
      open &&
        h(
          "div",
          { className: "reference-modal-backdrop", onClick: () => setOpen(false) },
          h(
            "div",
            { className: "reference-modal-panel", onClick: (event) => event.stopPropagation() },
            h("div", { className: "reference-modal-header" }, h("h5", null, table?.name || "Select records")),
            h(
              "div",
              { className: "reference-modal-body" },
              error && h("div", { className: "alert alert-danger py-2" }, error),
              loading
                ? h("div", { className: "text-muted" }, "Loading...")
                : h(
                    "table",
                    { className: "table table-sm align-middle" },
                    h(
                      "thead",
                      null,
                      h(
                        "tr",
                        null,
                        h(
                          "th",
                          { style: { width: 44 } },
                          h("input", {
                            type: "checkbox",
                            checked: allSelected,
                            ref: (el) => {
                              if (el) {
                                el.indeterminate = !allSelected && someSelected;
                              }
                            },
                            onChange: (event) => {
                              setDraftIds(event.target.checked ? allIds : []);
                            },
                          }),
                        ),
                        h("th", null, displayColumn?.name || "Record"),
                      ),
                    ),
                    h(
                      "tbody",
                      null,
                      records.length
                        ? records.map((record) =>
                            h(
                              "tr",
                              { key: record.id },
                              h(
                                "td",
                                null,
                                h("input", {
                                  type: "checkbox",
                                  checked: draftIds.includes(Number(record.id)),
                                  onChange: (event) => toggleId(record.id, event.target.checked),
                                }),
                              ),
                              h("td", null, getRecordDisplay(record, displayColumn)),
                            ),
                          )
                        : h("tr", null, h("td", { colSpan: 2, className: "text-muted" }, "No records")),
                    ),
                  ),
            ),
            h(
              "div",
              { className: "reference-modal-footer" },
              h("button", { type: "button", className: "btn btn-secondary", onClick: () => setOpen(false) }, "Cancel"),
              h("button", { type: "button", className: "btn btn-primary", onClick: commit }, "Use selected"),
            ),
          ),
        ),
    );
  }

  function ReferenceDisplay({ value, componentPropsJson, targetTableId, displayColumnId }) {
    const config = {
      ...parseProps(componentPropsJson),
      ...(targetTableId != null ? { targetTableId } : {}),
      ...(displayColumnId != null ? { displayColumnId } : {}),
    };
    const ids = useMemo(() => parseIds(value), [value]);
    const [labels, setLabels] = useState([]);

    useEffect(() => {
      if (!config.targetTableId || !ids.length) {
        setLabels([]);
        return;
      }

      let cancelled = false;
      Promise.all([
        request(`/api/tables/${config.targetTableId}`),
        request(`/api/tables/${config.targetTableId}/records`),
      ]).then(([table, records]) => {
        if (cancelled) return;
        const displayColumn = (table.columns || []).find((column) => Number(column.id) === Number(config.displayColumnId));
        setLabels(ids.map((id) => getRecordDisplay(records.find((record) => Number(record.id) === Number(id)), displayColumn)));
      }).catch(() => {
        if (!cancelled) setLabels(ids.map((id) => `#${id}`));
      });

      return () => {
        cancelled = true;
      };
    }, [config.targetTableId, config.displayColumnId, ids.join(",")]);

    if (!ids.length) return "";
    return labels.length ? labels.join(", ") : `${ids.length} selected`;
  }

  window.Notcobase.ReferenceField = {
    parseProps,
    parseIds,
    stringifyIds,
    ReferencePicker,
    ReferenceTablePicker,
    ReferenceDisplay,
  };
})(window, React);
