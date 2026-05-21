(function (app, React) {
const h = React.createElement;
const { Modal, api } = app;
const { useEffect, useState } = React;

function ImportDatabaseModal({ isOpen, file, onFileChange, onSubmit, onClose, saving }) {
  if (!isOpen) return null;
  const [previewTables, setPreviewTables] = useState([]);
  const [selectedTables, setSelectedTables] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreviewTables([]);
      setSelectedTables([]);
      setPreviewError(null);
      return;
    }

    const fetchPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const tables = await api("/tables/import-external-database/preview", {
          method: "POST",
          body: formData,
        });

        setPreviewTables(tables || []);
        setSelectedTables((tables || []).map((table) => table.sourceName));
      } catch (error) {
        setPreviewTables([]);
        setSelectedTables([]);
        setPreviewError(error?.message || "Unable to preview database tables.");
      } finally {
        setPreviewLoading(false);
      }
    };

    fetchPreview();
  }, [file]);

  const toggleTableSelection = (sourceName) => {
    setSelectedTables((current) =>
      current.includes(sourceName)
        ? current.filter((name) => name !== sourceName)
        : [...current, sourceName],
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!file || selectedTables.length === 0) return;
    onSubmit(event, selectedTables);
  };

  return h(
    Modal,
    { title: "Import external database", onClose },
    h(
      "form",
      { onSubmit: handleSubmit },
      h(
        "div",
        { className: "modal-body" },
        h("label", { className: "form-label" }, "SQLite database file"),
        h("input", {
          className: "form-control mb-2",
          type: "file",
          accept: ".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/octet-stream",
          required: true,
          onChange: (event) => onFileChange(event.target.files?.[0] || null),
        }),
        h(
          "div",
          { className: "form-text mb-3" },
          "Select the tables you want to import from the uploaded SQLite file.",
        ),
        previewError && h("div", { className: "alert alert-danger" }, previewError),
        file &&
          h(
            "div",
            { className: "mb-3" },
            previewLoading
              ? h("div", { className: "text-muted" }, "Analyzing database tables...")
              : previewTables.length > 0
              ? h(
                  "div",
                  { className: "border rounded p-2" },
                  h("div", { className: "mb-2 fw-semibold" }, "Tables found:"),
                  previewTables.map((table) =>
                    h(
                      "label",
                      { key: table.sourceName, className: "d-flex align-items-center mb-1" },
                      h("input", {
                        type: "checkbox",
                        className: "form-check-input me-2",
                        checked: selectedTables.includes(table.sourceName),
                        onChange: () => toggleTableSelection(table.sourceName),
                      }),
                      `${table.sourceName} (${table.columnCount} fields, ${table.recordCount} rows)`,
                    ),
                  ),
                )
              : !previewLoading && h("div", { className: "text-muted" }, "No importable tables were found in the database."),
          ),
      ),
      h(
        "div",
        { className: "modal-footer" },
        h("button", { type: "button", className: "btn btn-secondary", onClick: onClose }, "Cancel"),
        h(
          "button",
          {
            className: "btn btn-primary",
            disabled: saving || !file || previewLoading || selectedTables.length === 0,
          },
          saving ? "Importing..." : "Import",
        ),
      ),
    ),
  );
}

app.ImportDatabaseModal = ImportDatabaseModal;
})(window.Notcobase, React);
