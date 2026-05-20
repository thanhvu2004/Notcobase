(function (app, React) {
const h = React.createElement;
const { Modal } = app;

function ImportDatabaseModal({ isOpen, file, onFileChange, onSubmit, onClose, saving }) {
  if (!isOpen) return null;

  return h(
    Modal,
    { title: "Import external database", onClose },
    h(
      "form",
      { onSubmit },
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
          { className: "form-text" },
          "Imports each user table as a Notcobase table with matching fields and rows.",
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
            disabled: saving || !file,
          },
          saving ? "Importing..." : "Import",
        ),
      ),
    ),
  );
}

app.ImportDatabaseModal = ImportDatabaseModal;
})(window.Notcobase, React);
