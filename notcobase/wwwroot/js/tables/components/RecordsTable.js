(function (app, React) {
const h = React.createElement;
const { formatRecordValue } = app;

function RecordsTable({ columns, records, onEditCell, onDeleteRecord }) {
  return h(
    "div",
    { className: "table-responsive border rounded" },
    columns.length === 0
      ? h("div", { className: "p-4 text-muted" }, "This table has no fields yet.")
      : h(
          "table",
          { className: "table table-bordered align-middle mb-0" },
          h(
            "thead",
            { className: "table-light" },
            h(
              "tr",
              null,
              columns.map((column) => h("th", { key: column.id }, column.name)),
              h("th", { className: "text-start", style: { width: 96 } }, "Actions"),
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
                      h(
                        "td",
                        {
                          key: column.id,
                          style: { minWidth: 160 },
                        },
                        h(
                          "button",
                          {
                            type: "button",
                            className: "btn btn-link text-start text-decoration-none p-0 w-100 pe-auto",
                            onClick: (event) => onEditCell(event, record, column),
                          },
                          formatRecordValue(record.data?.[column.name], column.fieldType) || h("span", { className: "text-muted" }, "Empty"),
                        ),
                      ),
                    ),
                    h(
                      "td",
                      { className: "text-center" },
                      h(
                        "button",
                        {
                          className: "btn btn-sm btn-outline-danger",
                          onClick: () => onDeleteRecord(record),
                        },
                        "Delete",
                      ),
                    ),
                  ),
                ),
          ),
        ),
  );
}

app.RecordsTable = RecordsTable;
})(window.Notcobase, React);
