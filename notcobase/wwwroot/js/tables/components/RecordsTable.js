(function (app, React) {
const h = React.createElement;
const { formatRecordValue } = app;
const { useEffect, useMemo, useState } = React;

function can(permission) {
  if (!permission) {
    return true;
  }

  return window.Auth?.hasPermission(permission);
}

function withPermission(permission, component) {
  return can(permission) ? component : null;
}

function getColumnKey(column) {
  return String(column.id ?? column.name);
}

function getComparableValue(record, column) {
  const value = record.data?.[column.name];

  if (column.fieldType === "number") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (column.fieldType === "date") {
    const timestamp = value ? Date.parse(value) : NaN;
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (column.fieldType === "checkbox") {
    return value === true || value === "true" || value === "1" || value === 1;
  }

  return formatRecordValue(value, column.fieldType).toLowerCase();
}

function compareRecordValues(left, right, column) {
  const leftValue = getComparableValue(left, column);
  const rightValue = getComparableValue(right, column);

  if (leftValue === null || leftValue === "") {
    return rightValue === null || rightValue === "" ? 0 : 1;
  }

  if (rightValue === null || rightValue === "") {
    return -1;
  }

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  if (typeof leftValue === "boolean" && typeof rightValue === "boolean") {
    return Number(leftValue) - Number(rightValue);
  }

  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
}

function ColumnHeaderMenu({
  column,
  columnKey,
  sortState,
  onOpenMenu,
}) {
  const isSorted = sortState.columnKey === columnKey;

  return h(
    "button",
    {
      type: "button",
      className: `btn btn-sm records-column-menu-toggle ${isSorted ? "is-active" : ""}`,
      "aria-label": `${column.name} column options`,
      title: `${column.name} column options`,
      onClick: (event) => onOpenMenu(columnKey, event),
    },
    "⋮",
  );
}

function RecordsTable({ columns, records, onEditCell, onDeleteRecord }) {
  const [sortState, setSortState] = useState({ columnKey: null, direction: null });
  const [filters, setFilters] = useState({});
  const [hiddenColumns, setHiddenColumns] = useState({});
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);

  const columnKeys = useMemo(() => columns.map(getColumnKey), [columns]);
  const columnSignature = columnKeys.join("|");

  useEffect(() => {
    const validKeys = new Set(columnKeys);

    setFilters((current) => {
      const next = {};
      Object.entries(current).forEach(([key, value]) => {
        if (validKeys.has(key) && value) {
          next[key] = value;
        }
      });
      return next;
    });

    setHiddenColumns((current) => {
      const next = {};
      Object.entries(current).forEach(([key, value]) => {
        if (validKeys.has(key) && value) {
          next[key] = value;
        }
      });
      return next;
    });

    setSortState((current) => validKeys.has(current.columnKey) ? current : { columnKey: null, direction: null });
  }, [columnSignature]);

  useEffect(() => {
    if (!activeMenu) {
      return undefined;
    }

    function handleWindowChange() {
      setActiveMenu(null);
    }

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [activeMenu]);

  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumns[getColumnKey(column)]),
    [columns, hiddenColumns],
  );

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const displayRecords = useMemo(() => {
    const filteredRecords = records.filter((record) =>
      columns.every((column) => {
        const filterValue = filters[getColumnKey(column)];

        if (!filterValue) {
          return true;
        }

        return formatRecordValue(record.data?.[column.name], column.fieldType)
          .toLowerCase()
          .includes(filterValue.toLowerCase());
      }),
    );

    if (!sortState.columnKey || !sortState.direction) {
      return filteredRecords;
    }

    const sortColumn = columns.find((column) => getColumnKey(column) === sortState.columnKey);
    if (!sortColumn) {
      return filteredRecords;
    }

    return [...filteredRecords].sort((left, right) => {
      const result = compareRecordValues(left, right, sortColumn);
      return sortState.direction === "asc" ? result : -result;
    });
  }, [columns, filters, records, sortState]);

  function setColumnSort(columnKey, direction) {
    setSortState((current) =>
      current.columnKey === columnKey && current.direction === direction
        ? { columnKey: null, direction: null }
        : { columnKey, direction },
    );
  }

  function toggleQuickSort(columnKey) {
    setSortState((current) => {
      if (current.columnKey !== columnKey) {
        return { columnKey, direction: "asc" };
      }

      if (current.direction === "asc") {
        return { columnKey, direction: "desc" };
      }

      return { columnKey: null, direction: null };
    });
  }

  function setColumnFilter(columnKey, value) {
    setFilters((current) => ({
      ...current,
      [columnKey]: value,
    }));
  }

  function clearColumn(columnKey) {
    setFilters((current) => {
      const next = { ...current };
      delete next[columnKey];
      return next;
    });

    setSortState((current) => current.columnKey === columnKey ? { columnKey: null, direction: null } : current);
  }

  function hideColumn(columnKey) {
    if (visibleColumns.length <= 1) {
      return;
    }

    setHiddenColumns((current) => ({ ...current, [columnKey]: true }));
  }

  function toggleColumn(columnKey, checked) {
    if (!checked && visibleColumns.length <= 1) {
      return;
    }

    setHiddenColumns((current) => {
      const next = { ...current };

      if (checked) {
        delete next[columnKey];
      } else {
        next[columnKey] = true;
      }

      return next;
    });
  }

  function showAllColumns() {
    setHiddenColumns({});
  }

  function clearAllControls() {
    setSortState({ columnKey: null, direction: null });
    setFilters({});
    setHiddenColumns({});
  }

  function openColumnMenu(columnKey, event) {
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 232;
    const left = Math.min(rect.left, window.innerWidth - menuWidth - 8);

    setActiveMenu((current) =>
      current?.columnKey === columnKey
        ? null
        : {
            columnKey,
            left: Math.max(8, left),
            top: rect.bottom + 6,
            width: menuWidth,
          },
    );
  }

  function closeColumnMenu() {
    setActiveMenu(null);
  }

  function runMenuAction(action) {
    action();
    closeColumnMenu();
  }

  function renderActiveColumnMenu() {
    if (!activeMenu || !window.ReactDOM?.createPortal) {
      return null;
    }

    const column = columns.find((item) => getColumnKey(item) === activeMenu.columnKey);
    if (!column) {
      return null;
    }

    const columnKey = activeMenu.columnKey;
    const isSorted = sortState.columnKey === columnKey;
    const filterValue = filters[columnKey] || "";

    return window.ReactDOM.createPortal(
      h(
        React.Fragment,
        null,
        h("button", {
          type: "button",
          className: "records-column-menu-backdrop",
          "aria-label": "Close column menu",
          onClick: closeColumnMenu,
        }),
        h(
          "div",
          {
            className: "records-column-menu-panel",
            style: {
              left: activeMenu.left,
              top: activeMenu.top,
              width: activeMenu.width,
            },
            onClick: (event) => event.stopPropagation(),
          },
          h("div", { className: "records-column-menu-title" }, column.name),
          h(
            "button",
            {
              type: "button",
              className: `records-column-menu-item ${isSorted && sortState.direction === "asc" ? "active" : ""}`,
              onClick: () => runMenuAction(() => setColumnSort(columnKey, "asc")),
            },
            "Sort ascending",
          ),
          h(
            "button",
            {
              type: "button",
              className: `records-column-menu-item ${isSorted && sortState.direction === "desc" ? "active" : ""}`,
              onClick: () => runMenuAction(() => setColumnSort(columnKey, "desc")),
            },
            "Sort descending",
          ),
          h(
            "button",
            {
              type: "button",
              className: "records-column-menu-item",
              disabled: !isSorted && !filterValue,
              onClick: () => runMenuAction(() => clearColumn(columnKey)),
            },
            "Clear sort/filter",
          ),
          h("div", { className: "records-column-menu-divider" }),
          h("label", { className: "form-label records-column-filter-label", htmlFor: `filter-${columnKey}` }, "Filter"),
          h("input", {
            id: `filter-${columnKey}`,
            type: "search",
            className: "form-control form-control-sm",
            placeholder: "Contains...",
            value: filterValue,
            onChange: (event) => setColumnFilter(columnKey, event.target.value),
          }),
          h("div", { className: "records-column-menu-divider" }),
          h(
            "button",
            {
              type: "button",
              className: "records-column-menu-item",
              disabled: visibleColumns.length <= 1,
              onClick: () => runMenuAction(() => hideColumn(columnKey)),
            },
            "Hide column",
          ),
          h(
            "button",
            {
              type: "button",
              className: "records-column-menu-item",
              onClick: () => runMenuAction(() => setShowColumnManager(true)),
            },
            "Manage columns",
          ),
        ),
      ),
      document.body,
    );
  }

  return h(
    React.Fragment,
    null,
    h(
      "div",
      { className: "records-table-shell border rounded" },
      columns.length === 0
        ? withPermission("records.view", h("div", { className: "p-4 text-muted" }, "This table has no fields yet."))
        : withPermission("records.view", h(
        React.Fragment,
        null,
        h(
          "div",
          { className: "records-table-toolbar" },
          h("div", { className: "text-muted small" }, `${displayRecords.length} of ${records.length} records`, activeFilterCount > 0 && `, ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}`),
          h(
            "div",
            { className: "d-flex gap-2" },
            h(
              "button",
              {
                type: "button",
                className: "btn btn-sm btn-outline-secondary",
                onClick: clearAllControls,
                disabled: !sortState.columnKey && activeFilterCount === 0 && visibleColumns.length === columns.length,
              },
              "Reset view",
            ),
            h(
              "button",
              {
                type: "button",
                className: "btn btn-sm btn-outline-secondary",
                onClick: () => setShowColumnManager((value) => !value),
              },
              "Manage columns",
            ),
          ),
        ),
        showColumnManager && h(
          "div",
          { className: "records-column-manager" },
          h(
            "div",
            { className: "records-column-manager-header" },
            h("span", { className: "fw-semibold" }, "Columns"),
            h(
              "button",
              { type: "button", className: "btn btn-sm btn-link p-0", onClick: showAllColumns },
              "Show all",
            ),
          ),
          h(
            "div",
            { className: "records-column-manager-list" },
            columns.map((column) => {
              const columnKey = getColumnKey(column);
              const checked = !hiddenColumns[columnKey];

              return h(
                "label",
                { key: columnKey, className: "records-column-manager-item" },
                h("input", {
                  type: "checkbox",
                  className: "form-check-input",
                  checked,
                  disabled: checked && visibleColumns.length <= 1,
                  onChange: (event) => toggleColumn(columnKey, event.target.checked),
                }),
                h("span", null, column.name),
                h("span", { className: "badge text-bg-light" }, column.fieldType || "text"),
              );
            }),
          ),
        ),
        h(
          "div",
          { className: "table-responsive" },
          h(
          "table",
          { className: "table table-bordered align-middle mb-0" },
          h(
            "thead",
            { className: "table-light" },
            h(
              "tr",
              null,
              visibleColumns.map((column) => {
                const columnKey = getColumnKey(column);
                const sorted = sortState.columnKey === columnKey ? sortState.direction : null;
                const filtered = Boolean(filters[columnKey]);

                return h(
                  "th",
                  { key: columnKey, className: "records-table-heading" },
                  h(
                    "div",
                    { className: "records-table-heading-content" },
                    h("span", { className: "records-table-heading-label" }, column.name),
                    h(
                      "button",
                      {
                        type: "button",
                        className: `records-quick-sort ${sorted ? "is-active" : ""}`,
                        "aria-label": `Quick sort ${column.name}`,
                        title: sorted === "asc" ? "Sorted ascending. Click for descending." : sorted === "desc" ? "Sorted descending. Click to clear." : "Sort ascending",
                        onClick: () => toggleQuickSort(columnKey),
                      },
                      sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕",
                    ),
                    filtered && h("span", { className: "records-filter-indicator" }, "Filtered"),
                    h(ColumnHeaderMenu, {
                      column,
                      columnKey,
                      sortState,
                      onOpenMenu: openColumnMenu,
                    }),
                  ),
                );
              }),
              h("th", { className: "text-start", style: { width: 96 } }, "Actions"),
            ),
          ),
          h(
            "tbody",
            null,
            displayRecords.length === 0
              ? h("tr", null, h("td", { colSpan: visibleColumns.length + 1, className: "text-muted p-4" }, records.length === 0 ? "No records yet." : "No records match this view."))
              : displayRecords.map((record) =>
                  h(
                    "tr",
                    { key: record.id },
                    visibleColumns.map((column) =>
                      h(
                        "td",
                        {
                          key: getColumnKey(column),
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
                      withPermission("records.delete", h(
                        "button",
                        {
                          className: "btn btn-sm btn-outline-danger",
                          onClick: () => onDeleteRecord(record),
                        },
                        "Delete",
                      )),
                    ),
                  ),
                ),
          ),
        ),
        ),
      ))
    ),
    renderActiveColumnMenu(),
  );
}

app.RecordsTable = RecordsTable;
})(window.Notcobase, React);
