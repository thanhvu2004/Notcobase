(function (app, React) {
const { useEffect, useMemo, useState } = React;
const h = React.createElement;
const {
  CellEditorPopup,
  coerceRecordValue,
  TableOperations,
  ColumnOperations,
  RecordOperations,
  useTableState,
  useColumnState,
  useRecordState,
  useCellEditor,
  TablesList,
  TableHeader,
  TableStats,
  FieldsList,
  RecordsTable,
  CreateTableModal,
  EditTableModal,
  CreateRecordModal,
  EditFieldModal,
} = app;

function can(permission) {
  if (!permission) {
    return true;
  }

  return window.Auth?.hasPermission(permission);
}

function withPermission(permission, component) {
  return can(permission)
    ? component
    : null;
}

function TablesApp() {
  // State management using custom hooks
  const tableState = useTableState();
  const columnState = useColumnState();
  const recordState = useRecordState(columnState.columns);
  const cellEditorState = useCellEditor();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [showCreateRecord, setShowCreateRecord] = useState(false);


  const selectedTableId = tableState.selectedTable?.id;
  const parentTableOptions = tableState.tables;
  const activeTable = useMemo(
    () => tableState.tables.find((table) => table.id === selectedTableId) || tableState.selectedTable,
    [tableState.tables, tableState.selectedTable, selectedTableId],
  );

  useEffect(() => {
    fetchTables();
  }, []);

  useEffect(() => {
    recordState.resetRecordForm();
  }, [columnState.columns]);

  const fetchTables = async () => {
    try {
      setLoading(true);
      const tables = await tableState.fetchTables();
      tableState.setTables(tables);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableDetails = async (table) => {
    try {
      tableState.setSelectedTable(table);
      setLoading(true);
      const { columns, records } = await tableState.fetchTableDetails(table);
      columnState.setColumns(columns);
      recordState.setRecords(records);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshSelectedTable = async () => {
    if (!selectedTableId) return;

    const { columns, records } = await tableState.fetchTableDetails(tableState.selectedTable);
    columnState.setColumns(columns);
    recordState.setRecords(records);
    await fetchTables();
  };

  const createTable = async (event) => {
    event.preventDefault();
    if (!tableState.tableForm.name.trim()) return;

    try {
      setSaving(true);
      const payload = {
        name: tableState.tableForm.name.trim(),
        description: tableState.tableForm.description,
        inheritProperties: tableState.tableForm.inheritProperties,
        parentTableId: tableState.tableForm.inheritProperties ? Number(tableState.tableForm.parentTableId) : null,
      };

      const table = await TableOperations.createTable(payload);
      tableState.resetTableForm();
      setShowCreateTable(false);
      await fetchTables();
      await fetchTableDetails(table);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateTable = async (event) => {
    event.preventDefault();
    if (!tableState.editingTable || !tableState.editTableForm.name.trim()) return;

    try {
      setSaving(true);
      const payload = {
        name: tableState.editTableForm.name.trim(),
        description: tableState.editTableForm.description,
        inheritProperties: tableState.editTableForm.inheritProperties,
        parentTableId: tableState.editTableForm.inheritProperties ? Number(tableState.editTableForm.parentTableId) : null,
      };

      await TableOperations.updateTable(tableState.editingTable.id, payload);

      tableState.setSelectedTable((table) =>
        table?.id === tableState.editingTable.id
          ? {
              ...table,
              ...payload,
              parentTableName: payload.parentTableId
                ? tableState.tables.find((item) => item.id === payload.parentTableId)?.name || table.parentTableName
                : null,
            }
          : table,
      );
      tableState.resetEditTableForm();
      await refreshSelectedTable();
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteTable = async (table) => {
    if (!window.confirm(`Delete "${table.name}" and all of its data?`)) return;

    try {
      await TableOperations.deleteTable(table.id);
      if (selectedTableId === table.id) {
        tableState.setSelectedTable(null);
        columnState.setColumns([]);
        recordState.setRecords([]);
      }
      await fetchTables();
    } catch (err) {
      setError(err.message);
    }
  };

  const createColumn = async (event) => {
    event.preventDefault();
    if (!selectedTableId || !columnState.fieldForm.name.trim()) return;

    try {
      setSaving(true);
      await ColumnOperations.createColumn(selectedTableId, columnState.fieldForm);
      columnState.resetFieldForm();
      await refreshSelectedTable();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateColumn = async (event) => {
    event.preventDefault();
    if (!selectedTableId || !columnState.editingColumn || !columnState.editFieldForm.name.trim()) return;

    try {
      setSaving(true);
      const data = {
        name: columnState.editFieldForm.name.trim(),
        fieldType: columnState.editFieldForm.fieldType,
        isRequired: columnState.editFieldForm.isRequired,
      };
      await ColumnOperations.updateColumn(selectedTableId, columnState.editingColumn.id, data);
      columnState.resetEditFieldForm();
      await refreshSelectedTable();
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteColumn = async (column) => {
    if (!window.confirm(`Delete field "${column.name}"? Existing record data will remain hidden.`)) return;

    try {
      await ColumnOperations.deleteColumn(selectedTableId, column.id);
      await refreshSelectedTable();
    } catch (err) {
      setError(err.message);
    }
  };

  const createRecord = async (event) => {
    event.preventDefault();
    if (!selectedTableId || columnState.columns.length === 0) return;

    const data = columnState.columns.reduce((values, column) => {
      const rawValue = recordState.recordForm[column.name];
      const coercedValue = coerceRecordValue(rawValue, column.fieldType);

      // Skip undefined or empty optional values
      if (
        coercedValue === undefined ||
        coercedValue === null ||
        (typeof coercedValue === "string" && coercedValue.trim() === "")
      ) {
        // Still allow required fields to pass through
        if (column.isRequired) {
          values[column.name] = coercedValue;
        }

        return values;
      }

      values[column.name] = coercedValue;
      return values;
    }, {});

    try {
      setSaving(true);
      await RecordOperations.createRecord(selectedTableId, data);
      setShowCreateRecord(false);
      recordState.resetRecordForm();
      await refreshSelectedTable();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (record) => {
    if (!window.confirm("Delete this record?")) return;

    try {
      await RecordOperations.deleteRecord(selectedTableId, record.id);
      await refreshSelectedTable();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveCellEditor = async () => {
    if (!cellEditorState.cellEditor || !selectedTableId) return;

    const record = recordState.records.find((item) => item.id === cellEditorState.cellEditor.recordId);
    if (!record) return;

    const data = { ...(record.data || {}) };
    if (cellEditorState.cellEditor.fieldType === "list") {
      const { cleanListItems } = window.Notcobase;
      data[cellEditorState.cellEditor.columnName] = cleanListItems([
        ...(Array.isArray(cellEditorState.cellEditor.value) ? cellEditorState.cellEditor.value : []),
        cellEditorState.cellEditor.newItem,
      ]);
    } else {
      data[cellEditorState.cellEditor.columnName] = coerceRecordValue(cellEditorState.cellEditor.value, cellEditorState.cellEditor.fieldType);
    }

    try {
      setSaving(true);
      await RecordOperations.updateRecord(selectedTableId, record.id, data);
      cellEditorState.closeCellEditor();
      await refreshSelectedTable();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return h(
    "div",
    { className: "container-fluid py-4" },
    h(
      "div",
      { className: "d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4" },
      h(
        "div",
        null,
        h("h1", { className: "h3 mb-1" }, "Notcobase"),
      ),
      h(
        "div",
        { className: "d-flex gap-2" },
        h("button", { className: "btn btn-outline-secondary", onClick: fetchTables }, "Refresh"),
        withPermission(
          "tables.create",
          h(
            "button",
            {
              className: "btn btn-primary",
              onClick: () => setShowCreateTable(true)
            },
            "Create table"
          )
        ),
      ),
    ),

    error && h("div", { className: "alert alert-danger" }, error),

    h(
      "div",
      { className: "row g-4" },
      h(
        TablesList,
        {
          tables: tableState.tables,
          selectedTableId: selectedTableId,
          loading: loading,
          onSelectTable: fetchTableDetails,
        },
      ),

      h(
        "main",
        { className: "col-lg-9" },
        !activeTable
          ? h(
              "div",
              { className: "border rounded bg-light p-5 text-center" },
              h("h2", { className: "h5" }, "Select or create a table"),
            )
          : h(
              "div",
              null,
              h(
                TableHeader,
                {
                  activeTable: activeTable,
                  onEdit: () => tableState.openEditTable(activeTable),
                  onDelete: () => deleteTable(activeTable),
                  onAddRecord: () => setShowCreateRecord(true),
                  disableAddRecord: columnState.columns.length === 0,
                },
              ),

              h(
                "div",
                { className: "row g-3 mb-4" },
                h(
                  FieldsList,
                  {
                    columns: columnState.columns,
                    fieldForm: columnState.fieldForm,
                    onFieldFormChange: columnState.setFieldForm,
                    onAddField: createColumn,
                    onEditField: columnState.openEditColumn,
                    onDeleteField: deleteColumn,
                    saving: saving,
                  },
                ),
                h(
                  TableStats,
                  {
                    columnsCount: columnState.columns.length,
                    recordsCount: recordState.records.length,
                    totalRecords: activeTable.recordCount || recordState.records.length,
                  },
                ),
              ),

              h(
                RecordsTable,
                {
                  columns: columnState.columns,
                  records: recordState.records,
                  onEditCell: cellEditorState.openCellEditor,
                  onDeleteRecord: deleteRecord,
                },
              ),
            ),
      ),
    ),

    withPermission(
      "tables.create",
      h(
        CreateTableModal,
        {
          isOpen: showCreateTable,
          tableForm: tableState.tableForm,
          parentTableOptions: parentTableOptions,
          onFormChange: tableState.setTableForm,
          onSubmit: createTable,
          onClose: () => setShowCreateTable(false),
          saving: saving,
        },
      )
    ),

    withPermission(
      "tables.edit",
      h(
        EditTableModal,
        {
          isOpen: !!tableState.editingTable,
          editingTable: tableState.editingTable,
          editTableForm: tableState.editTableForm,
          tables: tableState.tables,
          onFormChange: tableState.setEditTableForm,
          onSubmit: updateTable,
          onClose: tableState.resetEditTableForm,
          saving: saving,
        },
      )
    ),

    withPermission(
      "records.create",
      h(
        CreateRecordModal,
        {
          isOpen: showCreateRecord,
          activeTable: activeTable,
          columns: columnState.columns,
          recordForm: recordState.recordForm,
          onRecordFormChange: recordState.setRecordForm,
          onListItemChange: recordState.setListItem,
          onAddListItem: recordState.addListItem,
          onRemoveListItem: recordState.removeListItem,
          onSubmit: createRecord,
          onClose: () => setShowCreateRecord(false),
          saving: saving,
        },
      )
    ),

    withPermission(
      "columns.edit",
      h(
        EditFieldModal,
        {
          isOpen: !!columnState.editingColumn,
          editingColumn: columnState.editingColumn,
          editFieldForm: columnState.editFieldForm,
          onFormChange: columnState.setEditFieldForm,
          onSubmit: updateColumn,
          onClose: columnState.resetEditFieldForm,
          saving: saving,
        },
      )
    ),

    cellEditorState.cellEditor &&
      withPermission(
        "records.edit",
        h(CellEditorPopup, {
          editor: cellEditorState.cellEditor,
          saving,
          onValueChange: cellEditorState.updateCellEditorValue,
          onListItemChange: cellEditorState.updateCellEditorListItem,
          onListItemRemove: cellEditorState.removeCellEditorListItem,
          onNewItemChange: (value) => cellEditorState.setCellEditor({ ...cellEditorState.cellEditor, newItem: value }),
          onSave: saveCellEditor,
          onCancel: cellEditorState.closeCellEditor,
        })
      ),
  );
}

app.TablesApp = TablesApp;
})(window.Notcobase, React);
