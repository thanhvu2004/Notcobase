(function (app, React) {
const h = React.createElement;
const { useEffect, useMemo, useState } = React;
const { Modal, TableOperations } = app;

function ReferenceModal({ isOpen, column, tables, onSave, onClose }) {
  const [targetTableId, setTargetTableId] = useState("");
  const [relationshipMode, setRelationshipMode] = useState("lookup");
  const [parentFieldName, setParentFieldName] = useState("");
  const [targetColumns, setTargetColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const config = useMemo(() => app.ReferenceField.parseProps(column?.componentPropsJson), [column]);

  useEffect(() => {
    if (!isOpen) return;
    setTargetTableId(config.targetTableId ? String(config.targetTableId) : "");
    setRelationshipMode(config.relationshipMode === "related" ? "related" : "lookup");
    setParentFieldName(config.parentFieldName || column?.name || "");
    setError("");
  }, [isOpen, config.targetTableId, config.relationshipMode, config.parentFieldName, column?.name]);

  useEffect(() => {
    if (!isOpen || !targetTableId) {
      setTargetColumns([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    TableOperations.fetchTableDetails(targetTableId)
      .then(({ columns }) => {
        if (!cancelled) {
          setTargetColumns(columns || []);
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "Failed to load columns");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetTableId]);

  if (!isOpen || !column) return null;

  async function submit(event) {
    event.preventDefault();
    if (!targetTableId || (relationshipMode === "related" && !parentFieldName.trim())) return;

    const nextConfig = {
      type: "reference",
      targetTableId: Number(targetTableId),
      displayColumnId: "id",
      relationshipMode,
      parentFieldName: relationshipMode === "related" ? parentFieldName.trim() : "",
    };

    try {
      setLoading(true);
      setError("");
      await app.ReferenceField.ensureParentLinkColumn(nextConfig);
      onSave(JSON.stringify(nextConfig));
    } catch (saveError) {
      setError(saveError.message || "Failed to create parent link field");
    } finally {
      setLoading(false);
    }
  }

  return h(
    Modal,
    { title: `Configure reference ${column.name}`, onClose },
    h(
      "form",
      { onSubmit: submit },
      h(
        "div",
        { className: "modal-body" },
        error && h("div", { className: "alert alert-danger py-2" }, error),
        h("label", { className: "form-label" }, "Target table"),
        h(
          "select",
          {
            className: "form-select mb-3",
            required: true,
            value: targetTableId,
            onChange: (event) => setTargetTableId(event.target.value),
          },
          h("option", { value: "" }, "Select table"),
          (tables || []).map((table) => h("option", { key: table.id, value: table.id }, table.name)),
        ),
        h("label", { className: "form-label" }, "Relationship mode"),
        h(
          "select",
          {
            className: "form-select mb-3",
            required: true,
            value: relationshipMode,
            onChange: (event) => setRelationshipMode(event.target.value),
          },
          h("option", { value: "lookup" }, "Lookup mode"),
          h("option", { value: "related" }, "Related record mode"),
        ),
        relationshipMode === "related" && h(React.Fragment, null,
          h("label", { className: "form-label" }, "Parent link field on target table"),
          h("input", {
            className: "form-control",
            required: true,
            value: parentFieldName,
            placeholder: column.name,
            onChange: (event) => setParentFieldName(event.target.value),
          }),
          targetTableId && !loading && !targetColumns.some((item) => item.name.toLowerCase() === parentFieldName.toLowerCase()) &&
            h("div", { className: "form-text" }, "This field will be created on the target table when you save."),
        ),
        h("div", { className: "form-text mt-3" }, "Display defaults to the target record id."),
      ),
      h(
        "div",
        { className: "modal-footer" },
        h("button", { type: "button", className: "btn btn-secondary", onClick: onClose }, "Cancel"),
        h("button", { className: "btn btn-primary", disabled: !targetTableId || (relationshipMode === "related" && !parentFieldName.trim()) }, "Save reference"),
      ),
    ),
  );
}

app.ReferenceModal = ReferenceModal;
})(window.Notcobase, React);
