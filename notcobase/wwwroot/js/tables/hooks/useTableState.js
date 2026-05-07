(function (app, React) {
const { useState } = React;
const { TableOperations } = app;

function useTableState() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [editingTable, setEditingTable] = useState(null);
  const [tableForm, setTableForm] = useState({
    name: "",
    description: "",
    inheritProperties: false,
    parentTableId: "",
  });
  const [editTableForm, setEditTableForm] = useState({
    name: "",
    description: "",
    inheritProperties: false,
    parentTableId: "",
  });

  const fetchTables = async () => {
    return await TableOperations.fetchTables();
  };

  const fetchTableDetails = async (table) => {
    return await TableOperations.fetchTableDetails(table.id);
  };

  const openEditTable = (table) => {
    setEditingTable(table);
    setEditTableForm({
      name: table.name || "",
      description: table.description || "",
      inheritProperties: Boolean(table.inheritProperties),
      parentTableId: table.parentTableId ? String(table.parentTableId) : "",
    });
  };

  const resetTableForm = () => {
    setTableForm({
      name: "",
      description: "",
      inheritProperties: false,
      parentTableId: "",
    });
  };

  const resetEditTableForm = () => {
    setEditingTable(null);
  };

  return {
    tables,
    setTables,
    selectedTable,
    setSelectedTable,
    editingTable,
    setEditingTable,
    tableForm,
    setTableForm,
    editTableForm,
    setEditTableForm,
    fetchTables,
    fetchTableDetails,
    openEditTable,
    resetTableForm,
    resetEditTableForm,
  };
}

app.useTableState = useTableState;
})(window.Notcobase, React);
