(function (app, React) {
  const h = React.createElement;

  function CellEditorPopup({
    editor,
    saving,
    onValueChange,
    onListItemChange,
    onListItemRemove,
    onNewItemChange,
    onSave,
    onCancel,
  }) {
    const inputType = editor.fieldType === "number" ? "number" : editor.fieldType === "date" ? "date" : editor.fieldType === "select" ? "select" : "text";

    return h(
      "div",
      {
        className: "position-fixed bg-white border rounded shadow p-3",
        style: {
          left: editor.position?.left ?? 12,
          top: editor.position?.top ?? 12,
          width: 320,
          maxWidth: "50vw",
          maxHeight: "15vh",
          overflowY: "auto",
          zIndex: 1080,
        },
        onClick: (event) => event.stopPropagation(),
      },
      h(
        "div",
        { className: "small fw-semibold mb-2" },
        editor.fieldType === "select" ? "Select value" : "Edit value",
      ),
      editor.fieldType === "reference"
        ? h(
            "div",
            { className: "mb-3" },
            h(app.ReferenceField.ReferencePicker, {
              value: editor.value,
              componentPropsJson: editor.componentPropsJson,
              parentRecordId: editor.recordId,
              pickerVariant: editor.componentPropsJson?.relationshipMode === "related" ? "table" : undefined,
              placeholder: "Select records",
              onChange: onValueChange,
            }),
          )
        : editor.fieldType === "checkbox"
        ? h(
            "div",
            { className: "form-check mb-3" },
            h("input", {
              id: `cell-${editor.recordId}-${editor.columnName}`,
              className: "form-check-input",
              type: "checkbox",
              checked: Boolean(editor.value),
              onChange: (event) => onValueChange(event.target.checked),
            }),
            h(
              "label",
              { className: "form-check-label", htmlFor: `cell-${editor.recordId}-${editor.columnName}` },
              "Checked",
            ),
          )
        : editor.fieldType === "select"
          ? h(
              "div",
              null,
              h(
                "select",
                {
                  className: "form-control form-control-sm mb-3",
                  value: editor.value ?? "",
                  onChange: (event) => onValueChange(event.target.value),
                },
                h("option", { value: "" }, "-- Select --"),
                (editor.componentPropsJson?.options || []).map((option) =>
                  h("option", { key: option, value: option }, option)
                )
              )
            )
          : h("input", {
              className: "form-control form-control-sm mb-3",
              autoFocus: true,
              type: inputType,
              required: editor.isRequired,
              value: editor.value,
              onChange: (event) => onValueChange(event.target.value),
            }),
      h(
        "div",
        { className: "d-flex justify-content-end gap-2" },
        h("button", { type: "button", className: "btn btn-sm btn-outline-secondary", onClick: onCancel }, "Cancel"),
        h("button", { type: "button", className: "btn btn-sm btn-primary", disabled: saving, onClick: onSave }, saving ? "Saving..." : "Save"),
      ),
    );
  }

  app.CellEditorPopup = CellEditorPopup;
})(window.Notcobase, React);
