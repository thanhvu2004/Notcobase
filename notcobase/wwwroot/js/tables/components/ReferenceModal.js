(function (app, React) {
const h = React.createElement;
const { useEffect, useMemo, useState } = React;
const { Modal, TableOperations } = app;

function ReferenceModal({ isOpen, column, tables, onSave, onClose }) {
  const [targetTableId, setTargetTableId] = useState("");
  const [displayColumnId, setDisplayColumnId] = useState("");
  const [targetColumns, setTargetColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const config = useMemo(() => app.ReferenceField.parseProps(column?.componentPropsJson), [column]);

  useEffect(() => {
    if (!isOpen) return;
    setTargetTableId(config.targetTableId ? String(config.targetTableId) : "");
    setDisplayColumnId(config.displayColumnId ? String(config.displayColumnId) : "");
    setError("");
  }, [isOpen, config.targetTableId, config.displayColumnId]);

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

  useEffect(() => {
    if (targetColumns.length && !targetColumns.some((item) => String(item.id) === String(displayColumnId))) {
      setDisplayColumnId(String(targetColumns[0].id));
    }
  }, [targetColumns, displayColumnId]);

  if (!isOpen || !column) return null;

  function submit(event) {
    event.preventDefault();
    if (!targetTableId || !displayColumnId) return;

    onSave(JSON.stringify({
      type: "reference",
      targetTableId: Number(targetTableId),
      displayColumnId: Number(displayColumnId),
    }));
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
        h("label", { className: "form-label" }, "Display column"),
        h(
          "select",
          {
            className: "form-select",
            required: true,
            disabled: !targetTableId || loading || !targetColumns.length,
            value: displayColumnId,
            onChange: (event) => setDisplayColumnId(event.target.value),
          },
          h("option", { value: "" }, loading ? "Loading..." : "Select display column"),
          targetColumns.map((columnItem) => h("option", { key: columnItem.id, value: columnItem.id }, columnItem.name)),
        ),
      ),
      h(
        "div",
        { className: "modal-footer" },
        h("button", { type: "button", className: "btn btn-secondary", onClick: onClose }, "Cancel"),
        h("button", { className: "btn btn-primary", disabled: !targetTableId || !displayColumnId }, "Save reference"),
      ),
    ),
  );
}

app.ReferenceModal = ReferenceModal;
})(window.Notcobase, React);
