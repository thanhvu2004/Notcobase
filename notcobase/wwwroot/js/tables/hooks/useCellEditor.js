(function (app, React) {
const { useState } = React;
const { cleanListItems, EditorUtils } = app;

function useCellEditor() {
  const [cellEditor, setCellEditor] = useState(null);

  const openCellEditor = (event, record, column) => {
    const currentValue = record.data?.[column.name];
    let componentPropsJson = {};
    try {
      componentPropsJson = typeof column.componentPropsJson === "string" 
        ? JSON.parse(column.componentPropsJson) 
        : (column.componentPropsJson || {});
    } catch (e) {
      // ignore parse errors
    }
    
    const defaultVal = componentPropsJson?.defaultValue ?? "";
    setCellEditor({
      recordId: record.id,
      columnName: column.name,
      fieldType: column.fieldType,
      isRequired: column.isRequired,
      value: column.fieldType === "select" ? (currentValue ?? defaultVal) : (currentValue ?? ""),
      componentPropsJson: componentPropsJson,
      position: EditorUtils.getEditorPosition(event.currentTarget),
    });
  };

  const updateCellEditorValue = (value) => {
    setCellEditor((editor) => (editor ? { ...editor, value } : editor));
  };

  const closeCellEditor = () => {
    setCellEditor(null);
  };

  return {
    cellEditor,
    setCellEditor,
    openCellEditor,
    updateCellEditorValue,
    closeCellEditor,
  };
}

app.useCellEditor = useCellEditor;
})(window.Notcobase, React);
