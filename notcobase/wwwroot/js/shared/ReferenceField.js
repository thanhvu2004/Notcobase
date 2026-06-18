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

  function stringifyReferenceValue(value, config) {
    const parsedConfig = parseProps(config);
    if (getRelationshipMode(parsedConfig) === "related") {
      return JSON.stringify(normalizeRelatedValue(value).ids);
    }

    return stringifyIds(value);
  }

  function getRecordId(record) {
    const value = record?.id ?? record?.value?.id ?? record?.Value?.id;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
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
    if (displayColumn.name === "id") return `#${record.id}`;
    const value = record.data?.[displayColumn.name];
    return value == null || value === "" ? `#${record.id}` : String(value);
  }

  function getDisplayColumn(table, config) {
    if (!config.displayColumnId || config.displayColumnId === "id") {
      return { name: "id" };
    }

    return (table?.columns || []).find((column) => Number(column.id) === Number(config.displayColumnId)) || { name: "id" };
  }

  function isHiddenColumn(column) {
    const props = parseProps(column?.componentPropsJson);
    return props.hiddenInForms === true || props.type === "parent-link";
  }

  function getVisibleColumns(columns) {
    return (columns || []).filter((column) => !isHiddenColumn(column));
  }

  function getRelationshipMode(config) {
    return config.relationshipMode === "related" ? "related" : "lookup";
  }

  function getParentRecordId(config, parentRecordId) {
    const value = parentRecordId ?? config.parentRecordId;
    return value == null || value === "" ? null : Number(value);
  }

  function getParentFieldName(config) {
    return String(config.parentFieldName || config.sourceFieldName || "").trim();
  }

  function getSourceFieldName(config) {
    return String(config.sourceFieldName || "").trim();
  }

  function normalizeRelatedValue(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return {
        ids: parseIds(value.ids),
        drafts: Array.isArray(value.drafts) ? value.drafts : [],
      };
    }

    return { ids: parseIds(value), drafts: [] };
  }

  async function saveRelatedDrafts(value, config, parentRecordId) {
    const mode = getRelationshipMode(config);
    const targetTableId = config?.targetTableId;
    const parentFieldName = getParentFieldName(config);
    const resolvedParentId = getParentRecordId(config, parentRecordId);
    const relatedValue = normalizeRelatedValue(value);

    if (mode !== "related" || !targetTableId || !parentFieldName || !resolvedParentId || !relatedValue.drafts.length) {
      return relatedValue.ids;
    }

    const createdIds = [];
    for (const draft of relatedValue.drafts) {
      const payload = {
        ...(draft || {}),
        [parentFieldName]: resolvedParentId,
      };
      const created = await request(`/api/tables/${targetTableId}/records`, {
        method: "POST",
        body: JSON.stringify({ data: payload }),
      });
      const createdId = getRecordId(created);
      if (createdId) {
        createdIds.push(createdId);
      }
    }

    return [...relatedValue.ids, ...createdIds];
  }

  async function ensureParentLinkColumn(config) {
    const mode = getRelationshipMode(config);
    const targetTableId = config?.targetTableId;
    const parentFieldName = getParentFieldName(config);

    if (mode !== "related" || !targetTableId || !parentFieldName) {
      return null;
    }

    const table = await request(`/api/tables/${targetTableId}`);
    const existing = (table?.columns || []).find((column) => (
      String(column.name || "").toLowerCase() === parentFieldName.toLowerCase()
    ));

    if (existing) {
      const existingProps = parseProps(existing.componentPropsJson);
      const nextProps = {
        ...existingProps,
        type: "parent-link",
        hiddenInForms: true,
      };

      if (
        existing.tableId === Number(targetTableId) &&
        (
          String(existing.fieldType || "").toLowerCase() !== "number"
          || existing.isRequired
          || existingProps.type !== "parent-link"
          || existingProps.hiddenInForms !== true
        )
      ) {
        await request(`/api/tables/${targetTableId}/columns/${existing.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: existing.name,
            fieldType: "number",
            isRequired: false,
            componentPropsJson: JSON.stringify(nextProps),
          }),
        });

        return {
          ...existing,
          fieldType: "number",
          isRequired: false,
          componentPropsJson: JSON.stringify(nextProps),
        };
      }

      return existing;
    }

    return request(`/api/tables/${targetTableId}/columns`, {
      method: "POST",
      body: JSON.stringify({
        name: parentFieldName,
        fieldType: "number",
        isRequired: false,
        componentPropsJson: JSON.stringify({
          type: "parent-link",
          hiddenInForms: true,
        }),
      }),
    });
  }

  async function cleanupParentLinkColumn(config) {
    const mode = getRelationshipMode(config);
    const targetTableId = config?.targetTableId;
    const parentFieldName = getParentFieldName(config);

    if (mode !== "related" || !targetTableId || !parentFieldName) {
      return false;
    }

    const targetTable = await request(`/api/tables/${targetTableId}`);
    const linkColumn = (targetTable?.columns || []).find((column) => {
      const props = parseProps(column.componentPropsJson);
      return Number(column.tableId) === Number(targetTableId) &&
        String(column.name || "").toLowerCase() === parentFieldName.toLowerCase() &&
        props.type === "parent-link";
    });

    if (!linkColumn) {
      return false;
    }

    const tables = await request("/api/tables");
    const tableDetails = await Promise.all((tables || []).map((table) => (
      request(`/api/tables/${table.id}`).catch(() => null)
    )));

    const stillUsed = tableDetails.some((table) => (table?.columns || []).some((column) => {
      if (Number(column.id) === Number(config.sourceColumnId)) {
        return false;
      }

      const props = parseProps(column.componentPropsJson);
      return String(column.fieldType || "").toLowerCase() === "reference" &&
        getRelationshipMode(props) === "related" &&
        Number(props.targetTableId) === Number(targetTableId) &&
        getParentFieldName({ ...props, sourceFieldName: column.name }).toLowerCase() === parentFieldName.toLowerCase();
    }));

    if (stillUsed) {
      return false;
    }

    await request(`/api/tables/${targetTableId}/columns/${linkColumn.id}`, { method: "DELETE" });
    return true;
  }

  function renderBasicFieldInput(field, value, onChange) {
    const type = String(field.fieldType || "text").toLowerCase();
    const componentProps = parseProps(field.componentPropsJson);
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

    if (type === "select") {
      return h(
        "select",
        { ...common, className: "form-control" },
        h("option", { value: "" }, "-- Select --"),
        (componentProps.options || []).map((option) => {
          const optionValue = typeof option === "object" ? option.value : option;
          const optionLabel = typeof option === "object" ? option.label : option;
          return h("option", { key: optionValue, value: optionValue }, optionLabel);
        }),
      );
    }

    if (type === "reference") {
      return h(ReferencePicker, {
        value,
        componentPropsJson: field.componentPropsJson,
        pickerVariant: componentProps.relationshipMode === "related" ? "table" : undefined,
        onChange,
      });
    }

    if (type === "list") {
      return h("input", {
        className: "form-control",
        value: Array.isArray(value) ? value.join(", ") : (value ?? ""),
        placeholder: "Comma-separated values",
        onChange: (event) => onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean)),
      });
    }

    if (type === "file") {
      return h("input", {
        className: "form-control",
        type: "file",
        onChange: (event) => onChange(event.target.files?.[0]?.name || ""),
      });
    }

    return h("input", {
      ...common,
      className: "form-control",
      type: type === "number" || type === "finance" ? "number" : type === "date" ? "date" : type === "url" ? "url" : "text",
    });
  }

  function ReferenceTablePicker({ value, onChange, config, disabled, designerMode, parentRecordId }) {
    const mode = getRelationshipMode(config);
    const parentId = getParentRecordId(config, parentRecordId);
    const parentFieldName = getParentFieldName(config);
    const relatedValue = useMemo(() => normalizeRelatedValue(value), [value]);
    const selectedIds = mode === "related" ? relatedValue.ids : parseIds(value);
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
      () => getDisplayColumn(table, config),
      [table, config.displayColumnId],
    );

    const allIds = useMemo(
      () => records.map((record) => Number(record.id)),
      [records],
    );

    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
    const someSelected = allIds.some((id) => selectedIds.includes(id));

    function emitValue(ids, drafts = relatedValue.drafts) {
      const nextIds = parseIds(ids);
      if (mode === "related") {
        onChange?.({
          ids: nextIds,
          drafts,
        });
        return;
      }

      onChange?.(nextIds);
    }

    function toggleAll(checked) {
      emitValue(checked ? allIds : []);
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
      if (mode === "related" && (!parentFieldName || !parentId)) {
        const tableDetails = await request(`/api/tables/${config.targetTableId}`);
        setTable(tableDetails);
        setRecords([]);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const [tableDetails, recordList] = await Promise.all([
          request(`/api/tables/${config.targetTableId}`),
          request(`/api/tables/${config.targetTableId}/records${mode === "related" && parentFieldName && parentId ? `?filterField=${encodeURIComponent(parentFieldName)}&filterValue=${encodeURIComponent(parentId)}` : ""}`),
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
    }, [config.targetTableId, designerMode, mode, parentFieldName, parentId]);

    function toggleId(id, checked) {
      const next = new Set(selectedIds);
      if (checked) next.add(Number(id));
      else next.delete(Number(id));
      emitValue(Array.from(next));
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
      if (mode === "related" && !parentFieldName) {
        setError("Configure a parent link field before creating related records.");
        return;
      }

      if (mode === "related" && !parentId) {
        emitValue(selectedIds, [...relatedValue.drafts, draft]);
        setDraft({});
        setModalOpen(false);
        return;
      }

      try {
        setLoading(true);
        const payload = mode === "related" && parentFieldName && parentId
          ? { ...draft, [parentFieldName]: parentId }
          : draft;
        if (editingRecord?.id) {
          await request(`/api/tables/${config.targetTableId}/records/${editingRecord.id}`, {
            method: "PUT",
            body: JSON.stringify({ data: payload }),
          });
        } else {
          const created = await request(`/api/tables/${config.targetTableId}/records`, {
            method: "POST",
            body: JSON.stringify({ data: payload }),
          });
          const createdId = getRecordId(created);
          if (mode === "related" && createdId) {
            const nextIds = [...selectedIds, createdId];
            emitValue(nextIds);
            const sourceFieldName = getSourceFieldName(config);
            if (config.parentTableId && parentId && sourceFieldName) {
              await request(`/api/tables/${config.parentTableId}/records/${parentId}`, {
                method: "PUT",
                body: JSON.stringify({
                  data: {
                    [sourceFieldName]: stringifyReferenceValue({ ids: nextIds, drafts: [] }, config),
                  },
                }),
              });
            }
          }
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
    const visibleTableColumns = getVisibleColumns(table?.columns || []);
    const dataColumns = designerMode
      ? []
      : visibleTableColumns.map((column) => ({
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
        mode === "related" ? "Related records field (designer mode)" : "Reference table field (designer mode)",
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
      visibleTableColumns.map((column) =>
        h(
          "div",
          { key: column.id || column.name, className: "mb-3" },
          h("label", { className: "form-label" }, column.name, column.isRequired && h("span", { className: "text-danger" }, " *")),
          renderBasicFieldInput(column, draft[column.name], (nextValue) => setDraft((current) => ({ ...current, [column.name]: nextValue }))),
        ),
      ),
    );

    return h(
      "div",
      { className: "reference-table-picker" },
      error && h("div", { className: "alert alert-danger py-2" }, error),
      mode === "related" && !parentId && h("div", { className: "text-muted small mb-2" }, `${relatedValue.drafts.length} new related record${relatedValue.drafts.length === 1 ? "" : "s"} will be created after the parent record is saved.`),
      h(
        "div",
        { className: "reference-table-picker-toolbar" },
        h("span", { className: "text-muted small" }, mode === "related" ? `${records.length + relatedValue.drafts.length} related` : `${selectedIds.length} selected`),
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

  function ReferencePicker({ value, onChange, componentPropsJson, targetTableId, displayColumnId, pickerVariant, disabled, placeholder, designerMode, parentRecordId, parentTableId, sourceFieldName, parentFieldName, relationshipMode, runtimeContext }) {
    const config = {
      ...parseProps(componentPropsJson),
      ...(targetTableId != null ? { targetTableId } : {}),
      ...(displayColumnId != null ? { displayColumnId } : {}),
      ...(parentTableId != null ? { parentTableId } : {}),
      ...(runtimeContext?.tableId != null && parentTableId == null ? { parentTableId: runtimeContext.tableId } : {}),
      ...(sourceFieldName ? { sourceFieldName } : {}),
      ...(parentFieldName ? { parentFieldName } : {}),
      ...(relationshipMode ? { relationshipMode } : {}),
    };
    const mode = getRelationshipMode(config);
    const resolvedParentRecordId = getParentRecordId(config, parentRecordId ?? runtimeContext?.recordId);

    if (mode === "related" || pickerVariant === "table") {
      return h(ReferenceTablePicker, { value, onChange, config, disabled, designerMode, parentRecordId: resolvedParentRecordId });
    }

    const selectedIds = useMemo(() => parseIds(value), [value]);
    const [open, setOpen] = useState(false);
    const [table, setTable] = useState(null);
    const [records, setRecords] = useState([]);
    const [draftIds, setDraftIds] = useState(selectedIds);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const displayColumn = useMemo(
      () => getDisplayColumn(table, config),
      [table, config.displayColumnId],
    );

    const label = useMemo(() => {
      if (mode === "related") return placeholder || "Manage related records";
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
      if (designerMode || !config.targetTableId || (mode === "related" && (!resolvedParentRecordId || !getParentFieldName(config)))) {
        setTable(null);
        setRecords([]);
        return;
      }

      let cancelled = false;
      setLoading(true);
      setError("");

      Promise.all([
        request(`/api/tables/${config.targetTableId}`),
        request(`/api/tables/${config.targetTableId}/records${mode === "related" ? `?filterField=${encodeURIComponent(getParentFieldName(config))}&filterValue=${encodeURIComponent(resolvedParentRecordId || "")}` : ""}`),
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
    }, [config.targetTableId, designerMode, mode, resolvedParentRecordId]);

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

  function ReferenceDisplay({ value, componentPropsJson, targetTableId, displayColumnId, parentRecordId, runtimeContext }) {
    const config = {
      ...parseProps(componentPropsJson),
      ...(targetTableId != null ? { targetTableId } : {}),
      ...(displayColumnId != null ? { displayColumnId } : {}),
    };
    const mode = getRelationshipMode(config);
    const resolvedParentRecordId = getParentRecordId(config, parentRecordId ?? runtimeContext?.recordId);
    const ids = useMemo(() => mode === "related" ? normalizeRelatedValue(value).ids : parseIds(value), [value, mode]);
    const [labels, setLabels] = useState([]);

    useEffect(() => {
      if (!config.targetTableId || (!ids.length && mode !== "related")) {
        setLabels([]);
        return;
      }
      if (mode === "related" && (!getParentFieldName(config) || !resolvedParentRecordId)) {
        setLabels([]);
        return;
      }

      let cancelled = false;
      Promise.all([
        request(`/api/tables/${config.targetTableId}`),
        request(`/api/tables/${config.targetTableId}/records${mode === "related" && getParentFieldName(config) && resolvedParentRecordId ? `?filterField=${encodeURIComponent(getParentFieldName(config))}&filterValue=${encodeURIComponent(resolvedParentRecordId)}` : ""}`),
      ]).then(([table, records]) => {
        if (cancelled) return;
        const displayColumn = getDisplayColumn(table, config);
        const visibleRecords = mode === "related" && !ids.length ? records : ids.map((id) => records.find((record) => Number(record.id) === Number(id))).filter(Boolean);
        setLabels(visibleRecords.map((record) => getRecordDisplay(record, displayColumn)));
      }).catch(() => {
        if (!cancelled) setLabels(ids.map((id) => `#${id}`));
      });

      return () => {
        cancelled = true;
      };
    }, [config.targetTableId, config.displayColumnId, mode, resolvedParentRecordId, ids.join(",")]);

    if (!ids.length && mode !== "related") return "";
    return labels.length ? labels.join(", ") : `${ids.length} selected`;
  }

  window.Notcobase.ReferenceField = {
    parseProps,
    parseIds,
    getRecordId,
    stringifyIds,
    stringifyReferenceValue,
    saveRelatedDrafts,
    ensureParentLinkColumn,
    cleanupParentLinkColumn,
    normalizeRelatedValue,
    ReferencePicker,
    ReferenceTablePicker,
    ReferenceDisplay,
  };
})(window, React);
