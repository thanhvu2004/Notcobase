(function (app, React) {
const h = React.createElement;

function TableStats({ columnsCount, recordsCount, totalRecords }) {
  return h(
    "div",
    { className: "col-xl-7" },
    h(
      "div",
      { className: "border rounded p-3 h-100" },
      h("h3", { className: "h6 mb-3" }, "Table stats"),
      h(
        "div",
        { className: "row text-center" },
        h("div", { className: "col" }, h("div", { className: "h4 mb-0" }, columnsCount), h("small", { className: "text-muted" }, "Fields")),
        h("div", { className: "col" }, h("div", { className: "h4 mb-0" }, recordsCount), h("small", { className: "text-muted" }, "Loaded records")),
        h("div", { className: "col" }, h("div", { className: "h4 mb-0" }, totalRecords), h("small", { className: "text-muted" }, "Total records")),
      ),
    ),
  );
}

app.TableStats = TableStats;
})(window.Notcobase, React);
