(function (app, React) {
const { useState } = React;
const { cleanListItems, EditorUtils } = app;

function useCellEditor() {
  const [cellEditor, setCellEditor] = useState(null);

  const openCellEditor = (event, record, column) => {
    const currentValue = record.data?.[column.name];
    setCellEditor({
      recordId: record.id,
      columnName: column.name,
      fieldType: column.fieldType,
      isRequired: column.isRequired,
      value: column.fieldType === "list" ? [...cleanListItems(currentValue)] : (currentValue ?? ""),
      newItem: "",
      position: EditorUtils.getEditorPosition(event.currentTarget),
    });
  };

  const updateCellEditorValue = (value) => {
    setCellEditor((editor) => (editor ? { ...editor, value } : editor));
  };

  const updateCellEditorListItem = (itemIndex, value) => {
    setCellEditor((editor) => {
      if (!editor || !Array.isArray(editor.value)) return editor;

      const items = [...editor.value];
      items[itemIndex] = value;
      return { ...editor, value: items };
    });
  };

  const removeCellEditorListItem = (itemIndex) => {
    setCellEditor((editor) => {
      if (!editor || !Array.isArray(editor.value)) return editor;

      const items = editor.value.filter((_, index) => index !== itemIndex);
      return { ...editor, value: items };
    });
  };

  const closeCellEditor = () => {
    setCellEditor(null);
  };

  return {
    cellEditor,
    setCellEditor,
    openCellEditor,
    updateCellEditorValue,
    updateCellEditorListItem,
    removeCellEditorListItem,
    closeCellEditor,
  };
}

app.useCellEditor = useCellEditor;
})(window.Notcobase, React);
