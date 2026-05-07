(function (app, React) {
const h = React.createElement;

function TablesList({ tables, selectedTableId, loading, onSelectTable }) {
  return h(
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
                  onClick: () => onSelectTable(table),
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
  );
}

app.TablesList = TablesList;
})(window.Notcobase, React);
