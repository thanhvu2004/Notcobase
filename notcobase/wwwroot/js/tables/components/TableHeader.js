(function (app, React) {
const h = React.createElement;

function TableHeader({ activeTable, onEdit, onDelete, onAddRecord, disableAddRecord }) {
  return h(
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
          className: "btn btn-outline-secondary",
          onClick: onEdit,
        },
        "Edit table",
      ),
      h(
        "button",
        {
          className: "btn btn-outline-danger btn-sm",
          onClick: onDelete,
        },
        "Delete table",
      ),
      h(
        "button",
        {
          className: "btn btn-success btn-sm",
          disabled: disableAddRecord,
          onClick: onAddRecord,
        },
        "Add record",
      ),
    ),
  );
}

app.TableHeader = TableHeader;
})(window.Notcobase, React);
