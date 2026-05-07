(function (app, React) {
const { useState } = React;

function useColumnState() {
  const [columns, setColumns] = useState([]);
  const [editingColumn, setEditingColumn] = useState(null);
  const [fieldForm, setFieldForm] = useState({
    name: "",
    fieldType: "text",
    isRequired: false,
  });
  const [editFieldForm, setEditFieldForm] = useState({
    name: "",
    fieldType: "text",
    isRequired: false,
  });

  const openEditColumn = (column) => {
    setEditingColumn(column);
    setEditFieldForm({
      name: column.name || "",
      fieldType: column.fieldType || "text",
      isRequired: Boolean(column.isRequired),
    });
  };

  const resetFieldForm = () => {
    setFieldForm({ name: "", fieldType: "text", isRequired: false });
  };

  const resetEditFieldForm = () => {
    setEditingColumn(null);
  };

  return {
    columns,
    setColumns,
    editingColumn,
    setEditingColumn,
    fieldForm,
    setFieldForm,
    editFieldForm,
    setEditFieldForm,
    openEditColumn,
    resetFieldForm,
    resetEditFieldForm,
  };
}

app.useColumnState = useColumnState;
})(window.Notcobase, React);
